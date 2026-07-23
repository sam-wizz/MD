/**
 * إشعارات داخل التطبيق (الجرس).
 * نقطة توسعة لاحقاً للبريد/SMS عبر قناة channel.
 */
import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  order_id: integer("order_id"),
  read: boolean("read").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
