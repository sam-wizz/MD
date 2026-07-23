import { Router } from "express";
import {
  db,
  ordersTable,
  profilesTable,
  orderOffersTable,
  orderStatusHistoryTable,
} from "@workspace/db";
import { eq, desc, or } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, isAdminUser } from "../middlewares/auth";
import {
  acceptOffer,
  rejectOffer,
  transitionOrder,
  deliveryOptionsForSupplier,
  processOrderAutomation,
  type OrderStatus,
} from "../automation";
import { appendStatusHistory } from "../automation/history";
import { orderCreateLimiter } from "../lib/rate-limits";

const router = Router();

const serialize = (o: typeof ordersTable.$inferSelect) => ({
  ...o,
  created_at: o.created_at.toISOString(),
  updated_at: o.updated_at.toISOString(),
  offer_expires_at: o.offer_expires_at?.toISOString() ?? null,
  picked_up_at: o.picked_up_at?.toISOString() ?? null,
  eta: o.eta?.toISOString() ?? null,
  automation_score: o.automation_score != null ? String(o.automation_score) : null,
});

const createOrderBodySchema = z.object({
  product_category: z.string().trim().min(1, "تصنيف المنتجات مطلوب"),
  items: z
    .string()
    .trim()
    .min(10, "وصف الأصناف يجب أن يكون ١٠ أحرف على الأقل"),
  delivery_region: z.string().trim().min(1, "مدينة التسليم مطلوبة"),
  delivery_address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const idempotencyCache = new Map<string, { expiresAt: number; payload: unknown }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function pruneIdempotencyCache() {
  const now = Date.now();
  for (const [k, v] of idempotencyCache) {
    if (v.expiresAt <= now) idempotencyCache.delete(k);
  }
}

async function canViewOrder(
  order: typeof ordersTable.$inferSelect,
  userId: string | undefined,
  userEmail: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  if (order.business_id === userId) return true;
  if (order.assigned_supplier_id === userId) return true;
  if (order.assigned_logistics_id === userId) return true;
  if (order.offered_to_id === userId) return true;
  return isAdminUser(userId, userEmail);
}

// POST /api/orders
router.post("/", requireAuth, orderCreateLimiter, async (req, res) => {
  const userId = req.userId!;

  const body = { ...(req.body ?? {}) } as Record<string, unknown>;
  delete body.business_id;
  delete body.business_company;
  delete body.business_contact;
  delete body.business_phone;
  delete body.user_id;
  delete body.status;

  const parsed = createOrderBodySchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "بيانات الطلب غير صالحة",
    });
  }

  const idempotencyKey = String(
    req.get("idempotency-key") || req.get("Idempotency-Key") || "",
  ).trim();
  if (idempotencyKey) {
    pruneIdempotencyCache();
    const cacheKey = `${userId}:${idempotencyKey}`;
    const cached = idempotencyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(201).json(cached.payload);
    }
  }

  const { product_category, items, delivery_region, delivery_address, notes } =
    parsed.data;

  try {
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, userId))
      .limit(1);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "أكمل ملفك الشخصي أولاً" });
    if (profile.role !== "business_owner") {
      return res.status(403).json({ error: "إنشاء الطلبات متاح لأصحاب المنشآت فقط" });
    }
    if (profile.status !== "approved") {
      return res.status(403).json({ error: "حسابك قيد المراجعة — لا يمكن إنشاء طلبات بعد" });
    }

    const inserted = await db
      .insert(ordersTable)
      .values({
        business_id: userId,
        business_company: profile.company_name,
        business_contact: profile.full_name,
        business_phone: profile.phone || null,
        product_category,
        items,
        delivery_region,
        delivery_address: delivery_address || null,
        notes: notes || null,
        status: "pending",
      })
      .returning();

    await appendStatusHistory({
      orderId: inserted[0].id,
      fromStatus: null,
      toStatus: "pending",
      actorId: userId,
      actorRole: "business_owner",
      actorKind: "user",
      note: "إنشاء الطلب",
    });

    const payload = serialize(inserted[0]);

    if (idempotencyKey) {
      idempotencyCache.set(`${userId}:${idempotencyKey}`, {
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        payload,
      });
    }

    // تشغيل الأتمتة بشكل غير متزامن (ظل أو حي)
    void processOrderAutomation(inserted[0].id);

    return res.status(201).json(payload);
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    return res.status(500).json({ error: "خطأ داخلي في الخادم" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.business_id, req.userId!))
      .orderBy(desc(ordersTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch my orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/assigned", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(
        or(
          eq(ordersTable.assigned_supplier_id, req.userId!),
          eq(ordersTable.assigned_logistics_id, req.userId!),
          eq(ordersTable.offered_to_id, req.userId!),
        ),
      )
      .orderBy(desc(ordersTable.created_at));
    return res.json(rows.map(serialize));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch assigned orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    if (!(await canViewOrder(order, req.userId, req.userEmail))) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    return res.json(serialize(order));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/history", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
    if (!(await canViewOrder(order, req.userId, req.userEmail))) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }
    const history = await db
      .select()
      .from(orderStatusHistoryTable)
      .where(eq(orderStatusHistoryTable.order_id, id))
      .orderBy(desc(orderStatusHistoryTable.created_at));
    return res.json(
      history.map((h) => ({
        ...h,
        created_at: h.created_at.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/offers", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
    const isAdmin = await isAdminUser(req.userId, req.userEmail);
    const isCandidate =
      order.offered_to_id === req.userId ||
      order.assigned_supplier_id === req.userId ||
      order.assigned_logistics_id === req.userId;
    if (!isAdmin && !isCandidate && order.business_id !== req.userId) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }
    // تفاصيل الدرجات للإدارة فقط؛ المرشح يرى عرضه فقط
    const offers = await db
      .select()
      .from(orderOffersTable)
      .where(eq(orderOffersTable.order_id, id))
      .orderBy(orderOffersTable.rank);
    const filtered = isAdmin
      ? offers
      : offers.filter((o) => o.candidate_id === req.userId);
    return res.json(
      filtered.map((o) => ({
        ...o,
        score: o.score != null ? String(o.score) : null,
        offered_at: o.offered_at.toISOString(),
        expires_at: o.expires_at.toISOString(),
        responded_at: o.responded_at?.toISOString() ?? null,
        created_at: o.created_at.toISOString(),
        score_breakdown: isAdmin ? o.score_breakdown : undefined,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch offers");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** خيارات التوصيل للمرشح الحالي */
router.get("/:id/delivery-options", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order || order.offered_to_id !== req.userId) {
      return res.status(404).json({ error: "لا يوجد عرض موجّه إليك" });
    }
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, req.userId!))
      .limit(1);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "الملف غير موجود" });
    if (profile.role === "logistics") {
      return res.json({ supplier_delivery: false, logistics: false, role: "logistics" });
    }
    const opts = deliveryOptionsForSupplier(profile, order.delivery_region);
    return res.json({ ...opts, role: "supplier" });
  } catch (err) {
    req.log.error({ err }, "Failed to get delivery options");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const acceptOfferBodySchema = z.object({
  delivery_mode: z.enum(["supplier_delivery", "logistics"]).optional(),
});

const rejectOfferBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

router.post("/:id/offers/accept", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  const parsed = acceptOfferBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "وضع التوصيل غير صالح" });
  }
  try {
    const result = await acceptOffer({
      orderId: id,
      userId: req.userId!,
      deliveryMode: parsed.data.delivery_mode,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json(serialize(result.order));
  } catch (err) {
    req.log.error({ err }, "Failed to accept offer");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/offers/reject", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  const parsed = rejectOfferBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "سبب الرفض غير صالح" });
  }
  try {
    const result = await rejectOffer({
      orderId: id,
      userId: req.userId!,
      reason: parsed.data.reason,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reject offer");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const statusBodySchema = z.object({
  status: z.enum([
    "preparing",
    "ready_for_pickup",
    "in_transit",
    "delivered",
    "cancelled",
  ]),
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  const parsed = statusBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }
  const { status } = parsed.data;

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    // إخفاء وجود الطلب عن غير المصرح لهم (مثل GET)
    if (!(await canViewOrder(order, req.userId, req.userEmail))) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    const isAdmin = await isAdminUser(req.userId, req.userEmail);
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, req.userId!))
      .limit(1);
    const role = profiles[0]?.role;

    const result = await transitionOrder({
      order,
      to: status as OrderStatus,
      actor: {
        userId: req.userId!,
        role,
        isAdmin,
        kind: isAdmin ? "admin" : "user",
      },
      patch:
        status === "in_transit" && order.status === "ready_for_pickup"
          ? { picked_up_at: new Date() }
          : undefined,
      note: status === "cancelled" ? "إلغاء بواسطة المستخدم" : undefined,
    });

    if (!result.ok) {
      // ملكية مرفوضة → 403؛ انتقال غير صالح → 400
      const statusCode =
        result.error.includes("مصرح") || result.error.includes("فقط") ? 403 : result.status;
      return res.status(statusCode).json({ error: result.error });
    }
    return res.json(serialize(result.order));
  } catch (err) {
    req.log.error({ err }, "Failed to update order status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
