import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",      // بانتظار موافقة الإدارة
  "approved",     // وافقت الإدارة، بانتظار الإسناد
  "assigned",     // أُسند لمورد
  "preparing",    // المورد يجهز الطلب
  "in_transit",   // في الطريق
  "delivered",    // تم التسليم
  "rejected",     // رفضته الإدارة
  "cancelled",    // ألغاه صاحب المنشأة
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  business_id: text("business_id").notNull(),          // user_id لصاحب المنشأة (من الجلسة الموثقة)
  business_company: text("business_company").notNull(),
  business_contact: text("business_contact").notNull(),
  business_phone: text("business_phone"),
  product_category: text("product_category").notNull(),
  items: text("items").notNull(),                      // وصف الأصناف والكميات نصاً
  delivery_region: text("delivery_region").notNull(),  // المدينة/المنطقة بالعربي
  delivery_address: text("delivery_address"),
  notes: text("notes"),
  status: orderStatusEnum("status").notNull().default("pending"),
  assigned_supplier_id: text("assigned_supplier_id"),
  assigned_supplier_company: text("assigned_supplier_company"),
  assigned_supplier_region: text("assigned_supplier_region"),
  admin_notes: text("admin_notes"),
  ai_recommendation: text("ai_recommendation"),        // JSON نصي لتوصية الذكاء الاصطناعي
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type Order = typeof ordersTable.$inferSelect;
