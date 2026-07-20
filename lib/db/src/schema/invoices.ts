import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * تحليل فواتير المنشآت السابقة:
 * صاحب المنشأة يرفع صورة فاتورته القديمة، الذكاء الاصطناعي يستخرج الأصناف
 * ويقارنها بأقل أسعار الموردين على المنصة، ويُحفظ التحليل هنا.
 */
export const invoiceAnalysesTable = pgTable("invoice_analyses", {
  id: serial("id").primaryKey(),
  business_id: text("business_id").notNull(),   // user_id لصاحب المنشأة
  file_name: text("file_name"),
  extracted_items: text("extracted_items").notNull(), // JSON نصي [{name, quantity, unit, price}]
  invoice_total: text("invoice_total"),                // إجمالي الفاتورة كما استخرجه الذكاء
  comparison: text("comparison").notNull(),            // JSON نصي لمقارنة كل صنف بأفضل سعر منصة
  platform_total: text("platform_total"),              // الإجمالي لو اشترى بأقل أسعار المنصة
  potential_saving: text("potential_saving"),          // الوفر المتوقع بالريال
  summary: text("summary"),                            // خلاصة عربية من الذكاء الاصطناعي
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type InvoiceAnalysis = typeof invoiceAnalysesTable.$inferSelect;
