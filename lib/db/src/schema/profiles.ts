import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", [
  "supplier",
  "business_owner",
  "logistics",
]);
export const profileStatusEnum = pgEnum("profile_status", [
  "pending",
  "approved",
  "rejected",
]);

export const profilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull().unique(),
  email: text("email").notNull(),
  full_name: text("full_name").notNull(),
  company_name: text("company_name").notNull(),
  role: userRoleEnum("role").notNull(),
  business_type: text("business_type"), // restaurant | cafe | supermarket | retail
  phone: text("phone"),
  industry: text("industry"),
  country: text("country"),
  /** المدينة / المنطقة داخل المملكة */
  region: text("region"),
  /** سبب رفض الحساب */
  rejection_reason: text("rejection_reason"),
  status: profileStatusEnum("status").notNull().default("pending"),
  is_admin: boolean("is_admin").notNull().default(false),

  // ── قدرات المورد (للمطابقة الآلية) ──────────────────────────────────────
  /** التصنيفات التي يغطيها المورد — مطلوبة للمطابقة */
  categories: text("categories").array(),
  /** المناطق التي يخدمها — مطلوبة للمطابقة */
  service_regions: text("service_regions").array(),
  /** هل يستطيع التوصيل بنفسه أصلاً */
  delivers_self: boolean("delivers_self").notNull().default(false),
  /** مناطق التوصيل الذاتي */
  self_delivery_regions: text("self_delivery_regions").array(),
  /** الحد الأقصى للطلبات يومياً */
  daily_capacity: integer("daily_capacity"),
  /** ساعات العمل: { "0": ["09:00","17:00"], ... } يوم الأسبوع 0=الأحد */
  working_hours: jsonb("working_hours").$type<Record<string, [string, string]>>(),
  /** إيقاف مؤقت عن استقبال العروض */
  is_paused: boolean("is_paused").notNull().default(false),

  /** علم نزاع غير محلول — يمنع الاعتماد الآلي للطلبات */
  has_unresolved_dispute: boolean("has_unresolved_dispute").notNull().default(false),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
