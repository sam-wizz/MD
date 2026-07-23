/**
 * قبول / رفض العروض — يفرض delivery_mode عند قبول المورد.
 */

import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderOffersTable,
  profilesTable,
  type Order,
} from "@workspace/db";
import { canTransition, type OrderStatus } from "./state-machine";
import { appendStatusHistory } from "./history";
import { notifyUser } from "./notify";
import { advanceOfferChain, processOrderAutomation } from "./runner";
import { deliveryOptionsForSupplier } from "./delivery-options";

export type DeliveryModeChoice = "supplier_delivery" | "logistics";
export { deliveryOptionsForSupplier };

async function markOfferResponse(
  orderId: number,
  candidateId: string,
  response: "accepted" | "rejected" | "expired",
  reason?: string | null,
) {
  await db
    .update(orderOffersTable)
    .set({
      response,
      responded_at: new Date(),
      reason: reason ?? null,
    })
    .where(
      and(
        eq(orderOffersTable.order_id, orderId),
        eq(orderOffersTable.candidate_id, candidateId),
        isNull(orderOffersTable.response),
      ),
    );
}

export async function acceptOffer(input: {
  orderId: number;
  userId: string;
  role?: string;
  /** مطلوب عند قبول المورد */
  deliveryMode?: DeliveryModeChoice;
}): Promise<{ ok: true; order: Order } | { ok: false; status: number; error: string }> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, input.orderId))
    .limit(1);
  const order = rows[0];
  if (!order) return { ok: false, status: 404, error: "الطلب غير موجود" };
  if (order.status !== "offered") {
    return { ok: false, status: 409, error: "الطلب ليس في حالة عرض حالياً" };
  }
  if (order.offered_to_id !== input.userId) {
    return { ok: false, status: 403, error: "هذا العرض موجّه لمرشح آخر" };
  }

  const offers = await db
    .select()
    .from(orderOffersTable)
    .where(
      and(
        eq(orderOffersTable.order_id, order.id),
        eq(orderOffersTable.candidate_id, input.userId),
        isNull(orderOffersTable.response),
      ),
    )
    .limit(1);
  const offer = offers[0];
  const candidateRole = offer?.candidate_role ?? "supplier";

  if (candidateRole === "logistics") {
    const check = canTransition(
      "offered",
      "in_transit",
      { kind: "user", userId: input.userId, role: "logistics" },
      {
        offeredToId: order.offered_to_id,
        assignedLogisticsId: input.userId,
        deliveryMode: order.delivery_mode,
        assignedSupplierId: order.assigned_supplier_id,
        businessId: order.business_id,
      },
    );
    if (!check.ok) return { ok: false, status: 400, error: check.reason };

    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.user_id, input.userId))
      .limit(1);
    const company = profiles[0]?.company_name ?? "جهة نقل";

    await markOfferResponse(order.id, input.userId, "accepted");

    const updated = await db
      .update(ordersTable)
      .set({
        status: "in_transit",
        assigned_logistics_id: input.userId,
        assigned_logistics_company: company,
        offered_to_id: null,
        offer_expires_at: null,
        picked_up_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "offered")))
      .returning();

    if (!updated[0]) {
      return { ok: false, status: 409, error: "تغيّرت حالة الطلب — حدّث الصفحة" };
    }

    await appendStatusHistory({
      orderId: order.id,
      fromStatus: "offered",
      toStatus: "in_transit",
      actorId: input.userId,
      actorRole: "logistics",
      actorKind: "user",
      note: "قبلت جهة النقل العرض واستلمت الشحنة",
    });

    await notifyUser({
      userId: order.business_id,
      type: "status_change",
      title: "الشحنة في الطريق",
      body: `الطلب #${order.id} استلمته جهة النقل وهو في الطريق`,
      orderId: order.id,
    });
    if (order.assigned_supplier_id) {
      await notifyUser({
        userId: order.assigned_supplier_id,
        type: "assignment_confirmed",
        title: "تم استلام الشحنة",
        body: `جهة النقل استلمت الطلب #${order.id}`,
        orderId: order.id,
      });
    }

    return { ok: true, order: updated[0] };
  }

  // مورد
  if (!input.deliveryMode) {
    return {
      ok: false,
      status: 400,
      error: "يجب اختيار وضع التوصيل: توصيل ذاتي أو جهة نقل",
    };
  }

  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.user_id, input.userId))
    .limit(1);
  const profile = profiles[0];
  if (!profile || profile.role !== "supplier") {
    return { ok: false, status: 403, error: "قبول عروض التوريد للموردين فقط" };
  }

  const opts = deliveryOptionsForSupplier(profile, order.delivery_region);
  if (input.deliveryMode === "supplier_delivery" && !opts.supplier_delivery) {
    return {
      ok: false,
      status: 400,
      error: "التوصيل الذاتي غير متاح لمنطقتك أو لقدراتك المسجّلة",
    };
  }
  if (!opts.supplier_delivery && !opts.logistics) {
    return {
      ok: false,
      status: 400,
      error: "لا تتوفر خيارات توصيل — سيُحوَّل الطلب للتدخل اليدوي",
    };
  }

  const check = canTransition(
    "offered",
    "assigned",
    { kind: "user", userId: input.userId, role: "supplier" },
    {
      offeredToId: order.offered_to_id,
      assignedSupplierId: input.userId,
      businessId: order.business_id,
    },
  );
  if (!check.ok) return { ok: false, status: 400, error: check.reason };

  await markOfferResponse(order.id, input.userId, "accepted");

  const updated = await db
    .update(ordersTable)
    .set({
      status: "assigned",
      assigned_supplier_id: profile.user_id,
      assigned_supplier_company: profile.company_name,
      assigned_supplier_region: profile.region || profile.country || null,
      delivery_mode: input.deliveryMode,
      offered_to_id: null,
      offer_expires_at: null,
      updated_at: new Date(),
    })
    .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "offered")))
    .returning();

  if (!updated[0]) {
    return { ok: false, status: 409, error: "تغيّرت حالة الطلب — حدّث الصفحة" };
  }

  await appendStatusHistory({
    orderId: order.id,
    fromStatus: "offered",
    toStatus: "assigned",
    actorId: input.userId,
    actorRole: "supplier",
    actorKind: "user",
    note: `قبل المورد العرض — وضع التوصيل: ${
      input.deliveryMode === "supplier_delivery" ? "توصيل ذاتي" : "جهة نقل"
    }`,
  });

  await notifyUser({
    userId: order.business_id,
    type: "assignment_confirmed",
    title: "تم إسناد الطلب",
    body: `أُسند الطلب #${order.id} إلى ${profile.company_name}`,
    orderId: order.id,
  });

  return { ok: true, order: updated[0] };
}

