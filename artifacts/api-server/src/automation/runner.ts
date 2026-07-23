/**
 * تشغيل الأتمتة على طلب واحد — يقرأ من DB ويكتب الانتقالات/العروض.
 * وضع shadow: يسجّل القرار دون تطبيقه.
 */

import { and, eq, gte, sql, desc, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  profilesTable,
  supplierPricesTable,
  orderOffersTable,
  logisticsCapabilitiesTable,
  automationSettingsTable,
  type Order,
} from "@workspace/db";
import { loadEnvAutomationConfig, type RuntimeAutomationConfig } from "./config";
import {
  evaluateAutoApproval,
  rankSuppliers,
  rankLogistics,
  type SupplierCandidateInput,
  type LogisticsCandidateInput,
} from "./scoring";
import { canTransition, type OrderStatus } from "./state-machine";
import { selectNextOfferTarget } from "./offer-chain";
import { appendStatusHistory } from "./history";
import { notifyUser } from "./notify";

const SAUDI_REGION_NAMES = [
  "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر",
  "الأحساء", "الجبيل", "بريدة (القصيم)", "الطائف", "أبها", "خميس مشيط",
  "تبوك", "حائل", "عرعر", "سكاكا (الجوف)", "جازان", "نجران", "الباحة", "ينبع",
];

const PRODUCT_CATEGORIES = [
  "اللحوم والدواجن", "الأسماك والمأكولات البحرية", "الأرز والحبوب",
  "الزيوت والسمن", "الألبان والأجبان", "الخضار والفواكه", "المعلبات والصلصات",
  "المشروبات والعصائر", "التوابل والبهارات", "المخبوزات والحلويات",
  "مواد التغليف", "مواد التنظيف", "أخرى",
];

function withinWorkingHours(
  workingHours: Record<string, [string, string]> | null | undefined,
  now = new Date(),
): boolean {
  if (!workingHours || !Object.keys(workingHours).length) return true;
  const day = String(now.getDay());
  const slot = workingHours[day];
  if (!slot) return false;
  const [open, close] = slot;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hhmm >= open && hhmm <= close;
}

async function loadConfig(): Promise<RuntimeAutomationConfig> {
  const rows = await db.select().from(automationSettingsTable).limit(1);
  const row = rows[0];
  const env = loadEnvAutomationConfig();
  if (!row) return env;
  return {
    ...env,
    /** البيئة تقتل الأتمتة دائماً؛ الجدول يتيح إيقافاً دون إعادة نشر عندما البيئة مفعّلة */
    enabled: env.enabled && row.enabled !== false,
    mode: row.mode === "live" ? "live" : "shadow",
    autoApproveEnabled: row.auto_approve_enabled,
    autoAssignSupplierEnabled: row.auto_assign_supplier_enabled,
    autoAssignLogisticsEnabled: row.auto_assign_logistics_enabled,
    offerTtlMinutes: row.offer_ttl_minutes,
    candidateChainCap: row.candidate_chain_cap,
    minConfidenceScore: Number(row.min_confidence_score),
    tieMargin: Number(row.tie_margin),
    dailyOrderCapPerBusiness: row.daily_order_cap_per_business,
    supplierWeights: row.supplier_weights,
    logisticsWeights: row.logistics_weights,
  };
}

async function applyStatus(
  order: Order,
  to: OrderStatus,
  note: string,
  live: boolean,
) {
  const check = canTransition(order.status as OrderStatus, to, {
    kind: "automation",
  }, {
    deliveryMode: order.delivery_mode,
    assignedSupplierId: order.assigned_supplier_id,
    assignedLogisticsId: order.assigned_logistics_id,
    offeredToId: order.offered_to_id,
    businessId: order.business_id,
  });
  if (!check.ok) return { applied: false, reason: check.reason };

  if (!live) {
    // وضع الظل: سجّل فقط
    await appendStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      actorKind: "system",
      actorRole: "automation",
      note: `[ظل] ${note}`,
    });
    return { applied: false, reason: "shadow", shadowed: true as const };
  }

  const updated = await db
    .update(ordersTable)
    .set({
      status: to,
      automation_reason: to === "needs_manual" ? note : null,
      updated_at: new Date(),
    })
    .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, order.status)))
    .returning();

  if (!updated[0]) return { applied: false, reason: "race" };

  await appendStatusHistory({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: to,
    actorKind: "system",
    actorRole: "automation",
    note,
  });

  if (to === "needs_manual") {
    const admins = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.is_admin, true));
    for (const a of admins) {
      await notifyUser({
        userId: a.user_id,
        type: "needs_manual",
        title: "طلب يحتاج تدخلاً يدوياً",
        body: `الطلب #${order.id}: ${note}`,
        orderId: order.id,
      });
    }
  }

  return { applied: true, order: updated[0] };
}

