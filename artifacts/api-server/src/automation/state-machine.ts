/**
 * آلة حالات الطلب — تُفرَض على الخادم فقط.
 * أي انتقال غير مُدرَج يُرفض برسالة عربية واضحة.
 */

export type OrderStatus =
  | "pending"
  | "approved"
  | "offered"
  | "assigned"
  | "preparing"
  | "ready_for_pickup"
  | "in_transit"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "needs_manual";

export type DeliveryMode = "supplier_delivery" | "logistics" | null | undefined;

export type ActorKind = "user" | "system" | "admin" | "automation";

export type TransitionActor = {
  kind: ActorKind;
  userId?: string;
  role?: string;
  isAdmin?: boolean;
};

export type TransitionContext = {
  deliveryMode?: DeliveryMode;
  /** هوية المورد المسند */
  assignedSupplierId?: string | null;
  /** هوية الناقل المسند */
  assignedLogisticsId?: string | null;
  /** المرشح الحالي تحت العرض */
  offeredToId?: string | null;
  /** صاحب المنشأة */
  businessId?: string | null;
};

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

/** الانتقالات المسموحة من → إلى[] (بغض النظر عن الممثل — الملكية تُفحص لاحقاً) */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: ["approved", "rejected", "cancelled", "needs_manual"],
  approved: ["offered", "needs_manual", "cancelled"],
  offered: ["assigned", "offered", "in_transit", "needs_manual", "cancelled"],
  assigned: ["preparing", "needs_manual", "cancelled"],
  preparing: ["in_transit", "ready_for_pickup", "needs_manual", "cancelled"],
  ready_for_pickup: ["offered", "in_transit", "needs_manual", "cancelled"],
  in_transit: ["delivered"],
  needs_manual: ["approved", "offered", "assigned", "rejected", "cancelled"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

/**
 * يتحقق من صحة الانتقال + ملكية الممثل.
 */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  ctx: TransitionContext = {},
): TransitionResult {
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `لا يمكن الانتقال من «${statusAr(from)}» إلى «${statusAr(to)}»`,
    };
  }

  // فروع preparing حسب وضع التوصيل
  if (from === "preparing" && to === "in_transit") {
    if (ctx.deliveryMode !== "supplier_delivery") {
      return {
        ok: false,
        reason: "الانتقال إلى «في الطريق» متاح فقط عندما يكون التوصيل ذاتياً من المورد",
      };
    }
  }
  if (from === "preparing" && to === "ready_for_pickup") {
    if (ctx.deliveryMode !== "logistics") {
      return {
        ok: false,
        reason: "الانتقال إلى «جاهز للاستلام» متاح فقط عندما يكون وضع التوصيل عبر جهة نقل",
      };
    }
  }

  return checkOwnership(from, to, actor, ctx);
}

function checkOwnership(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  ctx: TransitionContext,
): TransitionResult {
  const isAdmin = !!actor.isAdmin || actor.kind === "admin";
  const isAutomation =
    actor.kind === "automation" || actor.kind === "system";

  // الإدارة تحلّ needs_manual وأي إلغاء/تجاوز
  if (isAdmin) {
    return { ok: true };
  }

  // الأتمتة
  if (isAutomation) {
    if (
      (from === "pending" && (to === "approved" || to === "needs_manual")) ||
      (from === "approved" && (to === "offered" || to === "needs_manual")) ||
      (from === "offered" && (to === "offered" || to === "needs_manual")) ||
      (from === "ready_for_pickup" && (to === "offered" || to === "needs_manual")) ||
      (to === "needs_manual")
    ) {
      return { ok: true };
    }
    return { ok: false, reason: "هذا الانتقال غير مسموح لمحرّك الأتمتة" };
  }

  // مرشح العرض (مورد) يقبل → assigned
  if (from === "offered" && to === "assigned") {
    if (actor.userId && actor.userId === ctx.offeredToId) return { ok: true };
    return { ok: false, reason: "فقط المرشح المعروض عليه الطلب يمكنه القبول" };
  }

  // مرشح العرض (ناقل) يقبل → in_transit (إسناد + تأكيد استلام)
  if (from === "offered" && to === "in_transit") {
    if (actor.userId && actor.userId === ctx.offeredToId) return { ok: true };
    return { ok: false, reason: "فقط جهة النقل المعروض عليها الطلب يمكنها القبول" };
  }

  // المورد المسند
  if (from === "assigned" && to === "preparing") {
    if (actor.userId && actor.userId === ctx.assignedSupplierId) return { ok: true };
    return { ok: false, reason: "فقط المورد المسند يمكنه بدء التجهيز" };
  }
  if (from === "preparing" && (to === "in_transit" || to === "ready_for_pickup")) {
    if (actor.userId && actor.userId === ctx.assignedSupplierId) return { ok: true };
    return { ok: false, reason: "فقط المورد المسند يمكنه تحديث حالة التجهيز" };
  }

  // الناقل يستلم
  if (from === "ready_for_pickup" && to === "in_transit") {
    if (actor.userId && actor.userId === ctx.assignedLogisticsId) return { ok: true };
    return { ok: false, reason: "فقط جهة النقل المسندة يمكنها تأكيد الاستلام" };
  }

  // التسليم
  if (from === "in_transit" && to === "delivered") {
    const isSupplier = actor.userId && actor.userId === ctx.assignedSupplierId;
    const isCarrier = actor.userId && actor.userId === ctx.assignedLogisticsId;
    if (isSupplier || isCarrier) return { ok: true };
    return { ok: false, reason: "فقط المورد أو الناقل المسند يمكنه تأكيد التسليم" };
  }

  // الإلغاء: صاحب المنشأة قبل preparing
  if (to === "cancelled") {
    const beforePreparing = ["pending", "approved", "offered", "assigned"].includes(from);
    if (
      beforePreparing &&
      actor.userId &&
      actor.userId === ctx.businessId
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "يمكن لصاحب المنشأة الإلغاء فقط قبل بدء التجهيز، أو للإدارة في أي وقت",
    };
  }

  // needs_manual → * للإدارة فقط (عُولج أعلاه)
  if (from === "needs_manual") {
    return { ok: false, reason: "حلّ الحالات اليدوية متاح للإدارة فقط" };
  }

  return { ok: false, reason: "غير مصرح لك بهذا الإجراء على الطلب" };
}

export function statusAr(s: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    pending: "بانتظار الموافقة",
    approved: "معتمد",
    offered: "معروض على مرشح",
    assigned: "مسند",
    preparing: "قيد التجهيز",
    ready_for_pickup: "جاهز للاستلام",
    in_transit: "في الطريق",
    delivered: "تم التسليم",
    rejected: "مرفوض",
    cancelled: "ملغي",
    needs_manual: "يتطلب تدخلاً يدوياً",
  };
  return map[s] ?? s;
}

export function isTerminal(status: OrderStatus): boolean {
  return status === "delivered" || status === "rejected" || status === "cancelled";
}

export { ALLOWED as ALLOWED_TRANSITIONS };