export async function rejectOffer(input: {
  orderId: number;
  userId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, input.orderId))
    .limit(1);
  const order = rows[0];
  if (!order) return { ok: false, status: 404, error: "الطلب غير موجود" };
  if (order.status !== "offered") {
    return { ok: false, status: 409, error: "الطلب ليس في حالة عرض حالياً" };
  }
  if (order.offered_to_id !== input.userId) {
    return { ok: false, status: 403, error: "هذا العرض موجّه لمرشح آخر" };
  }

  await markOfferResponse(order.id, input.userId, "rejected", input.reason);

  await appendStatusHistory({
    orderId: order.id,
    fromStatus: "offered",
    toStatus: "offered",
    actorId: input.userId,
    actorRole: input.reason ? "candidate" : "candidate",
    actorKind: "user",
    note: `رفض المرشح العرض${input.reason ? `: ${input.reason}` : ""}`,
  });

  // الانتقال للمرشح التالي عبر الأتمتة
  await advanceOfferChain(order.id);
  return { ok: true };
}

/** انتقال حالة عام عبر آلة الحالات + سجل */
export async function transitionOrder(input: {
  order: Order;
  to: OrderStatus;
  actor: {
    userId?: string;
    role?: string;
    isAdmin?: boolean;
    kind?: "user" | "admin" | "automation" | "system";
  };
  patch?: Partial<{
    delivery_mode: "supplier_delivery" | "logistics" | null;
    assigned_supplier_id: string | null;
    assigned_supplier_company: string | null;
    assigned_supplier_region: string | null;
    assigned_logistics_id: string | null;
    assigned_logistics_company: string | null;
    offered_to_id: string | null;
    offer_expires_at: Date | null;
    picked_up_at: Date | null;
    eta: Date | null;
    admin_notes: string | null;
    automation_reason: string | null;
  }>;
  note?: string;
}): Promise<{ ok: true; order: Order } | { ok: false; status: number; error: string }> {
  const { order, to, actor, patch, note } = input;
  const check = canTransition(
    order.status as OrderStatus,
    to,
    {
      kind: actor.isAdmin ? "admin" : actor.kind ?? "user",
      userId: actor.userId,
      role: actor.role,
      isAdmin: actor.isAdmin,
    },
    {
      deliveryMode: patch?.delivery_mode !== undefined
        ? patch.delivery_mode
        : order.delivery_mode,
      assignedSupplierId: order.assigned_supplier_id,
      assignedLogisticsId: order.assigned_logistics_id,
      offeredToId: order.offered_to_id,
      businessId: order.business_id,
    },
  );
  if (!check.ok) return { ok: false, status: 400, error: check.reason };

  const updated = await db
    .update(ordersTable)
    .set({
      status: to,
      updated_at: new Date(),
      ...(patch ?? {}),
    })
    .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, order.status)))
    .returning();

  if (!updated[0]) {
    return { ok: false, status: 409, error: "تغيّرت حالة الطلب — حدّث الصفحة وحاول مجدداً" };
  }

  await appendStatusHistory({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: to,
    actorId: actor.userId ?? null,
    actorRole: actor.role ?? null,
    actorKind: actor.isAdmin || actor.kind === "admin" ? "user" : actor.kind === "automation" || actor.kind === "system" ? "system" : "user",
    note: note ?? null,
  });

  // إشعار صاحب المنشأة بتغيّر الحالة
  if (order.business_id && order.business_id !== actor.userId) {
    await notifyUser({
      userId: order.business_id,
      type: "status_change",
      title: "تحديث حالة الطلب",
      body: `الطلب #${order.id} أصبح: ${to}`,
      orderId: order.id,
    });
  }

  // بعد ready_for_pickup شغّل إسناد الناقلين
  if (to === "ready_for_pickup") {
    void processOrderAutomation(order.id);
  }

  return { ok: true, order: updated[0] };
}