async function countBusinessOrdersToday(businessId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.business_id, businessId),
        gte(ordersTable.created_at, start),
      ),
    );
  return Number(rows[0]?.c ?? 0);
}

async function countAssignedTodayBatch(
  supplierIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const id of supplierIds) result.set(id, 0);
  if (!supplierIds.length) return result;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      supplier_id: ordersTable.assigned_supplier_id,
      c: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(
      and(
        inArray(ordersTable.assigned_supplier_id, supplierIds),
        gte(ordersTable.updated_at, start),
      ),
    )
    .groupBy(ordersTable.assigned_supplier_id);

  for (const r of rows) {
    if (r.supplier_id) result.set(r.supplier_id, Number(r.c ?? 0));
  }
  return result;
}

async function buildSupplierCandidates(
  order: Order,
): Promise<SupplierCandidateInput[]> {
  const suppliers = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.role, "supplier"));

  const prices = await db
    .select()
    .from(supplierPricesTable)
    .where(eq(supplierPricesTable.category, order.product_category));

  const pricesBySupplier = new Map<string, number[]>();
  for (const p of prices) {
    const list = pricesBySupplier.get(p.supplier_id) ?? [];
    list.push(Number(p.price));
    pricesBySupplier.set(p.supplier_id, list);
  }
  const allPrices = prices.map((p) => Number(p.price)).filter(Number.isFinite);
  const marketAvg =
    allPrices.length > 0
      ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length
      : null;

  const assignedMap = await countAssignedTodayBatch(suppliers.map((s) => s.user_id));

  const out: SupplierCandidateInput[] = [];
  for (const s of suppliers) {
    const sp = pricesBySupplier.get(s.user_id) ?? [];
    const bestPrice = sp.length ? Math.min(...sp) : null;
    out.push({
      userId: s.user_id,
      companyName: s.company_name,
      region: s.region,
      categories: s.categories ?? [],
      serviceRegions: s.service_regions ?? [],
      deliversSelf: !!s.delivers_self,
      selfDeliveryRegions: s.self_delivery_regions ?? [],
      dailyCapacity: s.daily_capacity ?? 50,
      assignedToday: assignedMap.get(s.user_id) ?? 0,
      bestPrice,
      marketAvgPrice: marketAvg,
      acceptanceRate: 0.7,
      onTimeRate: 0.7,
      isPaused: !!s.is_paused,
      status: s.status,
      role: s.role,
      withinWorkingHours: withinWorkingHours(
        s.working_hours as Record<string, [string, string]> | null,
      ),
    });
  }
  return out;
}

/** يقدّم عرضاً لمرشح مع كتابة order_offers */
export async function placeOffer(input: {
  order: Order;
  candidateId: string;
  candidateRole: "supplier" | "logistics";
  rank: number;
  score: number;
  breakdown: Record<string, number>;
  ttlMinutes: number;
  live: boolean;
}) {
  const expires = new Date(Date.now() + input.ttlMinutes * 60_000);

  if (!input.live) {
    await appendStatusHistory({
      orderId: input.order.id,
      fromStatus: input.order.status,
      toStatus: "offered",
      actorKind: "system",
      note: `[ظل] عرض على ${input.candidateId} رتبة ${input.rank} درجة ${input.score.toFixed(3)}`,
    });
    return { shadowed: true as const };
  }

  // idempotent insert
  try {
    await db.insert(orderOffersTable).values({
      order_id: input.order.id,
      candidate_id: input.candidateId,
      candidate_role: input.candidateRole,
      rank: input.rank,
      score: String(input.score),
      score_breakdown: input.breakdown,
      expires_at: expires,
    });
  } catch {
    // قيد فريد — إعادة تشغيل آمنة
  }

  const updated = await db
    .update(ordersTable)
    .set({
      status: "offered",
      offered_to_id: input.candidateId,
      offer_expires_at: expires,
      automation_score: String(input.score),
      updated_at: new Date(),
    })
    .where(eq(ordersTable.id, input.order.id))
    .returning();

  await appendStatusHistory({
    orderId: input.order.id,
    fromStatus: input.order.status,
    toStatus: "offered",
    actorKind: "system",
    note: `عُرض على مرشح رتبة ${input.rank} — درجة ${input.score.toFixed(3)}`,
  });

  await notifyUser({
    userId: input.candidateId,
    type: "offer_received",
    title: "عرض طلب جديد",
    body: `لديك عرض على الطلب #${input.order.id} ينتهي خلال ${input.ttlMinutes} دقيقة`,
    orderId: input.order.id,
  });

  return { order: updated[0], expires };
}

