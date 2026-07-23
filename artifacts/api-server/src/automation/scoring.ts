/**
 * دوال التقييم النقية — بدون كتابة قاعدة بيانات.
 * المدخلات: مرشحون + سياق الطلب + أوزان → مخرجات مرتّبة مع تفصيل الدرجات.
 */

import type { AutomationWeights, LogisticsWeights } from "@workspace/db";

export type SupplierCandidateInput = {
  userId: string;
  companyName: string;
  region?: string | null;
  categories: string[];
  serviceRegions: string[];
  deliversSelf: boolean;
  selfDeliveryRegions: string[];
  dailyCapacity: number;
  assignedToday: number;
  /** أقل سعر معروف للتصنيف (أقل = أفضل). null إن لم يوجد */
  bestPrice: number | null;
  /** متوسط أسعار السوق للمقارنة */
  marketAvgPrice: number | null;
  acceptanceRate: number; // 0..1
  onTimeRate: number; // 0..1
  isPaused: boolean;
  status: string;
  role: string;
  /** هل الوقت ضمن ساعات العمل */
  withinWorkingHours: boolean;
};

export type LogisticsCandidateInput = {
  userId: string;
  companyName: string;
  coveredRoutes: Record<string, string[]>;
  dailyCapacity: number;
  assignedToday: number;
  onTimeRate: number;
  /** تكلفة تقديرية أقل = أفضل؛ null إن لم تُعرف */
  estimatedCost: number | null;
  isPaused: boolean;
  status: string;
  role: string;
  withinWorkingHours: boolean;
};

export type ScoredCandidate = {
  userId: string;
  companyName: string;
  score: number;
  breakdown: Record<string, number>;
  /** خيارات التوصيل المتاحة لهذا المرشح على هذا الطلب */
  canSelfDeliver: boolean;
  canRequestLogistics: boolean;
};

export type ScoreDecision =
  | {
      kind: "offer";
      ranked: ScoredCandidate[];
      winner: ScoredCandidate;
    }
  | {
      kind: "needs_manual";
      reason: string;
      ranked: ScoredCandidate[];
    };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** تصفية صلبة للموردين */
export function hardFilterSuppliers(
  order: { product_category: string; delivery_region: string },
  candidates: SupplierCandidateInput[],
): SupplierCandidateInput[] {
  return candidates.filter((c) => {
    if (c.role !== "supplier") return false;
    if (c.status !== "approved") return false;
    if (c.isPaused) return false;
    if (!c.withinWorkingHours) return false;
    if (!c.categories.includes(order.product_category)) return false;
    if (!c.serviceRegions.includes(order.delivery_region)) return false;
    if (c.assignedToday >= c.dailyCapacity) return false;
    return true;
  });
}

export function scoreSupplier(
  order: { product_category: string; delivery_region: string },
  c: SupplierCandidateInput,
  weights: AutomationWeights,
): ScoredCandidate {
  // السعر: أقل من المتوسط → درجة أعلى
  let priceScore = 0.5;
  if (c.bestPrice != null && c.marketAvgPrice != null && c.marketAvgPrice > 0) {
    const ratio = c.bestPrice / c.marketAvgPrice;
    priceScore = clamp01(1.2 - ratio); // أرخص من المتوسط أفضل
  } else if (c.bestPrice == null) {
    priceScore = 0.3; // لا أسعار → ضعيف
  }

  const remaining =
    c.dailyCapacity > 0
      ? clamp01((c.dailyCapacity - c.assignedToday) / c.dailyCapacity)
      : 0;

  const regionBonus =
    c.region && c.region === order.delivery_region ? 1 : c.serviceRegions.includes(order.delivery_region) ? 0.6 : 0;

  const breakdown = {
    price: priceScore * weights.price,
    acceptance_rate: clamp01(c.acceptanceRate) * weights.acceptance_rate,
    on_time_rate: clamp01(c.onTimeRate) * weights.on_time_rate,
    remaining_capacity: remaining * weights.remaining_capacity,
    region_bonus: regionBonus * weights.region_bonus,
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const canSelfDeliver =
    c.deliversSelf && c.selfDeliveryRegions.includes(order.delivery_region);

  return {
    userId: c.userId,
    companyName: c.companyName,
    score,
    breakdown,
    canSelfDeliver,
    canRequestLogistics: true, // يمكنه طلب ناقل ما لم تُقيَّد لاحقاً
  };
}

export function rankSuppliers(
  order: { product_category: string; delivery_region: string },
  candidates: SupplierCandidateInput[],
  weights: AutomationWeights,
  opts: { minConfidence: number; tieMargin: number },
): ScoreDecision {
  const filtered = hardFilterSuppliers(order, candidates);
  const ranked = filtered
    .map((c) => scoreSupplier(order, c, weights))
    .filter((c) => c.canSelfDeliver || c.canRequestLogistics)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      kind: "needs_manual",
      reason: "لا يوجد موردون مطابقون للتصنيف والمنطقة والطاقة الاستيعابية",
      ranked: [],
    };
  }

  const top = ranked[0];
  if (top.score < opts.minConfidence) {
    return {
      kind: "needs_manual",
      reason: `أعلى درجة (${top.score.toFixed(2)}) أقل من حد الثقة الأدنى`,
      ranked,
    };
  }

  if (ranked.length >= 2 && Math.abs(ranked[0].score - ranked[1].score) <= opts.tieMargin) {
    return {
      kind: "needs_manual",
      reason: "تعادل بين أفضل مرشحين — يتطلب قراراً بشرياً",
      ranked,
    };
  }

  // إن لم يستطع أحد التوصيل ولا طلب ناقل (نظرياً مُصفّى) — يدوي
  if (!top.canSelfDeliver && !top.canRequestLogistics) {
    return {
      kind: "needs_manual",
      reason: "لا تتوفر خيارات توصيل لأي مرشح",
      ranked,
    };
  }

  return { kind: "offer", ranked, winner: top };
}

