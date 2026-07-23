import { Router } from "express";
import {
  db,
  ordersTable,
  profilesTable,
  supplierPricesTable,
  automationSettingsTable,
  orderOffersTable,
  orderStatusHistoryTable,
} from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AI_MODEL } from "../lib/ai";
import {
  transitionOrder,
  processOrderAutomation,
  appendStatusHistory,
  loadEnvAutomationConfig,
  type OrderStatus,
} from "../automation";
import { notifyUser } from "../automation/notify";

const router = Router();

router.use(requireAuth, requireAdmin);

const adminOrderActionSchema = z.object({
  action: z.enum([
    "approve",
    "reject",
    "assign",
    "force_assign",
    "resolve",
    "set_delivery_mode",
    "run_automation",
  ]),
  supplier_id: z.string().trim().min(1).optional(),
  logistics_id: z.string().trim().min(1).optional(),
  delivery_mode: z.enum(["supplier_delivery", "logistics"]).optional(),
  admin_notes: z.string().trim().max(2000).optional().nullable(),
  reason: z.string().trim().max(1000).optional(),
  target_status: z
    .enum(["approved", "offered", "assigned", "rejected", "cancelled"])
    .optional(),
});

const automationSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["shadow", "live"]).optional(),
  auto_approve_enabled: z.boolean().optional(),
  auto_assign_supplier_enabled: z.boolean().optional(),
  auto_assign_logistics_enabled: z.boolean().optional(),
  offer_ttl_minutes: z.number().int().positive().max(24 * 60).optional(),
  candidate_chain_cap: z.number().int().positive().max(50).optional(),
  min_confidence_score: z.union([z.number(), z.string()]).optional(),
  tie_margin: z.union([z.number(), z.string()]).optional(),
  daily_order_cap_per_business: z.number().int().positive().max(10_000).optional(),
  supplier_weights: z.record(z.string(), z.number()).optional(),
  logistics_weights: z.record(z.string(), z.number()).optional(),
});

const serializeOrder = (o: typeof ordersTable.$inferSelect) => ({
  ...o,
  created_at: o.created_at.toISOString(),
  updated_at: o.updated_at.toISOString(),
  offer_expires_at: o.offer_expires_at?.toISOString() ?? null,
  picked_up_at: o.picked_up_at?.toISOString() ?? null,
  eta: o.eta?.toISOString() ?? null,
  automation_score: o.automation_score != null ? String(o.automation_score) : null,
});

const serializeProfile = (p: typeof profilesTable.$inferSelect) => ({
  ...p,
  created_at: p.created_at.toISOString(),
  updated_at: p.updated_at.toISOString(),
});

const ALL_STATUSES = [
  "pending",
  "approved",
  "offered",
  "assigned",
  "preparing",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "rejected",
  "cancelled",
  "needs_manual",
] as const;

router.get("/orders", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const base = db.select().from(ordersTable);
    const rows =
      status && (ALL_STATUSES as readonly string[]).includes(status)
        ? await base
            .where(eq(ordersTable.status, status as (typeof ALL_STATUSES)[number]))
            .orderBy(desc(ordersTable.created_at))
        : await base.orderBy(desc(ordersTable.created_at));
    return res.json(rows.map(serializeOrder));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin orders");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** طابور «يحتاج انتباهاً» */
router.get("/orders/needs-attention", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.status, "needs_manual"))
      .orderBy(desc(ordersTable.updated_at));
    return res.json(rows.map(serializeOrder));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch needs-attention");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** صحة الأتمتة اليوم */
