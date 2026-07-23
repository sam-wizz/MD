import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

export const historyActorKindEnum = pgEnum("history_actor_kind", [
  "user",
  "system",
]);

/** سجل تدقيق لكل انتقال حالة */
export const orderStatusHistoryTable = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  order_id: integer("order_id").notNull(),
  from_status: text("from_status"),
  to_status: text("to_status").notNull(),
  actor_id: text("actor_id"),
  actor_role: text("actor_role"),
  actor_kind: historyActorKindEnum("actor_kind").notNull().default("user"),
  note: text("note"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type OrderStatusHistory = typeof orderStatusHistoryTable.$inferSelect;
