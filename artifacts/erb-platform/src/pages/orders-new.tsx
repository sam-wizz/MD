import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  PackagePlus,
  Eye,
  Plus,
} from "lucide-react";
import { createOrder, type Order } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import {
  PRODUCT_CATEGORIES,
  SAUDI_REGIONS,
  apiErrorMessage,
} from "@/lib/orders";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "madd:order-draft:v1";
const ITEMS_MAX = 2000;

const orderDraftSchema = z.object({
  product_category: z.string().min(1, "اختر تصنيف المنتجات"),
  items: z
    .string()
    .trim()
    .min(10, "وصف الأصناف يجب أن يكون ١٠ أحرف على الأقل")
    .max(ITEMS_MAX, `الحد الأقصى ${ITEMS_MAX} حرفاً`),
  delivery_region: z.string().min(1, "اختر مدينة التسليم"),
  delivery_address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

type OrderDraftValues = z.infer<typeof orderDraftSchema>;
type Step = 1 | 2 | 3;

const emptyDraft: OrderDraftValues = {
  product_category: PRODUCT_CATEGORIES[0],
  items: "",
  delivery_region: SAUDI_REGIONS[0]?.name ?? "",
  delivery_address: "",
  notes: "",
};

function loadDraft(): OrderDraftValues {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft;
    const parsed = JSON.parse(raw) as Partial<OrderDraftValues>;
    return {
      product_category: parsed.product_category || emptyDraft.product_category,
      items: parsed.items || "",
      delivery_region: parsed.delivery_region || emptyDraft.delivery_region,
      delivery_address: parsed.delivery_address || "",
      notes: parsed.notes || "",
    };
  } catch {
    return emptyDraft;
  }
}

function saveDraft(values: OrderDraftValues) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* no-op */
  }
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ord-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const selectCls =
  "flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** صفحة إنشاء طلب توريد — معالج بخطوات + مسودة + مراجعة */
