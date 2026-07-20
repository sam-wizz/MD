import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const supplierPricesTable = pgTable("supplier_prices", {
  id: serial("id").primaryKey(),
  supplier_id: text("supplier_id").notNull(),        // user_id للمورد (من الجلسة الموثقة)
  supplier_company: text("supplier_company").notNull(),
  product_name: text("product_name").notNull(),      // مثل: أرز بسمتي 5 كيلو
  category: text("category").notNull(),              // نفس تصنيفات الطلبات
  unit: text("unit").notNull(),                      // كيلو | كرتون | لتر | قطعة
  price: numeric("price", { precision: 10, scale: 2 }).notNull(), // بالريال السعودي
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type SupplierPrice = typeof supplierPricesTable.$inferSelect;
