import { Router } from "express";
import { db, supplierPricesTable, profilesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const serialize = (p: typeof supplierPricesTable.$inferSelect) => ({
  ...p,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});

// GET /api/prices/mine — قائمة أسعار المورد الحالي
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(supplierPricesTable)
      .where(eq(supplierPricesTable.supplier_id, req.userId!))
      .orderBy(desc(supplierPricesTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch my prices");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prices — المورد يضيف سعر منتج
router.post("/", requireAuth, async (req, res) => {
  const { product_name, category, unit, price } = req.body ?? {};
  if (!product_name || !category || !unit || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "جميع الحقول مطلوبة" });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: "السعر يجب أن يكون رقماً موجباً" });
  }

  try {
    const profiles = await db.select().from(profilesTable).where(eq(profilesTable.user_id, req.userId!)).limit(1);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "أكمل ملفك الشخصي أولاً" });
    if (profile.role !== "supplier") {
      return res.status(403).json({ error: "قائمة الأسعار متاحة للموردين فقط" });
    }

    const inserted = await db.insert(supplierPricesTable).values({
      supplier_id: req.userId!,
      supplier_company: profile.company_name,
      product_name,
      category,
      unit,
      price: priceNum.toFixed(2),
    }).returning();

    return res.status(201).json(serialize(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to create price");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/prices/:id — المورد يحذف سعراً من قائمته فقط
router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  try {
    const deleted = await db.delete(supplierPricesTable)
      .where(and(eq(supplierPricesTable.id, id), eq(supplierPricesTable.supplier_id, req.userId!)))
      .returning();
    if (!deleted.length) return res.status(404).json({ error: "السعر غير موجود" });
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete price");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
