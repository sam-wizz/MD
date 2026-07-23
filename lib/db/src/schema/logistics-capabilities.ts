import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * قدرات جهة النقل (logistics).
 * covered_routes: { "الرياض": ["جدة","الدمام"], ... } من → إلى[]
 */
export const logisticsCapabilitiesTable = pgTable("logistics_capabilities", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull().unique(),
  covered_routes: jsonb("covered_routes")
    .$type<Record<string, string[]>>()
    .notNull()
    .default({}),
  daily_capacity: integer("daily_capacity"),
  working_hours: jsonb("working_hours").$type<Record<string, [string, string]>>(),
  is_paused: boolean("is_paused").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type LogisticsCapabilities =
  typeof logisticsCapabilitiesTable.$inferSelect;
