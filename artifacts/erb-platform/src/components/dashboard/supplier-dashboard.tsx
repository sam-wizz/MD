import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Package,
  Truck,
  PackageCheck,
  Eye,
  Plus,
  Trash2,
  Upload,
  Tags,
} from "lucide-react";
import {
  useUpdateOrderStatus,
  useCreatePrice,
  useDeletePrice,
  createPrice as createPriceRequest,
  getGetAssignedOrdersQueryKey,
  getGetMyPricesQueryKey,
  type Order,
  type SupplierPrice,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileDataCard, ResponsiveDataList } from "@/components/ui/responsive-data-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  DashboardErrorState,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/dashboard/query-state";
import { StatCards } from "@/components/dashboard/stat-cards";
import { useSupplierDashboard } from "@/hooks/use-supplier-dashboard";
import {
  PRODUCT_CATEGORIES,
  PRICE_UNITS,
  apiErrorMessage,
  formatSar,
  truncateText,
} from "@/lib/orders";

const selectCls =
  "h-9 w-full rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-zinc-500";

function nextAction(
  status: string,
): { label: string; next: "preparing" | "in_transit" | "delivered" } | null {
  if (status === "assigned") return { label: "بدء التجهيز", next: "preparing" };
  if (status === "preparing") return { label: "خرج للتوصيل", next: "in_transit" };
  if (status === "in_transit") return { label: "تم التسليم", next: "delivered" };
  return null;
}

export function SupplierDashboardView() {
  const dash = useSupplierDashboard();

  if (dash.isLoading) {
    return (
      <div className="space-y-6">
        <StatCardsSkeleton />
        <Card className="rounded-sm"><TableSkeleton /></Card>
        <Card className="rounded-sm"><TableSkeleton rows={3} /></Card>
      </div>
    );
  }

  if (dash.isError) {
    return <DashboardErrorState message={dash.errorMessage} onRetry={dash.refetch} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
          لوحة المورّد
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          أدر الطلبات المسندة إليك وحدّث قائمة أسعارك
        </p>
      </div>

      <StatCards
        items={[
          {
            key: "assigned",
            label: "مسندة إليّ",
            value: dash.stats.assigned,
            icon: ClipboardList,
          },
          {
            key: "preparing",
            label: "قيد التجهيز",
            value: dash.stats.preparing,
            icon: Package,
          },
          {
            key: "transit",
            label: "في الطريق",
            value: dash.stats.inTransit,
            icon: Truck,
          },
          {
            key: "done",
            label: "مكتملة هذا الشهر",
            value: dash.stats.completedThisMonth,
            icon: PackageCheck,
          },
        ]}
      />

      <AssignedOrdersSection orders={dash.orders} />
      <SupplierPricesSection prices={dash.prices} />
    </div>
  );
}

