import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["supplier", "business_owner"]);
export const profileStatusEnum = pgEnum("profile_status", ["pending", "approved", "rejected"]);

export const profilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  user_id: text("user_id").notNull().unique(),
  email: text("email").notNull(),
  full_name: text("full_name").notNull(),
  company_name: text("company_name").notNull(),
  role: userRoleEnum("role").notNull(),
  business_type: text("business_type"),     // restaurant | cafe | supermarket | retail (for business_owner)
  phone: text("phone"),
  industry: text("industry"),
  country: text("country"),
  status: profileStatusEnum("status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
