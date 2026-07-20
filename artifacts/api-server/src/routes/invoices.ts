import { Router } from "express";
import { db, invoiceAnalysesTable, supplierPricesTable, profilesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AI_MODEL } from "../lib/ai";

const router = Router();

const serialize = (r: typeof invoiceAnalysesTable.$inferSelect) => ({
  ...r,
  created_at: r.created_at.toISOString(),
});

/** يلتقط أول JSON صالح من رد النموذج (مع أو بدون أسوار كود). */
function extractJson(text: string): any {
  const cleaned = text.replace(/```json/gi, "```").split("```").map((s) => s.trim()).find((s) => s.startsWith("{")) ?? text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in AI response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// POST /api/invoices/analyze — رفع صورة فاتورة سابقة وتحليلها ومقارنتها بأسعار المنصة
router.post("/analyze", requireAuth, async (req, res) => {
  const { file_base64, mime_type, file_name } = req.body ?? {};
  if (!file_base64 || !mime_type) {
    return res.status(400).json({ error: "ملف الفاتورة مطلوب" });
  }
  if (typeof file_base64 !== "string" || file_base64.length > 14_000_000) {
    return res.status(413).json({ error: "حجم الملف كبير جداً — الحد الأقصى ١٠ ميجابايت" });
  }
  if (!/^image\/(png|jpe?g|webp)$/i.test(mime_type)) {
    return res.status(400).json({ error: "صيغة غير مدعومة — ارفع صورة الفاتورة (JPG أو PNG)" });
  }

  try {
    const profiles = await db.select().from(profilesTable).where(eq(profilesTable.user_id, req.userId!)).limit(1);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "أكمل ملفك الشخصي أولاً" });
    if (profile.role !== "business_owner") {
      return res.status(403).json({ error: "تحليل الفواتير متاح لأصحاب المنشآت فقط" });
    }

    const prices = await db.select({
      supplier_id: supplierPricesTable.supplier_id,
      supplier_company: supplierPricesTable.supplier_company,
      product_name: supplierPricesTable.product_name,
      category: supplierPricesTable.category,
      unit: supplierPricesTable.unit,
      price: supplierPricesTable.price,
    }).from(supplierPricesTable).limit(500);

    const priceList = prices.map((p) => `${p.product_name} | ${p.unit} | ${p.price} ريال | ${p.supplier_company}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "أنت محلل مشتريات لمنصة توريدات مَـد السعودية. تستخرج أصناف فاتورة المنشأة من الصورة وتقارنها بأسعار موردي المنصة. أجب بـ JSON فقط دون أي نص آخر.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `استخرج الأصناف من صورة الفاتورة المرفقة، ثم قارن كل صنف بأقرب منتج مطابق من قائمة أسعار المنصة أدناه (إن وُجد).\n\nقائمة أسعار المنصة (المنتج | الوحدة | السعر | المورد):\n${priceList || "(لا توجد أسعار مسجلة بعد)"}\n\nأعد JSON بهذا الشكل حرفياً:\n{"items":[{"name":"","quantity":"","unit":"","price":""}],"invoice_total":"","comparison":[{"item":"","invoice_price":"","platform_price":"","platform_supplier":"","note":""}],"platform_total":"","potential_saving":"","summary_ar":""}\n\nقواعد: الأسعار أرقام نصية بالريال. إن لم يوجد منتج مطابق في المنصة اجعل platform_price و platform_supplier فارغين واذكر ذلك في note. potential_saving = إجمالي الفاتورة ناقص إجمالي المنصة للأصناف المطابقة فقط (إن كان سالباً فالمنصة أغلى — اذكرها بصراحة في summary_ar). اكتب summary_ar بالعربية في ٢-٣ جمل واضحة لصاحب منشأة.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime_type};base64,${file_base64}` },
            },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      req.log.error({ raw: raw.slice(0, 500) }, "AI returned non-JSON for invoice analysis");
      return res.status(502).json({ error: "تعذر قراءة الفاتورة — جرب صورة أوضح" });
    }

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return res.status(422).json({ error: "لم يتم التعرف على أصناف في الصورة — تأكد أنها فاتورة واضحة" });
    }

    const inserted = await db.insert(invoiceAnalysesTable).values({
      business_id: req.userId!,
      file_name: file_name || null,
      extracted_items: JSON.stringify(parsed.items ?? []),
      invoice_total: parsed.invoice_total ? String(parsed.invoice_total) : null,
      comparison: JSON.stringify(parsed.comparison ?? []),
      platform_total: parsed.platform_total ? String(parsed.platform_total) : null,
      potential_saving: parsed.potential_saving ? String(parsed.potential_saving) : null,
      summary: parsed.summary_ar ? String(parsed.summary_ar) : null,
    }).returning();

    return res.status(201).json(serialize(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to analyze invoice");
    return res.status(500).json({ error: "تعذر تحليل الفاتورة حالياً — حاول مرة أخرى" });
  }
});

// GET /api/invoices/mine — تحليلات الفواتير السابقة لصاحب المنشأة
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(invoiceAnalysesTable)
      .where(eq(invoiceAnalysesTable.business_id, req.userId!))
      .orderBy(desc(invoiceAnalysesTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch invoice analyses");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
