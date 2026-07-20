import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const requestStatusEnum = pgEnum("request_status", ["open", "in_review", "matched", "fulfilled", "cancelled"]);

export const supplyRequestsTable = pgTable("supply_requests", {
  id: serial("id").primaryKey(),
  requester_id: text("requester_id").notNull(),
  requester_name: text("requester_name").notNull(),
  company_name: text("company_name").notNull(),
  business_type: text("business_type").notNull(),       // restaurant | cafe | supermarket | retail
  product_category: text("product_category").notNull(), // فواكه وخضار | لحوم | مشروبات ...
  description: text("description").notNull(),
  quantity: text("quantity").notNull(),
  unit: text("unit").notNull(),                         // كيلو | كرتون | لتر | قطعة
  frequency: text("frequency").notNull(),               // daily | weekly | monthly | one_time
  delivery_region: text("delivery_region").notNull(),   // الرياض | جدة | الدمام ...
  budget_range: text("budget_range"),
  status: requestStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type SupplyRequest = typeof supplyRequestsTable.$inferSelect;