function AssignedOrdersSection({ orders }: { orders: Order[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sorted = useMemo(
    () =>
      orders
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [orders],
  );

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAssignedOrdersQueryKey() });
        toast({ title: "تم تحديث حالة الطلب" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  return (
    <Card id="assigned" className="rounded-sm border-slate-200 dark:border-slate-800 shadow-sm scroll-mt-20">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          الطلبات المسندة
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!sorted.length ? (
          <EmptyState
            title="لا توجد طلبات بعد"
            description="عندما تسند إليك الإدارة طلباً سيظهر هنا مع تفاصيل التوصيل"
            icon={ClipboardList}
          />
        ) : (
          <ResponsiveDataList
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-extrabold">رقم الطلب</TableHead>
                    <TableHead className="text-right font-extrabold">المنشأة</TableHead>
                    <TableHead className="text-right font-extrabold">التصنيف</TableHead>
                    <TableHead className="text-right font-extrabold">الأصناف</TableHead>
                    <TableHead className="text-right font-extrabold">المنطقة</TableHead>
                    <TableHead className="text-right font-extrabold">الحالة</TableHead>
                    <TableHead className="text-right font-extrabold">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((o) => {
                    const action = nextAction(o.status);
                    return (
                      <TableRow key={o.id} data-testid={`row-assigned-${o.id}`}>
                        <TableCell className="font-extrabold tabular-nums">#{o.id}</TableCell>
                        <TableCell className="text-xs font-semibold">{o.business_company}</TableCell>
                        <TableCell className="text-xs">{o.product_category}</TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[200px]" title={o.items}>
                          {truncateText(o.items, 40)}
                        </TableCell>
                        <TableCell className="text-xs">{o.delivery_region}</TableCell>
                        <TableCell>
                          <OrderStatusBadge status={o.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {action && (
                              <Button
                                size="sm"
                                className="rounded-sm h-8 text-xs bg-zinc-900 hover:bg-zinc-700 font-bold"
                                disabled={updateStatus.isPending}
                                onClick={() =>
                                  updateStatus.mutate({ id: o.id, data: { status: action.next } })
                                }
                              >
                                {action.label}
                              </Button>
                            )}
                            <Link href={`/orders/${o.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-sm h-8 text-xs gap-1"
                                aria-label={`تفاصيل الطلب ${o.id}`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                عرض
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
            cards={sorted.map((o) => {
              const action = nextAction(o.status);
              return (
                <MobileDataCard
                  key={o.id}
                  title={o.product_category || `#${o.id}`}
                  subtitle={`#${o.id} · ${o.business_company}`}
                  rows={[
                    { label: "الحالة", value: <OrderStatusBadge status={o.status} /> },
                    { label: "المنطقة", value: o.delivery_region },
                    {
                      label: "التاريخ",
                      value: new Date(o.created_at).toLocaleDateString("ar-SA"),
                    },
                  ]}
                  footer={
                    <div className="flex items-center gap-2">
                      {action && (
                        <Button
                          size="sm"
                          className="flex-1 rounded-sm h-8 text-xs bg-zinc-900 hover:bg-zinc-700 font-bold"
                          disabled={updateStatus.isPending}
                          onClick={() =>
                            updateStatus.mutate({ id: o.id, data: { status: action.next } })
                          }
                        >
                          {action.label}
                        </Button>
                      )}
                      <Link href={`/orders/${o.id}`} className={action ? "" : "flex-1"}>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`rounded-sm h-8 text-xs gap-1 ${action ? "" : "w-full"}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          عرض التفاصيل
                        </Button>
                      </Link>
                    </div>
                  }
                />
              );
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SupplierPricesSection({ prices }: { prices: SupplierPrice[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    product_name: "",
    category: PRODUCT_CATEGORIES[0],
    unit: PRICE_UNITS[0],
    price: "",
  });
  const [csvBusy, setCsvBusy] = useState(false);
  const [deletePriceId, setDeletePriceId] = useState<number | null>(null);
  const [deletePriceName, setDeletePriceName] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetMyPricesQueryKey() });

  const createPrice = useCreatePrice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setForm((f) => ({ ...f, product_name: "", price: "" }));
        toast({ title: "أُضيف المنتج لقائمة أسعارك" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const deletePrice = useDeletePrice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeletePriceId(null);
        setDeletePriceName("");
        toast({ title: "تم حذف السعر" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const submit = () => {
    if (!form.product_name.trim() || !form.price.trim()) {
      toast({ title: "أدخل اسم المنتج والسعر", variant: "destructive" });
      return;
    }
    createPrice.mutate({ data: form });
  };

  const handleCsv = async (file: File) => {
    setCsvBusy(true);
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) {
        toast({ title: "الملف فارغ", variant: "destructive" });
        return;
      }

      // تخطّي صف العناوين إن وُجد
      const start =
        /product|منتج|name/i.test(lines[0]) || lines[0].includes(",")
          ? /product|منتج|name|category|تصنيف/i.test(lines[0])
            ? 1
            : 0
          : 0;

      let ok = 0;
      let fail = 0;
      for (let i = start; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 4) {
          fail += 1;
          continue;
        }
        const [product_name, category, unit, price] = cols;
        if (!product_name || !price) {
          fail += 1;
          continue;
        }
        try {
          await createPriceRequest({
            product_name,
            category: category || PRODUCT_CATEGORIES[0],
            unit: PRICE_UNITS.includes(unit) ? unit : PRICE_UNITS[0],
            price,
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      invalidate();
      toast({
        title: `اكتمل الاستيراد: ${ok} ناجح${fail ? `، ${fail} فشل` : ""}`,
      });
    } catch {
      toast({ title: "تعذر قراءة ملف CSV", variant: "destructive" });
    } finally {
      setCsvBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card id="prices" className="rounded-sm border-slate-200 dark:border-slate-800 shadow-sm scroll-mt-20">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4 space-y-1">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Tags className="h-4 w-4" />
          قائمة أسعاري
        </CardTitle>
        <p className="text-xs text-slate-400 font-medium">
          كلما كانت قائمتك أكمل وأسعارك أفضل، زادت فرص إسناد الطلبات إليك
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-sm p-3">
          <div className="col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1" htmlFor="price-product">
              اسم المنتج
            </label>
            <Input
              id="price-product"
              value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              placeholder="أرز بسمتي"
              className="h-9 rounded-sm text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1" htmlFor="price-category">
              التصنيف
            </label>
            <select
              id="price-category"
              className={selectCls}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1" htmlFor="price-unit">
              الوحدة
            </label>
            <select
              id="price-unit"
              className={selectCls}
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              {PRICE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1" htmlFor="price-value">
              السعر (ر.س)
            </label>
            <Input
              id="price-value"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="42.50"
              inputMode="decimal"
              className="h-9 rounded-sm text-xs"
            />
          </div>
          <Button
            type="button"
            onClick={submit}
            disabled={createPrice.isPending}
            className="h-9 rounded-sm bg-zinc-900 hover:bg-zinc-700 text-white font-bold text-xs gap-1"
          >
            <Plus className="h-4 w-4" /> إضافة
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="رفع ملف CSV للأسعار"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleCsv(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-sm text-xs gap-1.5"
            disabled={csvBusy || createPrice.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {csvBusy ? "جارٍ الاستيراد..." : "رفع CSV بالجملة"}
          </Button>
          <p className="text-[11px] text-slate-400">
            الأعمدة: product_name, category, unit, price
          </p>
        </div>

        {!prices.length ? (
          <EmptyState
            title="قائمتك فارغة"
            description="أضف منتجاتك وأسعارك ليقارنها النظام عند كل طلب توريد"
            icon={Tags}
            actionLabel="أضف أول منتج"
            onAction={() => document.getElementById("price-product")?.focus()}
          />
        ) : (
          <>
            <ResponsiveDataList
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right font-extrabold">المنتج</TableHead>
                      <TableHead className="text-right font-extrabold">التصنيف</TableHead>
                      <TableHead className="text-right font-extrabold">الوحدة</TableHead>
                      <TableHead className="text-right font-extrabold">السعر</TableHead>
                      <TableHead className="text-right font-extrabold">حذف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.map((p) => (
                      <TableRow key={p.id} data-testid={`row-price-${p.id}`}>
                        <TableCell className="font-bold text-sm">{p.product_name}</TableCell>
                        <TableCell className="text-xs text-slate-500">{p.category}</TableCell>
                        <TableCell className="text-xs">{p.unit}</TableCell>
                        <TableCell className="font-extrabold text-sm whitespace-nowrap">
                          {formatSar(Number(p.price))}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                            aria-label={`حذف ${p.product_name}`}
                            disabled={deletePrice.isPending}
                            onClick={() => {
                              setDeletePriceId(p.id);
                              setDeletePriceName(p.product_name);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={prices.map((p) => (
                <MobileDataCard
                  key={p.id}
                  title={p.product_name}
                  rows={[
                    { label: "التصنيف", value: p.category },
                    { label: "الوحدة", value: p.unit },
                    { label: "السعر", value: formatSar(Number(p.price)) },
                  ]}
                  footer={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full rounded-sm h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                      disabled={deletePrice.isPending}
                      onClick={() => {
                        setDeletePriceId(p.id);
                        setDeletePriceName(p.product_name);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  }
                />
              ))}
            />

            <AlertDialog
              open={deletePriceId !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setDeletePriceId(null);
                  setDeletePriceName("");
                }
              }}
            >
              <AlertDialogContent className="rounded-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-right font-extrabold">حذف السعر</AlertDialogTitle>
                  <AlertDialogDescription className="text-right text-xs">
                    هل تريد حذف «{deletePriceName}» من قائمة أسعارك؟
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                  <AlertDialogCancel className="rounded-sm font-bold text-xs">تراجع</AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold text-xs"
                    disabled={deletePrice.isPending}
                    onClick={() => {
                      if (deletePriceId === null) return;
                      deletePrice.mutate({ id: deletePriceId });
                    }}
                  >
                    تأكيد الحذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
