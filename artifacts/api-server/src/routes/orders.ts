import { Router } from "express";
import { db, ordersTable, profilesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, isAdminEmail } from "../middlewares/auth";

const router = Router();

const serialize = (o: typeof ordersTable.$inferSelect) => ({
  ...o,
  created_at: o.created_at.toISOString(),
  updated_at: o.updated_at.toISOString(),
});

// POST /api/orders — صاحب المنشأة ينشئ طلب توريد جديد (الهوية من الجلسة الموثقة فقط)
router.post("/", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { product_category, items, delivery_region, delivery_address, notes, business_phone } = req.body ?? {};

  if (!product_category || !items || !delivery_region) {
    return res.status(400).json({ error: "التصنيف والأصناف ومنطقة التوصيل مطلوبة" });
  }

  try {
    const profiles = await db.select().from(profilesTable).where(eq(profilesTable.user_id, userId)).limit(1);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "أكمل ملفك الشخصي أولاً" });
    if (profile.role !== "business_owner") {
      return res.status(403).json({ error: "إنشاء الطلبات متاح لأصحاب المنشآت فقط" });
    }

    const inserted = await db.insert(ordersTable).values({
      business_id: userId,
      business_company: profile.company_name,
      business_contact: profile.full_name,
      business_phone: business_phone || profile.phone || null,
      product_category,
      items,
      delivery_region,
      delivery_address: delivery_address || null,
      notes: notes || null,
      status: "pending",
    }).returning();

    return res.status(201).json(serialize(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/orders/mine — طلبات صاحب المنشأة نفسه
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(ordersTable)
      .where(eq(ordersTable.business_id, req.userId!))
      .orderBy(desc(ordersTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch my orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/orders/assigned — الطلبات المسندة للمورد الحالي
router.get("/assigned", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(ordersTable)
      .where(eq(ordersTable.assigned_supplier_id, req.userId!))
      .orderBy(desc(ordersTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch assigned orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/orders/:id — يراه صاحبه أو المورد المسند إليه أو الإدارة
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    const allowed =
      order.business_id === req.userId ||
      order.assigned_supplier_id === req.userId ||
      isAdminEmail(req.userEmail);
    if (!allowed) return res.status(404).json({ error: "الطلب غير موجود" });

    return res.json(serialize(order));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/orders/:id/status — المورد المسند يقدّم الحالة خطوة واحدة فقط، وصاحب الطلب يلغي وهو قيد المراجعة
// تسلسل صارم: assigned → preparing → in_transit → delivered (بدون تخطٍ أو رجوع)
const SUPPLIER_TRANSITIONS: Record<string, string> = {
  assigned: "preparing",
  preparing: "in_transit",
  in_transit: "delivered",
};

router.patch("/:id/status", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  const { status } = req.body ?? {};
  const allowedStatuses = ["preparing", "in_transit", "delivered", "cancelled"] as const;
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    const isOwner = order.business_id === req.userId;
    const isAssignedSupplier = order.assigned_supplier_id === req.userId;
    const isAdmin = isAdminEmail(req.userEmail);

    if (status === "cancelled") {
      // الإلغاء: صاحب الطلب (أو الإدارة) فقط، وفقط ما دام الطلب قيد المراجعة
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "غير مصرح بإلغاء هذا الطلب" });
      }
      if (order.status !== "pending") {
        return res.status(409).json({ error: "لا يمكن إلغاء الطلب بعد اعتماده — تواصل مع الإدارة" });
      }
    } else {
      // تقدّم الحالة: المورد المسند (أو الإدارة) فقط، خطوة واحدة للأمام حسب التسلسل
      if (!isAssignedSupplier && !isAdmin) {
        return res.status(403).json({ error: "غير مصرح بتحديث هذا الطلب" });
      }
      if (SUPPLIER_TRANSITIONS[order.status] !== status) {
        return res.status(409).json({ error: "تسلسل الحالة غير صحيح — لا يمكن تخطي المراحل أو الرجوع" });
      }
    }

    // تحديث ذري: نشترط الحالة الحالية في WHERE لتفادي حالات السباق
    const updated = await db.update(ordersTable)
      .set({ status, updated_at: new Date() })
      .where(and(eq(ordersTable.id, id), eq(ordersTable.status, order.status)))
      .returning();
    if (!updated[0]) {
      return res.status(409).json({ error: "تغيّرت حالة الطلب للتو — حدّث الصفحة وحاول مجدداً" });
    }

    return res.json(serialize(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update order status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