router.get("/automation/health", async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const history = await db
      .select()
      .from(orderStatusHistoryTable)
      .where(
        and(
          eq(orderStatusHistoryTable.actor_kind, "system"),
          gte(orderStatusHistoryTable.created_at, start),
        ),
      );

    let autoApproved = 0;
    let autoAssigned = 0;
    let fellBack = 0;
    for (const h of history) {
      if (h.to_status === "approved" && !String(h.note ?? "").startsWith("[ظل]")) autoApproved += 1;
      if (h.to_status === "offered" && !String(h.note ?? "").startsWith("[ظل]")) autoAssigned += 1;
      if (h.to_status === "needs_manual") fellBack += 1;
    }

    const env = loadEnvAutomationConfig();
    const settingsRows = await db.select().from(automationSettingsTable).limit(1);
    const settings = settingsRows[0];

    return res.json({
      mode: settings?.mode ?? env.mode,
      enabled: env.enabled,
      today: {
        auto_approved: autoApproved,
        auto_assigned: autoAssigned,
        fell_back_to_manual: fellBack,
      },
      settings: settings
        ? {
            ...settings,
            min_confidence_score: String(settings.min_confidence_score),
            tie_margin: String(settings.tie_margin),
            updated_at: settings.updated_at.toISOString(),
          }
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch automation health");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/automation/settings", async (req, res) => {
  try {
    const rows = await db.select().from(automationSettingsTable).limit(1);
    let row = rows[0];
    if (!row) {
      const inserted = await db.insert(automationSettingsTable).values({}).returning();
      row = inserted[0];
    }
    return res.json({
      ...row,
      min_confidence_score: String(row.min_confidence_score),
      tie_margin: String(row.tie_margin),
      updated_at: row.updated_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch automation settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/automation/settings", async (req, res) => {
  try {
    const parsed = automationSettingsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "إعدادات غير صالحة",
      });
    }
    const body = parsed.data;
    const rows = await db.select().from(automationSettingsTable).limit(1);
    let id = rows[0]?.id;
    if (!id) {
      const inserted = await db.insert(automationSettingsTable).values({}).returning();
      id = inserted[0].id;
    }

    const patch: Partial<typeof automationSettingsTable.$inferInsert> = {
      updated_at: new Date(),
    };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.mode === "shadow" || body.mode === "live") patch.mode = body.mode;
    if (typeof body.auto_approve_enabled === "boolean")
      patch.auto_approve_enabled = body.auto_approve_enabled;
    if (typeof body.auto_assign_supplier_enabled === "boolean")
      patch.auto_assign_supplier_enabled = body.auto_assign_supplier_enabled;
    if (typeof body.auto_assign_logistics_enabled === "boolean")
      patch.auto_assign_logistics_enabled = body.auto_assign_logistics_enabled;
    if (typeof body.offer_ttl_minutes === "number")
      patch.offer_ttl_minutes = body.offer_ttl_minutes;
    if (typeof body.candidate_chain_cap === "number")
      patch.candidate_chain_cap = body.candidate_chain_cap;
    if (body.min_confidence_score != null)
      patch.min_confidence_score = String(body.min_confidence_score);
    if (body.tie_margin != null) patch.tie_margin = String(body.tie_margin);
    if (typeof body.daily_order_cap_per_business === "number")
      patch.daily_order_cap_per_business = body.daily_order_cap_per_business;
    if (body.supplier_weights && typeof body.supplier_weights === "object")
      patch.supplier_weights = body.supplier_weights as typeof patch.supplier_weights;
    if (body.logistics_weights && typeof body.logistics_weights === "object")
      patch.logistics_weights = body.logistics_weights as typeof patch.logistics_weights;

    const updated = await db
      .update(automationSettingsTable)
      .set(patch)
      .where(eq(automationSettingsTable.id, id))
      .returning();

    return res.json({
      ...updated[0],
      min_confidence_score: String(updated[0].min_confidence_score),
      tie_margin: String(updated[0].tie_margin),
      updated_at: updated[0].updated_at.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update automation settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:id/offers", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  try {
    const offers = await db
      .select()
      .from(orderOffersTable)
      .where(eq(orderOffersTable.order_id, id))
      .orderBy(orderOffersTable.rank);
    return res.json(
      offers.map((o) => ({
        ...o,
        score: o.score != null ? String(o.score) : null,
        offered_at: o.offered_at.toISOString(),
        expires_at: o.expires_at.toISOString(),
        responded_at: o.responded_at?.toISOString() ?? null,
        created_at: o.created_at.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order offers");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/orders/:id — موافقة / رفض / إسناد إجباري / حل يدوي
router.patch("/orders/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  const parsed = adminOrderActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "إجراء غير صالح",
    });
  }

  const {
    action,
    supplier_id,
    logistics_id,
    delivery_mode,
    admin_notes,
    reason,
    target_status,
  } = parsed.data;

  try {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

    if (action === "run_automation") {
      const result = await processOrderAutomation(id);
      const refreshed = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      return res.json({ result, order: serializeOrder(refreshed[0]) });
    }

    if (action === "set_delivery_mode") {
      if (delivery_mode !== "supplier_delivery" && delivery_mode !== "logistics") {
        return res.status(400).json({ error: "وضع توصيل غير صالح" });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "سبب تغيير وضع التوصيل مطلوب" });
      }
      const updated = await db
        .update(ordersTable)
        .set({ delivery_mode, updated_at: new Date(), admin_notes: admin_notes ?? order.admin_notes })
        .where(eq(ordersTable.id, id))
        .returning();
      await appendStatusHistory({
        orderId: id,
        fromStatus: order.status,
        toStatus: order.status,
        actorId: req.userId!,
        actorRole: "admin",
        actorKind: "user",
        note: `تغيير وضع التوصيل إلى ${delivery_mode}: ${reason.trim()}`,
      });
      return res.json(serializeOrder(updated[0]));
    }

    if (action === "approve") {
      const from = order.status as OrderStatus;
      if (from !== "pending" && from !== "needs_manual") {
        return res.status(409).json({ error: "لا يمكن الاعتماد من الحالة الحالية" });
      }
      const result = await transitionOrder({
        order,
        to: "approved",
        actor: { userId: req.userId!, isAdmin: true, kind: "admin", role: "admin" },
        patch: { admin_notes: admin_notes ?? order.admin_notes, automation_reason: null },
        note: "اعتماد يدوي من الإدارة",
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      void processOrderAutomation(id);
      return res.json(serializeOrder(result.order));
    }

    if (action === "reject") {
      const result = await transitionOrder({
        order,
        to: "rejected",
        actor: { userId: req.userId!, isAdmin: true, kind: "admin", role: "admin" },
        patch: { admin_notes: admin_notes ?? order.admin_notes },
        note: "رفض من الإدارة",
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json(serializeOrder(result.order));
    }

    if (action === "resolve") {
      if (!target_status || !["approved", "offered", "assigned", "rejected", "cancelled"].includes(target_status)) {
        return res.status(400).json({ error: "حدد الحالة الهدف للحل" });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "سبب الحل اليدوي مطلوب" });
      }
      const result = await transitionOrder({
        order,
        to: target_status as OrderStatus,
        actor: { userId: req.userId!, isAdmin: true, kind: "admin", role: "admin" },
        patch: {
          admin_notes: admin_notes ?? order.admin_notes,
          automation_reason: null,
        },
        note: `حل يدوي: ${reason.trim()}`,
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json(serializeOrder(result.order));
    }

    // assign | force_assign
    if (!reason || !reason.trim()) {
      if (action === "force_assign") {
        return res.status(400).json({ error: "سبب الإسناد الإجباري مطلوب" });
      }
    }

    if (logistics_id) {
      const carriers = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.user_id, logistics_id))
        .limit(1);
      const carrier = carriers[0];
      if (!carrier || carrier.role !== "logistics") {
        return res.status(404).json({ error: "جهة النقل غير موجودة" });
      }
      const updated = await db
        .update(ordersTable)
        .set({
          status: order.status === "ready_for_pickup" || order.status === "offered" || order.status === "needs_manual"
            ? order.status === "needs_manual"
              ? "ready_for_pickup"
              : order.status === "offered"
                ? "ready_for_pickup"
                : order.status
            : order.status,
          assigned_logistics_id: carrier.user_id,
          assigned_logistics_company: carrier.company_name,
          offered_to_id: null,
          offer_expires_at: null,
          delivery_mode: "logistics",
          admin_notes: admin_notes ?? order.admin_notes,
          automation_reason: null,
          updated_at: new Date(),
        })
        .where(eq(ordersTable.id, id))
        .returning();

      // إن كان needs_manual ننتقل عبر الآلة
      if (order.status === "needs_manual") {
        const result = await transitionOrder({
          order,
          to: "assigned",
          actor: { userId: req.userId!, isAdmin: true, kind: "admin" },
          patch: {
            assigned_logistics_id: carrier.user_id,
            assigned_logistics_company: carrier.company_name,
            delivery_mode: "logistics",
            automation_reason: null,
          },
          note: `إسناد إجباري لناقل: ${reason ?? ""}`,
        });
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        return res.json(serializeOrder(result.order));
      }

      await appendStatusHistory({
        orderId: id,
        fromStatus: order.status,
        toStatus: updated[0].status,
        actorId: req.userId!,
        actorRole: "admin",
        actorKind: "user",
        note: `إسناد ناقل إجباري: ${reason ?? ""}`,
      });
      return res.json(serializeOrder(updated[0]));
    }

    if (!supplier_id) return res.status(400).json({ error: "حدد المورد المراد الإسناد إليه" });

    const suppliers = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, supplier_id))
      .limit(1);
    const supplier = suppliers[0];
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ error: "المورد غير موجود" });
    }
    if (supplier.status !== "approved") {
      return res.status(409).json({ error: "المورد غير معتمد بعد" });
    }

    const assignable = [
      "pending",
      "approved",
      "offered",
      "needs_manual",
      "assigned",
    ];
    if (!assignable.includes(order.status) && action !== "force_assign") {
      return res.status(409).json({ error: "لا يمكن الإسناد في حالة الطلب الحالية" });
    }
    if (action === "force_assign" && (!reason || !String(reason).trim())) {
      return res.status(400).json({ error: "سبب الإسناد الإجباري مطلوب" });
    }

    // الإدارة تتجاوز آلة الحالات عند الإسناد اليدوي/الإجباري مع سجل كامل
    const updated = await db
      .update(ordersTable)
      .set({
        status: "assigned",
        assigned_supplier_id: supplier.user_id,
        assigned_supplier_company: supplier.company_name,
        assigned_supplier_region: supplier.region || supplier.country || null,
        delivery_mode:
          delivery_mode === "supplier_delivery" || delivery_mode === "logistics"
            ? delivery_mode
            : order.delivery_mode,
        offered_to_id: null,
        offer_expires_at: null,
        admin_notes: admin_notes ?? order.admin_notes,
        automation_reason: null,
        updated_at: new Date(),
      })
      .where(eq(ordersTable.id, id))
      .returning();

    await appendStatusHistory({
      orderId: id,
      fromStatus: order.status,
      toStatus: "assigned",
      actorId: req.userId!,
      actorRole: "admin",
      actorKind: "user",
      note: `${action === "force_assign" ? "إسناد إجباري" : "إسناد يدوي"} لمورد: ${
        String(reason ?? "").trim() || "—"
      }`,
    });

    await notifyUser({
      userId: supplier.user_id,
      type: "assignment_confirmed",
      title: "أُسند إليك طلب",
      body: `أُسند الطلب #${id} إليك من الإدارة`,
      orderId: id,
    });

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
      model: AI_MODEL,
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

// PATCH /api/admin/profiles/:id — اعتماد/رفض حساب أو منح/سحب صلاحية الإدارة
router.patch("/profiles/:id", async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صالح" });

  const { status, is_admin, rejection_reason } = req.body ?? {};
  if (status === undefined && is_admin === undefined) {
    return res.status(400).json({ error: "حدد الحالة أو صلاحية الإدارة" });
  }
  if (status !== undefined && !["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }
  if (is_admin !== undefined && typeof is_admin !== "boolean") {
    return res.status(400).json({ error: "قيمة صلاحية الإدارة غير صالحة" });
  }
  if (rejection_reason !== undefined && typeof rejection_reason !== "string") {
    return res.status(400).json({ error: "سبب الرفض غير صالح" });
  }

  try {
    const patch: Partial<typeof profilesTable.$inferInsert> = { updated_at: new Date() };
    if (status !== undefined) {
      patch.status = status;
      // عند الاعتماد نمسح سبب الرفض السابق
      if (status === "approved") patch.rejection_reason = null;
      if (status === "rejected" && rejection_reason !== undefined) {
        patch.rejection_reason = rejection_reason.trim() || null;
      }
    }
    if (is_admin !== undefined) {
      // حماية: لا يستطيع المدير سحب صلاحيته من نفسه حتى لا تُقفل الإدارة بالخطأ
      if (is_admin === false) {
        const target = await db.select().from(profilesTable).where(eq(profilesTable.id, id)).limit(1);
        if (target[0]?.user_id === req.userId) {
          return res.status(409).json({ error: "لا يمكنك سحب صلاحية الإدارة من حسابك" });
        }
      }
      patch.is_admin = is_admin;
    }

    const updated = await db.update(profilesTable)
      .set(patch)
      .where(eq(profilesTable.id, id))
      .returning();
    if (!updated.length) return res.status(404).json({ error: "الحساب غير موجود" });
    return res.json(serializeProfile(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
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
