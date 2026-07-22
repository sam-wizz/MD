import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { profilesTable } from "./profiles";

export const integrationScopeEnum = pgEnum("integration_scope", [
  "branches.read",
  "stock.read",
  "consumption.read",
]);

export const externalMapSourceEnum = pgEnum("external_map_source", [
  "auto",
  "manual",
]);

export const reorderSuggestionStatusEnum = pgEnum("reorder_suggestion_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const reorderRunSourceEnum = pgEnum("reorder_run_source", [
  "manual",
  "scheduled",
]);

export const integrationAdapterEnum = pgEnum("integration_adapter", [
  "mock",
  "hmztwsl",
]);

export const integrationAuditOperationEnum = pgEnum("integration_audit_operation", [
  "listBranches",
  "getStockLevels",
  "getConsumptionHistory",
]);

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  sales_unit: text("sales_unit").notNull(),
  cost_price: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
  sell_price: numeric("sell_price", { precision: 10, scale: 2 }).notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const integrationConsentsTable = pgTable(
  "integration_consents",
  {
    id: serial("id").primaryKey(),
    client_id: text("client_id")
      .notNull()
      .references(() => profilesTable.user_id, { onDelete: "cascade" }),
    scope: integrationScopeEnum("scope").notNull(),
    granted_at: timestamp("granted_at").notNull().defaultNow(),
    granted_by: text("granted_by")
      .notNull()
      .references(() => profilesTable.user_id, { onDelete: "cascade" }),
    revoked_at: timestamp("revoked_at"),
    revoked_by: text("revoked_by").references(() => profilesTable.user_id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("integration_consents_client_idx").on(table.client_id),
    uniqueIndex("integration_consents_active_scope_idx")
      .on(table.client_id, table.scope)
      .where(sql`${table.revoked_at} is null`),
  ],
);

export const externalItemMapTable = pgTable(
  "external_item_map",
  {
    id: serial("id").primaryKey(),
    client_id: text("client_id")
      .notNull()
      .references(() => profilesTable.user_id, { onDelete: "cascade" }),
    external_item_id: text("external_item_id").notNull(),
    external_item_name: text("external_item_name").notNull(),
    product_id: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    unit_conversion_factor: numeric("unit_conversion_factor", {
      precision: 14,
      scale: 6,
    })
      .notNull()
      .default("1"),
    confidence: numeric("confidence", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    mapped_by: externalMapSourceEnum("mapped_by").notNull().default("manual"),
    is_active: boolean("is_active").notNull().default(false),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("external_item_map_client_idx").on(table.client_id),
    uniqueIndex("external_item_map_active_idx")
      .on(table.client_id, table.external_item_id)
      .where(sql`${table.is_active} = true`),
  ],
);

export const clientReorderPoliciesTable = pgTable("client_reorder_policy", {
  client_id: text("client_id")
    .primaryKey()
    .references(() => profilesTable.user_id, { onDelete: "cascade" }),
  default_branch_id: text("default_branch_id"),
  lookback_days: integer("lookback_days").notNull().default(7),
  lead_time_days: integer("lead_time_days").notNull().default(1),
  safety_stock_ratio: numeric("safety_stock_ratio", {
    precision: 6,
    scale: 4,
  })
    .notNull()
    .default("0.2"),
  coverage_days: integer("coverage_days").notNull().default(3),
  rounding_step: numeric("rounding_step", { precision: 10, scale: 4 })
    .notNull()
    .default("1"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const reorderSuggestionsTable = pgTable(
  "reorder_suggestions",
  {
    id: serial("id").primaryKey(),
    client_id: text("client_id")
      .notNull()
      .references(() => profilesTable.user_id, { onDelete: "cascade" }),
    branch_id: text("branch_id").notNull(),
    branch_name: text("branch_name").notNull(),
    status: reorderSuggestionStatusEnum("status")
      .notNull()
      .default("pending_review"),
    run_source: reorderRunSourceEnum("run_source").notNull().default("manual"),
    generated_at: timestamp("generated_at").notNull().defaultNow(),
    reviewed_at: timestamp("reviewed_at"),
    reviewed_by: text("reviewed_by").references(() => profilesTable.user_id, {
      onDelete: "set null",
    }),
    approved_order_id: integer("approved_order_id").references(
      () => ordersTable.id,
      { onDelete: "set null" },
    ),
    missing_mapping_count: integer("missing_mapping_count").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("reorder_suggestions_client_idx").on(table.client_id, table.status),
  ],
);

export const reorderSuggestionItemsTable = pgTable(
  "reorder_suggestion_items",
  {
    id: serial("id").primaryKey(),
    suggestion_id: integer("suggestion_id")
      .notNull()
      .references(() => reorderSuggestionsTable.id, { onDelete: "cascade" }),
    product_id: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    product_name_snapshot: text("product_name_snapshot").notNull(),
    product_category_snapshot: text("product_category_snapshot").notNull(),
    external_item_id: text("external_item_id").notNull(),
    external_item_name: text("external_item_name").notNull(),
    unit_snapshot: text("unit_snapshot").notNull(),
    current_stock: numeric("current_stock", { precision: 14, scale: 4 }).notNull(),
    avg_daily_consumption: numeric("avg_daily_consumption", {
      precision: 14,
      scale: 4,
    }).notNull(),
    reorder_point: numeric("reorder_point", { precision: 14, scale: 4 }).notNull(),
    suggested_qty_raw: numeric("suggested_qty_raw", {
      precision: 14,
      scale: 4,
    }).notNull(),
    suggested_qty_rounded: numeric("suggested_qty_rounded", {
      precision: 14,
      scale: 4,
    }).notNull(),
    editable_qty: numeric("editable_qty", { precision: 14, scale: 4 }).notNull(),
    editable_unit_price: numeric("editable_unit_price", {
      precision: 10,
      scale: 2,
    }).notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("reorder_suggestion_items_suggestion_idx").on(table.suggestion_id)],
);

export const reorderUnmappedItemsTable = pgTable(
  "reorder_unmapped_items",
  {
    id: serial("id").primaryKey(),
    suggestion_id: integer("suggestion_id")
      .notNull()
      .references(() => reorderSuggestionsTable.id, { onDelete: "cascade" }),
    external_item_id: text("external_item_id").notNull(),
    external_item_name: text("external_item_name").notNull(),
    reason: text("reason").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("reorder_unmapped_items_suggestion_idx").on(table.suggestion_id)],
);

export const integrationAuditLogTable = pgTable(
  "integration_audit_log",
  {
    id: serial("id").primaryKey(),
    client_id: text("client_id")
      .notNull()
      .references(() => profilesTable.user_id, { onDelete: "cascade" }),
    consent_id: integer("consent_id").references(() => integrationConsentsTable.id, {
      onDelete: "set null",
    }),
    adapter: integrationAdapterEnum("adapter").notNull(),
    operation: integrationAuditOperationEnum("operation").notNull(),
    scope: integrationScopeEnum("scope").notNull(),
    branch_id: text("branch_id"),
    request_meta: jsonb("request_meta").notNull().default(sql`'{}'::jsonb`),
    success: boolean("success").notNull(),
    error_message: text("error_message"),
    duration_ms: integer("duration_ms").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("integration_audit_client_created_idx").on(table.client_id, table.created_at)],
);

export type Product = typeof productsTable.$inferSelect;
export type IntegrationConsent = typeof integrationConsentsTable.$inferSelect;
export type ExternalItemMap = typeof externalItemMapTable.$inferSelect;
export type ClientReorderPolicy = typeof clientReorderPoliciesTable.$inferSelect;
export type ReorderSuggestion = typeof reorderSuggestionsTable.$inferSelect;
export type ReorderSuggestionItem = typeof reorderSuggestionItemsTable.$inferSelect;
export type ReorderUnmappedItem = typeof reorderUnmappedItemsTable.$inferSelect;
export type IntegrationAuditLog = typeof integrationAuditLogTable.$inferSelect;