export default function OrdersNew() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const form = useForm<OrderDraftValues>({
    resolver: zodResolver(orderDraftSchema),
    defaultValues: emptyDraft,
    mode: "onBlur",
  });

  useEffect(() => {
    const draft = loadDraft();
    form.reset(draft);
    const hasContent =
      draft.items.trim().length > 0 ||
      !!draft.delivery_address?.trim() ||
      !!draft.notes?.trim();
    setDirty(hasContent);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation(`/auth?redirect=${encodeURIComponent("/orders/new")}`);
    }
  }, [user, authLoading, setLocation]);

  // حفظ تلقائي للمسودة أثناء الكتابة (مسودة نموذج — ليست بيانات جلسة حسّاسة)
  useEffect(() => {
    const sub = form.watch((values) => {
      const draft = values as OrderDraftValues;
      saveDraft({
        product_category: draft.product_category || emptyDraft.product_category,
        items: draft.items || "",
        delivery_region: draft.delivery_region || emptyDraft.delivery_region,
        delivery_address: draft.delivery_address || "",
        notes: draft.notes || "",
      });
      setDirty(true);
    });
    return () => sub.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (!dirty || createdOrder) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, createdOrder]);

  const itemsValue = form.watch("items") || "";
  const itemsLen = itemsValue.length;
  const values = form.watch();

  const stepMeta = useMemo(
    () => [
      { n: 1 as const, label: "المحتوى" },
      { n: 2 as const, label: "التوصيل" },
      { n: 3 as const, label: "المراجعة" },
    ],
    [],
  );

  const goNext = useCallback(async () => {
    setServerError(null);
    if (step === 1) {
      const ok = await form.trigger(["product_category", "items"]);
      if (ok) setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await form.trigger([
        "delivery_region",
        "delivery_address",
        "notes",
      ]);
      if (ok) setStep(3);
    }
  }, [form, step]);

  const goBack = () => {
    setServerError(null);
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const confirmLeave = (href: string) => {
    if (dirty && !createdOrder) {
      setPendingHref(href);
      setLeaveOpen(true);
      return;
    }
    setLocation(href);
  };

  const submitWithIdempotency = async () => {
    const valid = await form.trigger();
    if (!valid || submitting) return;

    setSubmitting(true);
    setServerError(null);
    const v = form.getValues();

    try {
      const order = await createOrder(
        {
          product_category: v.product_category,
          items: v.items.trim(),
          delivery_region: v.delivery_region,
          delivery_address: v.delivery_address?.trim() || undefined,
          notes: v.notes?.trim() || undefined,
        },
        {
          headers: { "Idempotency-Key": idempotencyKeyRef.current },
        },
      );
      clearDraft();
      setDirty(false);
      setCreatedOrder(order);
    } catch (err) {
      setServerError(apiErrorMessage(err, "تعذر إرسال الطلب"));
      idempotencyKeyRef.current = newIdempotencyKey();
    } finally {
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    clearDraft();
    form.reset(emptyDraft);
    idempotencyKeyRef.current = newIdempotencyKey();
    setCreatedOrder(null);
    setStep(1);
    setDirty(false);
    setServerError(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Spinner className="h-6 w-6" aria-label="جارٍ التحميل" />
      </div>
    );
  }

  if (createdOrder) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <main className="flex-1 container mx-auto px-4 py-10 max-w-lg">
          <Card className="rounded-sm border-slate-200 shadow-sm text-center">
            <CardContent className="p-8 space-y-5">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  تم إرسال طلبك
                </h1>
                <p className="text-sm text-slate-500 mt-2">
                  رقم الطلب{" "}
                  <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                    #{createdOrder.id}
                  </span>
                </p>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  الحالة: بانتظار موافقة الإدارة. ستتم مطابقة طلبك مع أفضل مورد سعراً.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link href={`/orders/${createdOrder.id}`} className="flex-1">
                  <Button className="w-full rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold gap-1.5">
                    <Eye className="h-4 w-4" />
                    عرض الطلب
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-sm font-bold gap-1.5"
                  onClick={startAnother}
                >
                  <Plus className="h-4 w-4" />
                  إنشاء طلب آخر
                </Button>
              </div>
              <button
                type="button"
                className="text-xs font-bold text-slate-500 hover:text-zinc-800"
                onClick={() => setLocation("/dashboard")}
              >
                العودة للوحة التحكم
              </button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <button
          type="button"
          onClick={() => confirmLeave("/dashboard")}
          className="text-xs font-bold text-slate-500 hover:text-zinc-800 transition-colors flex items-center gap-1.5 mb-4"
        >
          <ArrowRight className="h-3.5 w-3.5" /> العودة للوحة التحكم
        </button>

        <Card className="rounded-sm border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-5 space-y-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2.5 font-extrabold text-slate-900 dark:text-white">
                <PackagePlus className="h-5 w-5 text-zinc-800" />
                طلب توريد جديد
              </CardTitle>
              <p className="text-xs text-slate-400 font-medium pt-1">
                تُحفظ مسودتك تلقائياً أثناء الكتابة — راجع البيانات قبل الإرسال
              </p>
            </div>

            <ol className="flex items-center gap-2" aria-label="خطوات إنشاء الطلب">
              {stepMeta.map((s, idx) => {
                const done = step > s.n;
                const current = step === s.n;
                return (
                  <li key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold border",
                        done && "bg-zinc-900 text-white border-zinc-900",
                        current &&
                          "bg-white text-zinc-900 border-zinc-900 ring-2 ring-zinc-900/20",
                        !done &&
                          !current &&
                          "bg-slate-100 text-slate-400 border-slate-200",
                      )}
                      aria-current={current ? "step" : undefined}
                    >
                      {s.n}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold truncate",
                        current
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-400",
                      )}
                    >
                      {s.label}
                    </span>
                    {idx < stepMeta.length - 1 && (
                      <div
                        className={cn(
                          "hidden sm:block flex-1 h-px",
                          done
                            ? "bg-zinc-900"
                            : "bg-slate-200 dark:bg-slate-700",
                        )}
                        aria-hidden
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </CardHeader>

          <CardContent className="p-6 bg-white dark:bg-slate-950 space-y-5">
            {serverError && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>تعذر الإرسال</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (step < 3) void goNext();
                  else void submitWithIdempotency();
                }}
                className="space-y-5"
                noValidate
              >
                {step === 1 && (
                  <>
                    <FormField
                      control={form.control}
                      name="product_category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>تصنيف المنتجات</FormLabel>
                          <FormControl>
                            <select {...field} className={selectCls} required>
                              {PRODUCT_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="items"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الأصناف والكميات المطلوبة</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="مثال: ٥٠ كيلو أرز بسمتي، ٢٠ كرتون دجاج مجمد، ١٠ عبوات زيت طبخ ١٨ لتر"
                              className="rounded-sm min-h-32 text-sm"
                              maxLength={ITEMS_MAX}
                            />
                          </FormControl>
                          <div className="flex items-start justify-between gap-2">
                            <FormMessage />
                            <p
                              className={cn(
                                "text-[11px] font-medium tabular-nums shrink-0",
                                itemsLen < 10
                                  ? "text-amber-600"
                                  : "text-slate-400",
                              )}
                              aria-live="polite"
                            >
                              {itemsLen} / {ITEMS_MAX}
                              {itemsLen < 10 ? " · الحد الأدنى ١٠" : ""}
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {step === 2 && (
                  <>
                    <FormField
                      control={form.control}
                      name="delivery_region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>مدينة التسليم</FormLabel>
                          <FormControl>
                            <select {...field} className={selectCls} required>
                              {SAUDI_REGIONS.map((r) => (
                                <option key={r.name} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="delivery_address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>العنوان التفصيلي (اختياري)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="الحي، الشارع، رقم المبنى"
                              className="rounded-sm h-10"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ملاحظات إضافية (اختياري)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="أوقات الاستلام المفضلة، اشتراطات التخزين..."
                              className="rounded-sm min-h-24 text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {step === 3 && (
                  <div className="space-y-4" aria-live="polite">
                    <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                      راجع طلبك قبل الإرسال
                    </h2>
                    <ReviewRow label="التصنيف" value={values.product_category} />
                    <ReviewRow label="الأصناف" value={values.items} multiline />
                    <ReviewRow
                      label="مدينة التسليم"
                      value={values.delivery_region}
                    />
                    <ReviewRow
                      label="العنوان"
                      value={values.delivery_address?.trim() || "—"}
                    />
                    <ReviewRow
                      label="ملاحظات"
                      value={values.notes?.trim() || "—"}
                      multiline
                    />
                    <p className="text-[11px] text-slate-400 leading-relaxed rounded-sm bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3">
                      بيانات منشأتك للتواصل تُؤخذ تلقائياً من ملفك الشخصي المعتمد.
                      الحالة الابتدائية: <strong>بانتظار الموافقة</strong>.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  {step > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-sm font-bold gap-1.5"
                      onClick={goBack}
                      disabled={submitting}
                    >
                      <ArrowRight className="h-4 w-4" />
                      رجوع
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button
                      type="button"
                      className="flex-1 rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold gap-1.5 h-11"
                      onClick={() => void goNext()}
                    >
                      التالي
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="flex-1 rounded-sm bg-zinc-900 hover:bg-zinc-700 font-extrabold h-11 gap-2"
                      disabled={submitting}
                      onClick={() => void submitWithIdempotency()}
                      data-testid="button-submit-order"
                    >
                      {submitting ? (
                        <>
                          <Spinner
                            className="text-white"
                            aria-label="جارٍ الإرسال"
                          />
                          جارٍ الإرسال...
                        </>
                      ) : (
                        "تأكيد وإرسال الطلب"
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right font-extrabold">مغادرة الصفحة</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs">
              لديك مسودة غير مُرسلة. هل تريد المغادرة؟ سيتم الاحتفاظ بالمسودة في هذه الجلسة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-sm font-bold text-xs">البقاء</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold text-xs"
              onClick={() => {
                if (pendingHref) setLocation(pendingHref);
                setLeaveOpen(false);
                setPendingHref(null);
              }}
            >
              مغادرة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-sm border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-3 text-right">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold text-slate-800 dark:text-slate-100",
          multiline && "whitespace-pre-wrap leading-relaxed",
        )}
      >
        {value}
      </div>
    </div>
  );
}
