/**
 * إعدادات أوزان وحدود الأتمتة — قابلة للتعديل دون إعادة نشر
 * (صف واحد عادةً id=1، أو عبر متغيّرات البيئة كاحتياطي).
 */
import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";

export type AutomationWeights = {
  price: number;
  acceptance_rate: number;
  on_time_rate: number;
  remaining_capacity: number;
  region_bonus: number;
};

export type LogisticsWeights = {
  route_match: number;
  cost: number;
  on_time_rate: number;
  current_load: number;
};

export const automationSettingsTable = pgTable("automation_settings", {
  id: serial("id").primaryKey(),
  /** إيقاف شامل من لوحة الإدارة دون إعادة نشر */
  enabled: boolean("enabled").notNull().default(true),
  /** shadow | live */
  mode: text("mode").notNull().default("shadow"),
  auto_approve_enabled: boolean("auto_approve_enabled").notNull().default(true),
  auto_assign_supplier_enabled: boolean("auto_assign_supplier_enabled")
    .notNull()
    .default(true),
  auto_assign_logistics_enabled: boolean("auto_assign_logistics_enabled")
    .notNull()
    .default(true),
  offer_ttl_minutes: integer("offer_ttl_minutes").notNull().default(30),
  candidate_chain_cap: integer("candidate_chain_cap").notNull().default(5),
  min_confidence_score: numeric("min_confidence_score", {
    precision: 8,
    scale: 4,
  })
    .notNull()
    .default("0.35"),
  tie_margin: numeric("tie_margin", { precision: 8, scale: 4 })
    .notNull()
    .default("0.05"),
  daily_order_cap_per_business: integer("daily_order_cap_per_business")
    .notNull()
    .default(20),
  supplier_weights: jsonb("supplier_weights")
    .$type<AutomationWeights>()
    .notNull()
    .default({
      price: 0.35,
      acceptance_rate: 0.25,
      on_time_rate: 0.2,
      remaining_capacity: 0.1,
      region_bonus: 0.1,
    }),
  logistics_weights: jsonb("logistics_weights")
    .$type<LogisticsWeights>()
    .notNull()
    .default({
      route_match: 0.4,
      cost: 0.25,
      on_time_rate: 0.2,
      current_load: 0.15,
    }),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type AutomationSettings = typeof automationSettingsTable.$inferSelect;
