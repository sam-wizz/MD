import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Package,
  PackageCheck,
  CalendarDays,
  Wallet,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateOrderStatus,
  getGetMyOrdersQueryKey,
  type Order,
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
import { OrderStatusBadge, ORDER_STATUS_FILTER_OPTIONS } from "@/components/orders/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DashboardErrorState, StatCardsSkeleton, TableSkeleton } from "@/components/dashboard/query-state";
import { StatCards } from "@/components/dashboard/stat-cards";
import { InvoiceAnalyzerCard } from "@/components/dashboard/invoice-analyzer-card";
import {
  filterBusinessOrders,
  useBusinessDashboard,
} from "@/hooks/use-business-dashboard";
import {
  PRODUCT_CATEGORIES,
  apiErrorMessage,
  truncateText,
} from "@/lib/orders";

const PAGE_SIZE = 8;

const selectCls =
  "h-9 w-full rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-zinc-500";

export function BusinessDashboardView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orders, stats, isLoading, isError, errorMessage, refetch } = useBusinessDashboard();

  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);

  const cancelOrder = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyOrdersQueryKey() });
        setCancelOrderId(null);
        toast({ title: "تم إلغاء الطلب" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const filtered = useMemo(
    () => filterBusinessOrders(orders, { status, category, search, dateFrom, dateTo }),
    [orders, status, category, search, dateFrom, dateTo],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatCardsSkeleton />
        <Card className="rounded-sm"><TableSkeleton /></Card>
      </div>
    );
  }

  if (isError) {
    return <DashboardErrorState message={errorMessage} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">
            لوحة صاحب المنشأة
          </h1>
          <p className="text-sm text-slate-500 mt-1">تابع طلبات التوريد والإنفاق من مكان واحد</p>
        </div>
        <Link href="/orders/new">
          <Button
            className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold gap-1.5 w-full sm:w-auto"
            data-testid="button-new-order"
          >
            <Plus className="h-4 w-4" />
            طلب جديد +
          </Button>
        </Link>
      </div>

      <StatCards
        items={[
          {
            key: "active",
            label: "طلبات نشطة",
            value: stats.active,
            hint: "غير مسلّمة / مرفوضة / ملغاة",
            icon: Package,
          },
          {
            key: "month",
            label: "طلبات هذا الشهر",
            value: stats.thisMonth,
            icon: CalendarDays,
          },
          {
            key: "done",
            label: "طلبات مكتملة",
            value: stats.completed,
            icon: PackageCheck,
          },
          {
            key: "spend",
            label: "إجمالي الإنفاق",
            value: stats.totalSpendLabel,
            hint: "من تحليلات الفواتير",
            icon: Wallet,
          },
        ]}
      />

      <Card id="orders" className="rounded-sm border-slate-200 dark:border-slate-800 shadow-sm scroll-mt-20">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
              طلباتي
            </CardTitle>
            <Link href="/orders/new">
              <Button size="sm" className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold gap-1">
                <Plus className="h-4 w-4" /> طلب جديد
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="بحث برقم الطلب أو الأصناف..."
                className="h-9 pr-9 rounded-sm text-xs"
                aria-label="بحث في الطلبات"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="filter-status">الحالة</label>
              <select
                id="filter-status"
                className={selectCls}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                {ORDER_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sr-only" htmlFor="filter-category">التصنيف</label>
              <select
                id="filter-category"
                className={selectCls}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">كل التصنيفات</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="sr-only" htmlFor="date-from">من تاريخ</label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-sm text-xs"
                />
              </div>
              <div>
                <label className="sr-only" htmlFor="date-to">إلى تاريخ</label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-sm text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {!filtered.length ? (
            <EmptyState
              title="لا توجد طلبات بعد"
              description="أنشئ أول طلب توريد وستتولى الإدارة مطابقته مع أفضل مورد"
              actionLabel="طلب جديد +"
              href="/orders/new"
            />
          ) : (
            <>
              <ResponsiveDataList
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right font-extrabold">رقم الطلب</TableHead>
                        <TableHead className="text-right font-extrabold">التصنيف</TableHead>
                        <TableHead className="text-right font-extrabold">الأصناف</TableHead>
                        <TableHead className="text-right font-extrabold">المنطقة</TableHead>
                        <TableHead className="text-right font-extrabold">الحالة</TableHead>
                        <TableHead className="text-right font-extrabold">التاريخ</TableHead>
                        <TableHead className="text-right font-extrabold">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((o) => (
                        <BusinessOrderRow
                          key={o.id}
                          order={o}
                          cancelling={cancelOrder.isPending}
                          onCancel={() => setCancelOrderId(o.id)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                }
                cards={pageRows.map((o) => {
                  const canCancel = o.status === "pending" || o.status === "approved";
                  return (
                    <MobileDataCard
                      key={o.id}
                      title={o.product_category || `#${o.id}`}
                      subtitle={`#${o.id}`}
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
                          <Link href={`/orders/${o.id}`} className="flex-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full rounded-sm h-8 text-xs gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              عرض التفاصيل
                            </Button>
                          </Link>
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-sm h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                              disabled={cancelOrder.isPending}
                              onClick={() => setCancelOrderId(o.id)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              إلغاء
                            </Button>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              />

              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400 font-medium">
                  {filtered.length} طلباً · صفحة {safePage} من {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="الصفحة السابقة"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="الصفحة التالية"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div id="invoices" className="scroll-mt-20">
        <InvoiceAnalyzerCard />
      </div>

      <AlertDialog open={cancelOrderId !== null} onOpenChange={(open) => !open && setCancelOrderId(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right font-extrabold">إلغاء الطلب</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs">
              هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-sm font-bold text-xs">تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold text-xs"
              disabled={cancelOrder.isPending}
              onClick={() => {
                if (cancelOrderId === null) return;
                cancelOrder.mutate({ id: cancelOrderId, data: { status: "cancelled" } });
              }}
            >
              تأكيد الإلغاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BusinessOrderRow({
  order: o,
  onCancel,
  cancelling,
}: {
  order: Order;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const canCancel = o.status === "pending" || o.status === "approved";
  return (
    <TableRow data-testid={`row-order-${o.id}`}>
      <TableCell className="font-extrabold tabular-nums">#{o.id}</TableCell>
      <TableCell className="text-xs font-semibold">{o.product_category}</TableCell>
      <TableCell className="text-xs text-slate-500 max-w-[220px]" title={o.items}>
        {truncateText(o.items, 42)}
      </TableCell>
      <TableCell className="text-xs">{o.delivery_region}</TableCell>
      <TableCell>
        <OrderStatusBadge status={o.status} />
      </TableCell>
      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
        {new Date(o.created_at).toLocaleDateString("ar-SA")}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Link href={`/orders/${o.id}`}>
            <Button size="sm" variant="outline" className="rounded-sm h-8 text-xs gap-1" aria-label={`تفاصيل الطلب ${o.id}`}>
              <Eye className="h-3.5 w-3.5" />
              عرض
            </Button>
          </Link>
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-sm h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
              disabled={cancelling}
              onClick={onCancel}
              aria-label={`إلغاء الطلب ${o.id}`}
            >
              <XCircle className="h-3.5 w-3.5" />
              إلغاء
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
