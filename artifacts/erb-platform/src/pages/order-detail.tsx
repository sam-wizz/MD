import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MainNav } from "@/components/layout/main-nav";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useGetOrderHistory,
  getGetOrderHistoryQueryKey,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useGetOrderDeliveryOptions,
  getGetOrderDeliveryOptionsQueryKey,
  useUpdateOrderStatus,
  getGetMyOrdersQueryKey,
  useAcceptOrderOffer,
  useRejectOrderOffer,
  type OrderStatusHistory,
  type AcceptOrderOfferBodyDeliveryMode,
} from "@workspace/api-client-react";
import { OrderMap } from "@/components/orders/order-map";
import { statusMeta, deliveryModeLabel, parseAiRecommendation, apiErrorMessage } from "@/lib/orders";
import {
  ArrowRight, CheckCircle2, MapPin, Package, Building2, Phone, StickyNote,
  Sparkles, XCircle, Clock, Truck, History,
} from "lucide-react";
import { DashboardErrorState } from "@/components/dashboard/query-state";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABELS: Record<string, string> = {
  business_owner: "صاحب منشأة",
  supplier: "مورد",
  logistics: "جهة نقل",
  admin: "إدارة",
  automation: "أُسند تلقائياً",
  candidate: "مرشح",
};

function historyActorLabel(entry: OrderStatusHistory): string {
  if (entry.actor_kind === "system") return "أُسند تلقائياً";
  if (entry.actor_role) return ROLE_LABELS[entry.actor_role] ?? entry.actor_role;
  return "مستخدم";
}

function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setLabel("انتهت مهلة العرض");
        return;
      }
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setLabel(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 px-3 py-1.5 rounded-sm">
      <Clock className="h-3.5 w-3.5" />
      متبقٍ من العرض: {label}
    </span>
  );
}

