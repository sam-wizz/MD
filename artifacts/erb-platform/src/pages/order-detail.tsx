import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MainNav } from "@/components/layout/main-nav";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useUpdateOrderStatus,
  getGetMyOrdersQueryKey,
} from "@workspace/api-client-react";
import { OrderMap } from "@/components/orders/order-map";
import { STATUS_FLOW, statusMeta, parseAiRecommendation, apiErrorMessage } from "@/lib/orders";
import { ArrowRight, CheckCircle2, MapPin, Package, Building2, Phone, StickyNote, Sparkles, XCircle } from "lucide-react";

/** صفحة تفاصيل الطلب وتتبع مساره على الخريطة. */
export default function OrderDetail({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const orderId = Number.parseInt(id, 10);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/auth");
  }, [user, authLoading, setLocation]);

  const { data: order, isLoading, error } = useGetOrder(orderId, {
    query: { enabled: !!user && Number.isFinite(orderId), queryKey: getGetOrderQueryKey(orderId) },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const cancelOrder = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        queryClient.invalidateQueries({ queryKey: getGetMyOrdersQueryKey() });
        toast({ title: "تم إلغاء الطلب" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });
  const isOwner = !!user && !!order && order.business_id === user.id;

  const meta = statusMeta(order?.status);
  const isTerminatedBadly = order?.status === "rejected" || order?.status === "cancelled";
  const flowIndex = order ? STATUS_FLOW.indexOf(order.status as (typeof STATUS_FLOW)[number]) : -1;
  const rec = parseAiRecommendation(order?.ai_recommendation);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <MainNav />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-xs font-bold text-slate-500 hover:text-zinc-800 transition-colors flex items-center gap-1.5 mb-4"
          data-testid="link-back-dashboard"
        >
          <ArrowRight className="h-3.5 w-3.5" /> العودة للوحة التحكم
        </button>

        {isLoading ? (
          <div className="p-16 text-center text-sm font-medium text-slate-500">جارٍ تحميل الطلب...</div>
        ) : error || !order ? (
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="p-10 text-center">
              <p className="text-sm font-bold text-slate-600">الطلب غير موجود أو لا تملك صلاحية عرضه</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* رأس الطلب */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                  <Package className="h-6 w-6 text-zinc-800" />
                  طلب التوريد #{order.id}
                </h1>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  {order.product_category} · أُنشئ في {new Date(order.created_at).toLocaleDateString("ar-SA")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && order.status === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-sm border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/30 text-xs font-bold"
                    disabled={cancelOrder.isPending}
                    onClick={() => {
                      if (window.confirm("هل أنت متأكد من إلغاء هذا الطلب؟")) {
                        cancelOrder.mutate({ id: order.id, data: { status: "cancelled" } });
                      }
                    }}
                    data-testid="button-cancel-order"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {cancelOrder.isPending ? "جارٍ الإلغاء..." : "إلغاء الطلب"}
                  </Button>
                )}
                <span className={`text-xs font-extrabold px-3.5 py-2 rounded-sm border ${meta.chip}`} data-testid="badge-order-status">
                  {meta.ar} · {meta.en}
                </span>
              </div>
            </div>

            {/* مسار الحالة */}
            {!isTerminatedBadly && (
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center">
                    {STATUS_FLOW.map((s, i) => {
                      const sMeta = statusMeta(s);
                      const done = flowIndex >= i;
                      const isLast = i === STATUS_FLOW.length - 1;
                      return (
                        <div key={s} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
                          <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${done ? "bg-zinc-900 border-zinc-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300"}`}>
                              {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                            </div>
                            <span className={`text-[9px] font-bold whitespace-nowrap ${done ? "text-zinc-800 dark:text-zinc-400" : "text-slate-400"}`}>
                              {sMeta.ar}
                            </span>
                          </div>
                          {!isLast && <div className={`flex-1 h-0.5 mx-1.5 mb-5 ${flowIndex > i ? "bg-zinc-900" : "bg-slate-200 dark:bg-slate-800"}`} />}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {isTerminatedBadly && (
              <Card className="rounded-sm border-red-200 bg-red-50 dark:bg-red-950/20 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">
                    {order.status === "rejected" ? "اعتذرت الإدارة عن هذا الطلب" : "تم إلغاء الطلب"}
                  </p>
                  {order.admin_notes && <p className="text-xs text-red-600/80 mt-1.5">{order.admin_notes}</p>}
                </CardContent>
              </Card>
            )}

            {/* الخريطة */}
            <Card className="rounded-sm border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                  <MapPin className="h-4 w-4 text-zinc-800" />
                  مسار التوريد · Delivery Route
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 bg-white dark:bg-slate-950">
                <OrderMap
                  supplierRegion={order.assigned_supplier_region}
                  deliveryRegion={order.delivery_region}
                  status={order.status}
                />
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* تفاصيل الطلب */}
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                  <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">تفاصيل الطلب</CardTitle>
                </CardHeader>
                <CardContent className="p-5 bg-white dark:bg-slate-950 space-y-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">الأصناف المطلوبة</div>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{order.items}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">التسليم</div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{order.delivery_region}</p>
                    {order.delivery_address && <p className="text-xs text-slate-500 mt-0.5">{order.delivery_address}</p>}
                  </div>
                  {order.notes && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <StickyNote className="h-3 w-3" /> ملاحظات
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{order.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* الأطراف */}
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                  <CardTitle className="text-sm font-bold text-slate-700 dark:text-slate-200">أطراف التوريد</CardTitle>
                </CardHeader>
                <CardContent className="p-5 bg-white dark:bg-slate-950 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 p-2 rounded-sm">
                      <Building2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">المنشأة الطالبة</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">{order.business_company}</div>
                      <div className="text-xs text-slate-400">{order.business_contact}</div>
                      {order.business_phone && (
                        <a href={`tel:${order.business_phone}`} className="text-xs text-zinc-800 font-bold flex items-center gap-1 mt-1">
                          <Phone className="h-3 w-3" /> <span dir="ltr">{order.business_phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-900 p-2 rounded-sm">
                      <Package className="h-4 w-4 text-zinc-800" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">المورد المكلف</div>
                      {order.assigned_supplier_company ? (
                        <>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">{order.assigned_supplier_company}</div>
                          {order.assigned_supplier_region && <div className="text-xs text-slate-400">ينطلق من {order.assigned_supplier_region}</div>}
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5">لم يُسند بعد — الإدارة تقارن العروض</div>
                      )}
                    </div>
                  </div>
                  {rec?.reasoning_ar && order.assigned_supplier_company && (
                    <div className="bg-zinc-50/60 dark:bg-zinc-950/20 border border-zinc-100 dark:border-zinc-900 rounded-sm p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-zinc-800" />
                        <span className="text-[10px] font-extrabold text-zinc-800 dark:text-zinc-400">لماذا هذا المورد؟</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{rec.reasoning_ar}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