export async function runAutoApprove(orderId: number) {
  const cfg = await loadConfig();
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (!order || order.status !== "pending") return { skipped: true };

  if (!cfg.enabled || !cfg.autoApproveEnabled) {
    return applyStatus(order, "needs_manual", "الأتمتة أو الاعتماد الآلي معطّل", cfg.mode === "live");
  }

  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.user_id, order.business_id))
    .limit(1);
  const business = profiles[0];
  if (!business) {
    return applyStatus(order, "needs_manual", "ملف المنشأة غير موجود", cfg.mode === "live");
  }

  const ordersToday = await countBusinessOrdersToday(order.business_id);
  const verdict = evaluateAutoApproval({
    businessStatus: business.status,
    hasUnresolvedDispute: !!business.has_unresolved_dispute,
    itemsLength: order.items.trim().length,
    category: order.product_category,
    region: order.delivery_region,
    validCategories: PRODUCT_CATEGORIES,
    validRegions: SAUDI_REGION_NAMES,
    ordersToday,
    dailyCap: cfg.dailyOrderCapPerBusiness,
  });

  if (!verdict.approve) {
    return applyStatus(order, "needs_manual", verdict.reason, cfg.mode === "live");
  }

  return applyStatus(order, "approved", "اعتماد آلي بعد اجتياز الفحوصات", cfg.mode === "live");
}

export async function runSupplierAssignment(orderId: number) {
  const cfg = await loadConfig();
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (!order || order.status !== "approved") return { skipped: true };

  if (!cfg.enabled || !cfg.autoAssignSupplierEnabled) {
    return applyStatus(order, "needs_manual", "إسناد الموردين الآلي معطّل", cfg.mode === "live");
  }

  const candidates = await buildSupplierCandidates(order);
  const decision = rankSuppliers(
    {
      product_category: order.product_category,
      delivery_region: order.delivery_region,
    },
    candidates,
    cfg.supplierWeights,
    { minConfidence: cfg.minConfidenceScore, tieMargin: cfg.tieMargin },
  );

  // شفافية القرار — دائماً في السجل
  await appendStatusHistory({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: order.status,
    actorKind: "system",
    note: JSON.stringify({
      type: "supplier_ranking",
      mode: cfg.mode,
      decision: decision.kind,
      ranked: decision.ranked.slice(0, cfg.candidateChainCap).map((c, i) => ({
        rank: i + 1,
        userId: c.userId,
        company: c.companyName,
        score: c.score,
        breakdown: c.breakdown,
      })),
      reason: decision.kind === "needs_manual" ? decision.reason : undefined,
    }),
  });

  if (decision.kind === "needs_manual") {
    return applyStatus(order, "needs_manual", decision.reason, cfg.mode === "live");
  }

  return placeOffer({
    order,
    candidateId: decision.winner.userId,
    candidateRole: "supplier",
    rank: 1,
    score: decision.winner.score,
    breakdown: decision.winner.breakdown,
    ttlMinutes: cfg.offerTtlMinutes,
    live: cfg.mode === "live",
  });
}

/** عند رفض/انتهاء العرض — المرشح التالي أو needs_manual */
export async function advanceOfferChain(orderId: number) {
  const cfg = await loadConfig();
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (!order || order.status !== "offered") return { skipped: true };

  const offers = await db
    .select()
    .from(orderOffersTable)
    .where(eq(orderOffersTable.order_id, orderId))
    .orderBy(desc(orderOffersTable.rank));

  const lastRank = offers[0]?.rank ?? 0;
  const role = offers[0]?.candidate_role ?? "supplier";

  if (lastRank >= cfg.candidateChainCap) {
    return applyStatus(
      order,
      "needs_manual",
      "استُنفدت سلسلة المرشحين دون قبول",
      cfg.mode === "live",
    );
  }

  if (role === "logistics") {
    // إعادة ترتيب الناقلين وتجاوز من عُرض عليهم
    return runLogisticsAssignment(orderId, lastRank + 1);
  }

  const candidates = await buildSupplierCandidates(order);
  const decision = rankSuppliers(
    {
      product_category: order.product_category,
      delivery_region: order.delivery_region,
    },
    candidates,
    cfg.supplierWeights,
    { minConfidence: cfg.minConfidenceScore, tieMargin: cfg.tieMargin },
  );

  if (decision.kind === "needs_manual") {
    return applyStatus(order, "needs_manual", decision.reason, cfg.mode === "live");
  }

  const offeredIds = offers.map((o) => o.candidate_id);
  const nextDecision = selectNextOfferTarget({
    ranked: decision.ranked.map((c) => ({
      userId: c.userId,
      score: c.score,
      breakdown: c.breakdown,
    })),
    alreadyOfferedIds: offeredIds,
    lastRank,
    chainCap: cfg.candidateChainCap,
  });

  if (nextDecision.kind === "needs_manual") {
    return applyStatus(order, "needs_manual", nextDecision.reason, cfg.mode === "live");
  }

  return placeOffer({
    order,
    candidateId: nextDecision.candidate.userId,
    candidateRole: "supplier",
    rank: nextDecision.rank,
    score: nextDecision.candidate.score,
    breakdown: nextDecision.candidate.breakdown,
    ttlMinutes: cfg.offerTtlMinutes,
    live: cfg.mode === "live",
  });
}