/** صفحة تفاصيل الطلب وتتبع مساره. */
export default function OrderDetail({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const orderId = Number.parseInt(id, 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [confirmAction, setConfirmAction] = useState<"cancel" | "reject" | "delivered" | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<AcceptOrderOfferBodyDeliveryMode>("logistics");

  useEffect(() => {
    if (!authLoading && !user) setLocation(`/auth?redirect=${encodeURIComponent("/orders/" + (id || ""))}`);
  }, [user, authLoading, setLocation, id]);

  const { data: order, isLoading, error, refetch, isError } = useGetOrder(orderId, {
    query: { enabled: !!user && Number.isFinite(orderId), queryKey: getGetOrderQueryKey(orderId) },
  });

  const { data: history } = useGetOrderHistory(orderId, {
    query: { enabled: !!user && Number.isFinite(orderId), queryKey: getGetOrderHistoryQueryKey(orderId) },
  });

  const { data: profile } = useGetMyProfile({
    query: { enabled: !!user, queryKey: getGetMyProfileQueryKey() },
  });

  const role = profile?.role as string | undefined;
  const isOfferedCandidate = !!order && order.status === "offered" && order.offered_to_id === user?.id;
  const isAssignedSupplier = !!order && order.assigned_supplier_id === user?.id;
  const isAssignedLogistics = !!order && order.assigned_logistics_id === user?.id;
  const isOwner = !!user && !!order && order.business_id === user.id;

  const { data: deliveryOptions } = useGetOrderDeliveryOptions(orderId, {
    query: {
      enabled: !!user && isOfferedCandidate && role === "supplier",
      queryKey: getGetOrderDeliveryOptionsQueryKey(orderId),
    },
  });

  useEffect(() => {
    if (!deliveryOptions) return;
    if (deliveryOptions.supplier_delivery) setDeliveryMode("supplier_delivery");
    else if (deliveryOptions.logistics) setDeliveryMode("logistics");
  }, [deliveryOptions]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
    queryClient.invalidateQueries({ queryKey: getGetOrderHistoryQueryKey(orderId) });
    queryClient.invalidateQueries({ queryKey: getGetMyOrdersQueryKey() });
  };

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "تم تحديث حالة الطلب" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const acceptOffer = useAcceptOrderOffer({
    mutation: {
      onSuccess: () => { invalidate(); setAcceptOpen(false); toast({ title: "تم قبول العرض" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const rejectOffer = useRejectOrderOffer({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "تم رفض العرض" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const meta = statusMeta(order?.status);
  const isTerminatedBadly = order?.status === "rejected" || order?.status === "cancelled";
  const rec = parseAiRecommendation(order?.ai_recommendation);
  const dmLabel = deliveryModeLabel(order?.delivery_mode);
  const showCarrier = order?.delivery_mode !== "supplier_delivery";

  const canCancel = isOwner && order && ["pending", "approved", "offered", "assigned"].includes(order.status);
  const canAcceptOffer = isOfferedCandidate && role === "supplier";
  const canLogisticsAcceptOffer = isOfferedCandidate && role === "logistics";
  const canRejectOffer = isOfferedCandidate;
  const canStartPreparing = isAssignedSupplier && order?.status === "assigned";
  const canMarkInTransit = isAssignedSupplier && order?.status === "preparing" && order.delivery_mode === "supplier_delivery";
  const canMarkReadyForPickup = isAssignedSupplier && order?.status === "preparing" && order.delivery_mode === "logistics";
  const canLogisticsPickup = isAssignedLogistics && order?.status === "ready_for_pickup";
  const canMarkDelivered =
    order?.status === "in_transit" && (isAssignedSupplier || isAssignedLogistics);

  const hasActions =
    canCancel || canAcceptOffer || canLogisticsAcceptOffer || canRejectOffer ||
    canStartPreparing || canMarkInTransit || canMarkReadyForPickup || canLogisticsPickup || canMarkDelivered;

  const sortedHistory = [...(history ?? [])].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <MainNav />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <button
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else setLocation("/dashboard");
          }}
          className="text-xs font-bold text-slate-500 hover:text-zinc-800 transition-colors flex items-center gap-1.5 mb-4"
          data-testid="link-back-dashboard"
        >
          <ArrowRight className="h-3.5 w-3.5" /> العودة
        </button>

        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <DashboardErrorState
            message={apiErrorMessage(error, "تعذر تحميل الطلب")}
            onRetry={() => void refetch()}
          />
        ) : !order ? (
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="p-10 text-center">
              <p className="text-sm font-bold text-slate-600">الطلب غير موجود أو لا تملك صلاحية عرضه</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                  <Package className="h-6 w-6 text-zinc-800" />
                  طلب التوريد #{order.id}
                </h1>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  {order.product_category} · أُنشئ في {new Date(order.created_at).toLocaleDateString("ar-SA")}
                  {dmLabel && ` · ${dmLabel}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {order.status === "offered" && order.offer_expires_at && (
                  <OfferCountdown expiresAt={order.offer_expires_at} />
                )}
                <span className={`text-xs font-extrabold px-3.5 py-2 rounded-sm border ${meta.chip}`} data-testid="badge-order-status">
                  {meta.ar} · {meta.en}
                </span>
              </div>
            </div>

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

            {/* الجدول الزمني */}
            <Card className="rounded-sm border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
                <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                  <History className="h-4 w-4 text-zinc-800" />
                  سجل مسار الطلب
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 bg-white dark:bg-slate-950">
                {!sortedHistory.length ? (
                  <p className="text-xs text-slate-400 text-center py-4">لا يوجد سجل بعد</p>
                ) : (
                  <ol className="relative border-r-2 border-slate-200 dark:border-slate-800 mr-3 space-y-5">
                    {sortedHistory.map((entry) => {
                      const fromMeta = entry.from_status ? statusMeta(entry.from_status) : null;
                      const toMeta = statusMeta(entry.to_status);
                      return (
                        <li key={entry.id ?? `${entry.created_at}-${entry.to_status}`} className="mr-5">
                          <span className="absolute -right-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-zinc-800 border-2 border-white dark:border-slate-950" />
                          <time className="text-[10px] font-bold text-slate-400 block mb-0.5">
                            {entry.created_at ? new Date(entry.created_at).toLocaleString("ar-SA") : "—"}
                          </time>
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                            {fromMeta ? `${fromMeta.ar} ← ${toMeta.ar}` : toMeta.ar}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {historyActorLabel(entry)}
                            {entry.actor_kind === "system" && entry.note && (
                              <span className="text-zinc-600 dark:text-zinc-400"> · {entry.note}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            {hasActions && (
              <Card className="rounded-sm border-zinc-200 shadow-sm">
                <CardHeader className="border-b border-zinc-100 dark:border-zinc-900 py-3.5">
                  <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200">إجراءاتك</CardTitle>
                </CardHeader>
                <CardContent className="p-4 flex flex-wrap gap-2">
                  {canCancel && (
                    <Button
                      variant="outline" size="sm"
                      className="rounded-sm border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold"
                      onClick={() => setConfirmAction("cancel")}
                      data-testid="button-cancel-order"
                    >
                      <XCircle className="h-3.5 w-3.5 ml-1" /> إلغاء الطلب
                    </Button>
                  )}
                  {canAcceptOffer && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                      onClick={() => setAcceptOpen(true)}
                      data-testid="button-accept-offer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" /> قبول العرض
                    </Button>
                  )}
                  {canLogisticsAcceptOffer && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                      disabled={acceptOffer.isPending}
                      onClick={() => acceptOffer.mutate({ id: order.id })}
                      data-testid="button-logistics-accept-offer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" /> قبول عرض النقل
                    </Button>
                  )}
                  {canRejectOffer && (
                    <Button
                      variant="outline" size="sm"
                      className="rounded-sm border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold"
                      onClick={() => setConfirmAction("reject")}
                      data-testid="button-reject-offer"
                    >
                      <XCircle className="h-3.5 w-3.5 ml-1" /> رفض العرض
                    </Button>
                  )}
                  {canStartPreparing && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-zinc-900 hover:bg-zinc-700 text-white font-bold text-xs"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: order.id, data: { status: "preparing" } })}
                    >
                      بدء التجهيز
                    </Button>
                  )}
                  {canMarkInTransit && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: order.id, data: { status: "in_transit" } })}
                    >
                      <Truck className="h-3.5 w-3.5 ml-1" /> خرج للتوصيل
                    </Button>
                  )}
                  {canMarkReadyForPickup && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-amber-700 hover:bg-amber-600 text-white font-bold text-xs"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: order.id, data: { status: "ready_for_pickup" } })}
                    >
                      جاهز للاستلام
                    </Button>
                  )}
                  {canLogisticsPickup && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: order.id, data: { status: "in_transit" } })}
                    >
                      <Truck className="h-3.5 w-3.5 ml-1" /> استلام وانطلاق
                    </Button>
                  )}
                  {canMarkDelivered && (
                    <Button
                      size="sm"
                      className="rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                      onClick={() => setConfirmAction("delivered")}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" /> تأكيد التسليم
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

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
                    {dmLabel && <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mt-1">{dmLabel}</p>}
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
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">المورد</div>
                      {order.assigned_supplier_company ? (
                        <>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">{order.assigned_supplier_company}</div>
                          {order.assigned_supplier_region && <div className="text-xs text-slate-400">ينطلق من {order.assigned_supplier_region}</div>}
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5">لم يُسند بعد</div>
                      )}
                    </div>
                  </div>

                  {showCarrier && (
                    <div className="flex items-start gap-3">
                      <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-900 p-2 rounded-sm">
                        <Truck className="h-4 w-4 text-cyan-700" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">جهة النقل</div>
                        {order.assigned_logistics_company ? (
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">{order.assigned_logistics_company}</div>
                        ) : (
                          <div className="text-xs text-slate-400 mt-0.5">لم تُحدَّد بعد</div>
                        )}
                      </div>
                    </div>
                  )}

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

      {/* تأكيد الإلغاء / الرفض / التسليم */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right font-extrabold">
              {confirmAction === "cancel" && "إلغاء الطلب"}
              {confirmAction === "reject" && "رفض العرض"}
              {confirmAction === "delivered" && "تأكيد التسليم"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs">
              {confirmAction === "cancel" && "هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع."}
              {confirmAction === "reject" && "هل ترفض هذا العرض؟ سيتم عرض الطلب على مرشح آخر."}
              {confirmAction === "delivered" && "هل تؤكد اكتمال التسليم؟ هذا إجراء نهائي."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-sm font-bold text-xs">تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold text-xs"
              onClick={() => {
                if (!order) return;
                if (confirmAction === "cancel") {
                  updateStatus.mutate({ id: order.id, data: { status: "cancelled" } });
                } else if (confirmAction === "reject") {
                  rejectOffer.mutate({ id: order.id });
                } else if (confirmAction === "delivered") {
                  updateStatus.mutate({ id: order.id, data: { status: "delivered" } });
                }
                setConfirmAction(null);
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* قبول العرض — اختيار وضع التوصيل */}
      <AlertDialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right font-extrabold">قبول العرض</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs">
              اختر طريقة التوصيل لهذا الطلب:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {deliveryOptions?.supplier_delivery && (
              <label className="flex items-center gap-2 p-3 border border-slate-200 dark:border-slate-700 rounded-sm cursor-pointer text-xs font-bold">
                <input
                  type="radio"
                  name="delivery_mode"
                  checked={deliveryMode === "supplier_delivery"}
                  onChange={() => setDeliveryMode("supplier_delivery")}
                />
                توصيل ذاتي من المورد
              </label>
            )}
            {deliveryOptions?.logistics && (
              <label className="flex items-center gap-2 p-3 border border-slate-200 dark:border-slate-700 rounded-sm cursor-pointer text-xs font-bold">
                <input
                  type="radio"
                  name="delivery_mode"
                  checked={deliveryMode === "logistics"}
                  onChange={() => setDeliveryMode("logistics")}
                />
                عبر جهة نقل
              </label>
            )}
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-sm font-bold text-xs">تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-emerald-600 hover:bg-emerald-500 font-bold text-xs"
              disabled={acceptOffer.isPending}
              onClick={() => acceptOffer.mutate({ id: orderId, data: { delivery_mode: deliveryMode } })}
            >
              قبول العرض
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
