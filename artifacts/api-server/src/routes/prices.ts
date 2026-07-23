import { Router } from "express";
import { db, supplierPricesTable, profilesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const serialize = (p: typeof supplierPricesTable.$inferSelect) => ({
  ...p,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});

const priceBodySchema = z.object({
  product_name: z.string().trim().min(1, "اسم المنتج مطلوب"),
  category: z.string().trim().min(1, "التصنيف مطلوب"),
  unit: z.string().trim().min(1, "الوحدة مطلوبة"),
  price: z.coerce.number().positive("السعر يجب أن يكون رقماً موجباً"),
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(supplierPricesTable)
      .where(eq(supplierPricesTable.supplier_id, req.userId!))
      .orderBy(desc(supplierPricesTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch my prices");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = priceBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
    });
  }
  const { product_name, category, unit, price } = parsed.data;

  try {
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, req.userId!))
      .limit(1);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "أكمل ملفك الشخصي أولاً" });
    if (profile.role !== "supplier") {
      return res.status(403).json({ error: "قائمة الأسعار متاحة للموردين فقط" });
    }

    const inserted = await db
      .insert(supplierPricesTable)
      .values({
        supplier_id: req.userId!,
        supplier_company: profile.company_name,
        product_name,
        category,
        unit,
        price: price.toFixed(2),
      })
      .returning();

    return res.status(201).json(serialize(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to create price");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  try {
    const deleted = await db
      .delete(supplierPricesTable)
      .where(
        and(
          eq(supplierPricesTable.id, id),
          eq(supplierPricesTable.supplier_id, req.userId!),
        ),
      )
      .returning();
    if (!deleted.length) return res.status(404).json({ error: "السعر غير موجود" });
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete price");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
