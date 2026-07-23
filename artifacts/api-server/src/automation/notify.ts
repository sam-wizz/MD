import { db, notificationsTable } from "@workspace/db";

/**
 * إشعار داخل التطبيق.
 * نقطة توسعة لاحقاً: أرسل نفس الحدث إلى قناة email/SMS عبر adapters.
 */
export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  orderId?: number;
}) {
  await db.insert(notificationsTable).values({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    order_id: input.orderId ?? null,
  });
}

/** خطاف توسعة — حالياً لا يفعل شيئاً سوى التسجيل في الذاكرة إن لزم */
export type ExternalNotifier = (event: {
  channel: "email" | "sms";
  userId: string;
  title: string;
  body: string;
}) => Promise<void>;

let externalNotifier: ExternalNotifier | null = null;

export function setExternalNotifier(fn: ExternalNotifier | null) {
  externalNotifier = fn;
}

export async function notifyExternal(
  channel: "email" | "sms",
  userId: string,
  title: string,
  body: string,
) {
  if (externalNotifier) {
    await externalNotifier({ channel, userId, title, body });
  }
}