export function hardFilterLogistics(
  fromRegion: string,
  toRegion: string,
  candidates: LogisticsCandidateInput[],
): LogisticsCandidateInput[] {
  return candidates.filter((c) => {
    if (c.role !== "logistics") return false;
    if (c.status !== "approved") return false;
    if (c.isPaused) return false;
    if (!c.withinWorkingHours) return false;
    if (c.assignedToday >= c.dailyCapacity) return false;
    const dests = c.coveredRoutes[fromRegion] ?? [];
    if (!dests.includes(toRegion)) return false;
    return true;
  });
}

export function scoreLogistics(
  c: LogisticsCandidateInput,
  weights: LogisticsWeights,
  fromRegion: string,
  toRegion: string,
): ScoredCandidate {
  const dests = c.coveredRoutes[fromRegion] ?? [];
  const routeMatch = dests.includes(toRegion) ? 1 : 0;
  const load =
    c.dailyCapacity > 0
      ? clamp01(1 - c.assignedToday / c.dailyCapacity)
      : 0;
  let costScore = 0.5;
  if (c.estimatedCost != null) {
    costScore = clamp01(1 / (1 + c.estimatedCost / 1000));
  }

  const breakdown = {
    route_match: routeMatch * weights.route_match,
    cost: costScore * weights.cost,
    on_time_rate: clamp01(c.onTimeRate) * weights.on_time_rate,
    current_load: load * weights.current_load,
  };
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    userId: c.userId,
    companyName: c.companyName,
    score,
    breakdown,
    canSelfDeliver: false,
    canRequestLogistics: true,
  };
}

export function rankLogistics(
  fromRegion: string,
  toRegion: string,
  candidates: LogisticsCandidateInput[],
  weights: LogisticsWeights,
  opts: { minConfidence: number; tieMargin: number },
): ScoreDecision {
  const filtered = hardFilterLogistics(fromRegion, toRegion, candidates);
  const ranked = filtered
    .map((c) => scoreLogistics(c, weights, fromRegion, toRegion))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      kind: "needs_manual",
      reason: "لا توجد جهة نقل تغطي المسار المطلوب",
      ranked: [],
    };
  }

  const top = ranked[0];
  if (top.score < opts.minConfidence) {
    return {
      kind: "needs_manual",
      reason: `أعلى درجة ناقل (${top.score.toFixed(2)}) أقل من حد الثقة`,
      ranked,
    };
  }
  if (ranked.length >= 2 && Math.abs(ranked[0].score - ranked[1].score) <= opts.tieMargin) {
    return {
      kind: "needs_manual",
      reason: "تعادل بين أفضل ناقليْن — يتطلب قراراً بشرياً",
      ranked,
    };
  }

  return { kind: "offer", ranked, winner: top };
}

/** فحوصات سلامة الاعتماد الآلي (نقية) */
export function evaluateAutoApproval(input: {
  businessStatus: string;
  hasUnresolvedDispute: boolean;
  itemsLength: number;
  category: string;
  region: string;
  validCategories: string[];
  validRegions: string[];
  ordersToday: number;
  dailyCap: number;
}): { approve: true } | { approve: false; reason: string } {
  if (input.businessStatus !== "approved") {
    return { approve: false, reason: "حساب المنشأة غير معتمد" };
  }
  if (input.hasUnresolvedDispute) {
    return { approve: false, reason: "يوجد نزاع غير محلول على حساب المنشأة" };
  }
  if (input.itemsLength < 10) {
    return { approve: false, reason: "وصف الأصناف قصير جداً" };
  }
  if (!input.validCategories.includes(input.category)) {
    return { approve: false, reason: "تصنيف المنتجات غير معروف" };
  }
  if (!input.validRegions.includes(input.region)) {
    return { approve: false, reason: "منطقة التسليم غير معروفة" };
  }
  if (input.ordersToday >= input.dailyCap) {
    return { approve: false, reason: "تجاوزت المنشأة الحد اليومي للطلبات" };
  }
  return { approve: true };
}