export async function runLogisticsAssignment(orderId: number, startRank = 1) {
  const cfg = await loadConfig();
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return { skipped: true };
  if (
    order.status !== "ready_for_pickup" &&
    !(order.status === "offered" && startRank > 1)
  ) {
    if (order.status !== "offered") return { skipped: true };
  }

  if (!cfg.enabled || !cfg.autoAssignLogisticsEnabled) {
    return applyStatus(order, "needs_manual", "إسناد النقل الآلي معطّل", cfg.mode === "live");
  }

  const fromRegion = order.assigned_supplier_region || "الرياض";
  const toRegion = order.delivery_region;

  const logisticsProfiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.role, "logistics"));
  const caps = await db.select().from(logisticsCapabilitiesTable);
  const capsByUser = new Map(caps.map((c) => [c.user_id, c]));

  const candidates: LogisticsCandidateInput[] = [];
  for (const p of logisticsProfiles) {
    const cap = capsByUser.get(p.user_id);
    if (!cap) continue;
    candidates.push({
      userId: p.user_id,
      companyName: p.company_name,
      coveredRoutes: (cap.covered_routes as Record<string, string[]>) ?? {},
      dailyCapacity: cap.daily_capacity ?? 30,
      assignedToday: 0,
      onTimeRate: 0.7,
      estimatedCost: null,
      isPaused: !!cap.is_paused || !!p.is_paused,
      status: p.status,
      role: p.role,
      withinWorkingHours: withinWorkingHours(
        cap.working_hours as Record<string, [string, string]> | null,
      ),
    });
  }

  const decision = rankLogistics(
    fromRegion,
    toRegion,
    candidates,
    cfg.logisticsWeights,
    { minConfidence: cfg.minConfidenceScore, tieMargin: cfg.tieMargin },
  );

  await appendStatusHistory({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: order.status,
    actorKind: "system",
    note: JSON.stringify({
      type: "logistics_ranking",
      mode: cfg.mode,
      decision: decision.kind,
      ranked: decision.ranked.slice(0, 5),
      reason: decision.kind === "needs_manual" ? decision.reason : undefined,
    }),
  });

  if (decision.kind === "needs_manual") {
    return applyStatus(order, "needs_manual", decision.reason, cfg.mode === "live");
  }

  const existing = await db
    .select()
    .from(orderOffersTable)
    .where(eq(orderOffersTable.order_id, orderId));
  const offeredIds = new Set(existing.map((o) => o.candidate_id));
  const winner =
    decision.ranked.find((c) => !offeredIds.has(c.userId)) ?? decision.winner;

  return placeOffer({
    order,
    candidateId: winner.userId,
    candidateRole: "logistics",
    rank: startRank,
    score: winner.score,
    breakdown: winner.breakdown,
    ttlMinutes: cfg.offerTtlMinutes,
    live: cfg.mode === "live",
  });
}

/** نقطة دخول شاملة حسب حالة الطلب */
export async function processOrderAutomation(orderId: number) {
  const cfg = await loadConfig();
  if (!cfg.enabled) {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (rows[0] && rows[0].status === "pending") {
      return applyStatus(rows[0], "needs_manual", "الأتمتة معطّلة عالمياً", true);
    }
    return { skipped: true, reason: "disabled" };
  }

  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return { skipped: true };

  if (order.status === "pending") return runAutoApprove(orderId);
  if (order.status === "approved") return runSupplierAssignment(orderId);
  if (order.status === "ready_for_pickup") return runLogisticsAssignment(orderId);
  return { skipped: true };
}
