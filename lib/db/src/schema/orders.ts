import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  numeric,
  index,
} from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "approved",
  "offered",
  "assigned",
  "preparing",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "rejected",
  "cancelled",
  "needs_manual",
]);

export const deliveryModeEnum = pgEnum("delivery_mode", [
  "supplier_delivery",
  "logistics",
]);

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    business_id: text("business_id").notNull(),
    business_company: text("business_company").notNull(),
    business_contact: text("business_contact").notNull(),
    business_phone: text("business_phone"),
    product_category: text("product_category").notNull(),
    items: text("items").notNull(),
    delivery_region: text("delivery_region").notNull(),
    delivery_address: text("delivery_address"),
    notes: text("notes"),
    status: orderStatusEnum("status").notNull().default("pending"),

    assigned_supplier_id: text("assigned_supplier_id"),
    assigned_supplier_company: text("assigned_supplier_company"),
    assigned_supplier_region: text("assigned_supplier_region"),

    delivery_mode: deliveryModeEnum("delivery_mode"),
    assigned_logistics_id: text("assigned_logistics_id"),
    assigned_logistics_company: text("assigned_logistics_company"),

    offered_to_id: text("offered_to_id"),
    offer_expires_at: timestamp("offer_expires_at"),
    automation_score: numeric("automation_score", { precision: 8, scale: 4 }),

    picked_up_at: timestamp("picked_up_at"),
    eta: timestamp("eta"),

    admin_notes: text("admin_notes"),
    ai_recommendation: text("ai_recommendation"),
    automation_reason: text("automation_reason"),

    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("orders_business_id_idx").on(t.business_id),
    index("orders_assigned_supplier_id_idx").on(t.assigned_supplier_id),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.created_at),
  ],
);

export type Order = typeof ordersTable.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type DeliveryMode = (typeof deliveryModeEnum.enumValues)[number];
