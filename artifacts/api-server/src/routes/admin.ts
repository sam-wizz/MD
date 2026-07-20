import { Router } from "express";
import { db, ordersTable, profilesTable, supplierPricesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// كل مسارات الإدارة تتطلب توثيقاً + صلاحية إدارة
router.use(requireAuth, requireAdmin);

const serializeOrder = (o: typeof ordersTable.$inferSelect) => ({
  ...o,
  created_at: o.created_at.toISOString(),
  updated_at: o.updated_at.toISOString(),
});

const serializeProfile = (p: typeof profilesTable.$inferSelect) => ({
  ...p,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});

// GET /api/admin/orders?status= — كل الطلبات
router.get("/orders", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const validStatuses = ["pending", "approved", "assigned", "preparing", "in_transit", "delivered", "rejected", "cancelled"];
    const base = db.select().from(ordersTable);
    const rows = status && validStatuses.includes(status)
      ? await base.where(eq(ordersTable.status, status as any)).orderBy(desc(ordersTable.created_at))
      : await base.orderBy(desc(ordersTable.created_at));
    return res.json(rows.map(serializeOrder));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/orders/:id — موافقة / رفض / إسناد لمورد
router.patch("/orders/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  const { action, supplier_id, admin_notes } = req.body ?? {};
  if (!["approve", "reject", "assign"].includes(action)) {
    return res.status(400).json({ error: "إجراء غير صالح" });
  }

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    const patch: Partial<typeof ordersTable.$inferInsert> = { updated_at: new Date() };
    if (admin_notes !== undefined) patch.admin_notes = admin_notes || null;

    if (action === "approve") {
      if (order.status !== "pending") return res.status(409).json({ error: "الطلب ليس بانتظار الموافقة" });
      patch.status = "approved";
    } else if (action === "reject") {
      if (!["pending", "approved"].includes(order.status)) {
        return res.status(409).json({ error: "لا يمكن رفض الطلب في حالته الحالية" });
      }
      patch.status = "rejected";
    } else {
      // assign
      if (!supplier_id) return res.status(400).json({ error: "حدد المورد المراد الإسناد إليه" });
      if (!["pending", "approved"].includes(order.status)) {
        return res.status(409).json({ error: "لا يمكن الإسناد في حالة الطلب الحالية" });
      }
      const suppliers = await db.select().from(profilesTable)
        .where(eq(profilesTable.user_id, supplier_id)).limit(1);
      const supplier = suppliers[0];
      if (!supplier || supplier.role !== "supplier") {
        return res.status(404).json({ error: "المورد غير موجود" });
      }
      if (supplier.status !== "approved") {
        return res.status(409).json({ error: "المورد غير معتمد بعد" });
      }
      patch.status = "assigned";
      patch.assigned_supplier_id = supplier.user_id;
      patch.assigned_supplier_company = supplier.company_name;
      patch.assigned_supplier_region = supplier.country || null;
    }

    const updated = await db.update(ordersTable).set(patch).where(eq(ordersTable.id, id)).returning();
    return res.json(serializeOrder(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to act on order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/orders/:id/recommend — الذكاء الاصطناعي يرشح أقل مورد سعراً
router.post("/orders/:id/recommend", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    // أسعار الموردين في تصنيف الطلب، وإن لم توجد نقارن بكل الأسعار
    let prices = await db.select().from(supplierPricesTable)
      .where(eq(supplierPricesTable.category, order.product_category)).limit(300);
    if (!prices.length) {
      prices = await db.select().from(supplierPricesTable).limit(300);
    }
    if (!prices.length) {
      return res.status(422).json({ error: "لا توجد أسعار موردين مسجلة للمقارنة — اطلب من الموردين إدخال أسعارهم" });
    }

    const priceList = prices
      .map((p) => `${p.supplier_id} | ${p.supplier_company} | ${p.product_name} | ${p.unit} | ${p.price} ريال`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content:
            "أنت مساعد مشتريات لإدارة منصة توريدات مَـد. مهمتك ترشيح المورد الأقل تكلفة إجمالية لطلب منشأة، بناء على أسعار الموردين المسجلة في المنصة فقط. أجب بـ JSON فقط.",
        },
        {
          role: "user",
          content: `الطلب:\n- التصنيف: ${order.product_category}\n- الأصناف المطلوبة: ${order.items}\n- منطقة التوصيل: ${order.delivery_region}\n\nأسعار الموردين (معرف المورد | الشركة | المنتج | الوحدة | السعر):\n${priceList}\n\nقدّر التكلفة الإجمالية للطلب لدى كل مورد يغطي الأصناف (طابق الأصناف بأقرب منتج)، ثم رشّح الأقل تكلفة. أعد JSON بهذا الشكل حرفياً:\n{"supplier_id":"","supplier_company":"","estimated_total":"","currency":"SAR","reasoning_ar":"","ranking":[{"supplier_id":"","supplier_company":"","estimated_total":"","coverage_note":""}]}\n\nقواعد: supplier_id يجب أن يكون من القائمة أعلاه حرفياً. reasoning_ar بالعربية في جملتين تشرحان سبب الاختيار ونسبة تغطية الأصناف. رتّب ranking من الأرخص للأغلى.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      req.log.error({ raw: raw.slice(0, 500) }, "AI returned non-JSON recommendation");
      return res.status(502).json({ error: "تعذر توليد التوصية — حاول مرة أخرى" });
    }
    let recommendation: any;
    try {
      recommendation = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return res.status(502).json({ error: "تعذر توليد التوصية — حاول مرة أخرى" });
    }

    // تحقق أن المورد المرشح موجود فعلاً في الأسعار المرسلة
    const validIds = new Set(prices.map((p) => p.supplier_id));
    if (!recommendation.supplier_id || !validIds.has(recommendation.supplier_id)) {
      recommendation.supplier_id = prices[0].supplier_id;
      recommendation.supplier_company = prices[0].supplier_company;
    }

    const updated = await db.update(ordersTable)
      .set({ ai_recommendation: JSON.stringify(recommendation), updated_at: new Date() })
      .where(eq(ordersTable.id, id))
      .returning();

    return res.json(serializeOrder(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to generate AI recommendation");
    return res.status(500).json({ error: "تعذر توليد التوصية حالياً" });
  }
});

// GET /api/admin/profiles?status= — حسابات المستخدمين
router.get("/profiles", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const base = db.select().from(profilesTable);
    const rows = status && ["pending", "approved", "rejected"].includes(status)
      ? await base.where(eq(profilesTable.status, status as any)).orderBy(desc(profilesTable.created_at))
      : await base.orderBy(desc(profilesTable.created_at));
    return res.json(rows.map(serializeProfile));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch profiles");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/profiles/:id — اعتماد أو رفض حساب
router.patch("/profiles/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  const { status } = req.body ?? {};
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }

  try {
    const updated = await db.update(profilesTable)
      .set({ status, updated_at: new Date() })
      .where(eq(profilesTable.id, id))
      .returning();
    if (!updated.length) return res.status(404).json({ error: "الحساب غير موجود" });
    return res.json(serializeProfile(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update profile status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/prices — كل أسعار الموردين
router.get("/prices", async (req, res) => {
  try {
    const rows = await db.select().from(supplierPricesTable).orderBy(desc(supplierPricesTable.created_at));
    return res.json(rows.map((p) => ({
      ...p,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch all prices");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
