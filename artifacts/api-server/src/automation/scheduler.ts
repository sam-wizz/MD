/**
 * مهام مجدولة: انتهاء العروض، تنبيه قبل الانتهاء، إعادة تشغيل الأتمتة العالقة.
 */

import { and, eq, isNull, lte, gt } from "drizzle-orm";
import { db, orderOffersTable, ordersTable } from "@workspace/db";
import { advanceOfferChain, processOrderAutomation } from "./runner";
import { appendStatusHistory } from "./history";
import { notifyUser } from "./notify";
import { logger } from "../lib/logger";

let timer: ReturnType<typeof setInterval> | null = null;

/** يعلّم العروض المنتهية ويدفع السلسلة للمرشح التالي */
export async function sweepExpiredOffers(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select()
    .from(orderOffersTable)
    .where(
      and(isNull(orderOffersTable.response), lte(orderOffersTable.expires_at, now)),
    );

  let handled = 0;
  const orderIds = new Set<number>();

  for (const offer of expired) {
    await db
      .update(orderOffersTable)
      .set({
        response: "expired",
        responded_at: now,
        reason: "انتهت مهلة العرض",
      })
      .where(
        and(eq(orderOffersTable.id, offer.id), isNull(orderOffersTable.response)),
      );

    await appendStatusHistory({
      orderId: offer.order_id,
      fromStatus: "offered",
      toStatus: "offered",
      actorKind: "system",
      note: `انتهت مهلة العرض للمرشح ${offer.candidate_id}`,
    });

    orderIds.add(offer.order_id);
    handled += 1;
  }

  for (const orderId of orderIds) {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (rows[0]?.status === "offered") {
      await advanceOfferChain(orderId);
    }
  }

  return handled;
}

/** تنبيه قبل انتهاء العرض بـ 5 دقائق */
export async function notifyExpiringSoon(withinMinutes = 5): Promise<number> {
  const now = new Date();
  const soon = new Date(now.getTime() + withinMinutes * 60_000);
  const offers = await db
    .select()
    .from(orderOffersTable)
    .where(
      and(
        isNull(orderOffersTable.response),
        gt(orderOffersTable.expires_at, now),
        lte(orderOffersTable.expires_at, soon),
      ),
    );

  let n = 0;
  for (const o of offers) {
    await notifyUser({
      userId: o.candidate_id,
      type: "offer_expiring",
      title: "العرض على وشك الانتهاء",
      body: `عرض الطلب #${o.order_id} ينتهي خلال أقل من ${withinMinutes} دقائق`,
      orderId: o.order_id,
    });
    n += 1;
  }
  return n;
}

/** طلبات pending/approved عالقة — أعد تشغيل الأتمتة (آمن لإعادة التنفيذ) */
export async function sweepPendingAutomation(): Promise<number> {
  const pending = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.status, "pending"));
  const approved = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.status, "approved"));
  const ready = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.status, "ready_for_pickup"));

  let n = 0;
  for (const o of [...pending, ...approved, ...ready]) {
    await processOrderAutomation(o.id);
    n += 1;
  }
  return n;
}

export async function runSchedulerTick() {
  try {
    const expired = await sweepExpiredOffers();
    const expiring = await notifyExpiringSoon(5);
    const auto = await sweepPendingAutomation();
    if (expired || expiring || auto) {
      logger.info({ expired, expiring, auto }, "automation scheduler tick");
    }
  } catch (err) {
    logger.error({ err }, "automation scheduler failed");
  }
}

/** يبدأ المؤقّت — افتراضي كل دقيقة */
export function startAutomationScheduler(intervalMs = 60_000) {
  if (timer) return;
  void runSchedulerTick();
  timer = setInterval(() => void runSchedulerTick(), intervalMs);
  logger.info({ intervalMs }, "automation scheduler started");
}

export function stopAutomationScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
