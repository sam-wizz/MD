// بيانات مشتركة للطلبات: المناطق وإحداثياتها، التصنيفات، وحالات الطلب

export type RegionInfo = { name: string; lat: number; lng: number };

export const SAUDI_REGIONS: RegionInfo[] = [
  { name: "الرياض", lat: 24.7136, lng: 46.6753 },
  { name: "جدة", lat: 21.4858, lng: 39.1925 },
  { name: "مكة المكرمة", lat: 21.3891, lng: 39.8579 },
  { name: "المدينة المنورة", lat: 24.5247, lng: 39.5692 },
  { name: "الدمام", lat: 26.4207, lng: 50.0888 },
  { name: "الخبر", lat: 26.2172, lng: 50.1971 },
  { name: "الأحساء", lat: 25.383, lng: 49.586 },
  { name: "الجبيل", lat: 27.0046, lng: 49.646 },
  { name: "بريدة (القصيم)", lat: 26.326, lng: 43.975 },
  { name: "الطائف", lat: 21.2703, lng: 40.4158 },
  { name: "أبها", lat: 18.2465, lng: 42.5117 },
  { name: "خميس مشيط", lat: 18.306, lng: 42.7297 },
  { name: "تبوك", lat: 28.3838, lng: 36.555 },
  { name: "حائل", lat: 27.5114, lng: 41.7208 },
  { name: "عرعر", lat: 30.9753, lng: 41.0231 },
  { name: "سكاكا (الجوف)", lat: 29.9697, lng: 40.2064 },
  { name: "جازان", lat: 16.8892, lng: 42.5511 },
  { name: "نجران", lat: 17.4924, lng: 44.1277 },
  { name: "الباحة", lat: 20.0129, lng: 41.4677 },
  { name: "ينبع", lat: 24.0895, lng: 38.0618 },
];

/** يجد إحداثيات منطقة بالاسم (مطابقة مرنة)، وإلا الرياض. */
export function findRegion(name?: string | null): RegionInfo {
  const fallback = SAUDI_REGIONS[0];
  if (!name) return fallback;
  const clean = name.trim();
  const exact = SAUDI_REGIONS.find((r) => r.name === clean);
  if (exact) return exact;
  const partial = SAUDI_REGIONS.find((r) => r.name.includes(clean) || clean.includes(r.name.split(" ")[0]));
  return partial ?? fallback;
}

export const PRODUCT_CATEGORIES = [
  "اللحوم والدواجن",
  "الأسماك والمأكولات البحرية",
  "الأرز والحبوب",
  "الزيوت والسمن",
  "الألبان والأجبان",
  "الخضار والفواكه",
  "المعلبات والصلصات",
  "المشروبات والعصائر",
  "التوابل والبهارات",
  "المخبوزات والحلويات",
  "مواد التغليف",
  "مواد التنظيف",
  "أخرى",
];

export const PRICE_UNITS = ["كيلو", "كرتون", "لتر", "قطعة"];

export type OrderStatus =
  | "pending"
  | "approved"
  | "offered"
  | "assigned"
  | "preparing"
  | "ready_for_pickup"
  | "in_transit"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "needs_manual";

export const STATUS_FLOW: OrderStatus[] = [
  "pending",
  "approved",
  "offered",
  "assigned",
  "preparing",
  "ready_for_pickup",
  "in_transit",
  "delivered",
];

/** ألوان الحالة موحّدة عبر التطبيق */
export const STATUS_META: Record<
  OrderStatus,
  { ar: string; en: string; chip: string; dot: string; progress: number }
> = {
  pending: {
    ar: "بانتظار الموافقة",
    en: "Pending",
    chip: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    progress: 0.05,
  },
  approved: {
    ar: "تمت الموافقة",
    en: "Approved",
    chip: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",
    dot: "bg-blue-500",
    progress: 0.12,
  },
  offered: {
    ar: "معروض على مرشح",
    en: "Offered",
    chip: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-900",
    dot: "bg-indigo-500",
    progress: 0.18,
  },
  assigned: {
    ar: "أُسند لمورد",
    en: "Assigned",
    chip: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900",
    dot: "bg-violet-500",
    progress: 0.25,
  },
  preparing: {
    ar: "قيد التجهيز",
    en: "Preparing",
    chip: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-900",
    dot: "bg-orange-500",
    progress: 0.4,
  },
  ready_for_pickup: {
    ar: "جاهز للاستلام",
    en: "Ready for pickup",
    chip: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
    dot: "bg-amber-500",
    progress: 0.55,
  },
  in_transit: {
    ar: "في الطريق",
    en: "In Transit",
    chip: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-900",
    dot: "bg-cyan-500",
    progress: 0.7,
  },
  delivered: {
    ar: "تم التسليم",
    en: "Delivered",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
    dot: "bg-emerald-500",
    progress: 1,
  },
  rejected: {
    ar: "مرفوض",
    en: "Rejected",
    chip: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
    dot: "bg-red-500",
    progress: 0,
  },
  cancelled: {
    ar: "ملغي",
    en: "Cancelled",
    chip: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    dot: "bg-zinc-600",
    progress: 0,
  },
  needs_manual: {
    ar: "يتطلب تدخلاً يدوياً",
    en: "Needs manual",
    chip: "bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-900",
    dot: "bg-rose-500",
    progress: 0.1,
  },
};

/** حالات تُعدّ «نشطة» (ليست منتهية) */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "approved",
  "offered",
  "assigned",
  "preparing",
  "ready_for_pickup",
  "in_transit",
  "needs_manual",
];

export function deliveryModeLabel(mode?: string | null): string | null {
  if (mode === "supplier_delivery") return "توصيل ذاتي من المورد";
  if (mode === "logistics") return "جهة نقل";
  return null;
}
export function isActiveOrderStatus(status?: string): boolean {
  return ACTIVE_ORDER_STATUSES.includes((status as OrderStatus) ?? "pending");
}

export function parseMoney(value?: string | null): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatSar(amount: number): string {
  return `${amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
}

export function truncateText(text: string, max = 48): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function isSameMonth(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function statusMeta(status?: string) {
  return STATUS_META[(status as OrderStatus) ?? "pending"] ?? STATUS_META.pending;
}

/** رسالة خطأ عربية من استجابة الخادم إن وجدت. */
export function apiErrorMessage(err: unknown, fallback = "حدث خطأ — حاول مرة أخرى"): string {
  const e = err as any;
  return e?.data?.error || e?.errorData?.error || e?.body?.error || fallback;
}

/** توصية الذكاء الاصطناعي المخزنة كنص JSON. */
export type AiRecommendation = {
  supplier_id?: string;
  supplier_company?: string;
  estimated_total?: string;
  currency?: string;
  reasoning_ar?: string;
  ranking?: { supplier_id?: string; supplier_company?: string; estimated_total?: string; coverage_note?: string }[];
};

export function parseAiRecommendation(raw?: string | null): AiRecommendation | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as AiRecommendation; } catch { return null; }
}
