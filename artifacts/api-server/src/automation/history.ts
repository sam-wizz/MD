import { db, orderStatusHistoryTable } from "@workspace/db";

/** يكتب سطراً في سجل الحالات */
export async function appendStatusHistory(input: {
  orderId: number;
  fromStatus: string | null;
  toStatus: string;
  actorId?: string | null;
  actorRole?: string | null;
  actorKind: "user" | "system";
  note?: string | null;
}) {
  await db.insert(orderStatusHistoryTable).values({
    order_id: input.orderId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? null,
    actor_kind: input.actorKind,
    note: input.note ?? null,
  });
}
