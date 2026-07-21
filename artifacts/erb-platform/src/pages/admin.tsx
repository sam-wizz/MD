import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MainNav } from "@/components/layout/main-nav";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Package, Users, Tags, Sparkles, CheckCircle2, XCircle,
  Building2, Store, Clock, ChevronLeft,
} from "lucide-react";
import {
  useGetMyAccess, getGetMyAccessQueryKey,
  useAdminGetOrders, getAdminGetOrdersQueryKey,
  useAdminActOnOrder, useAdminRecommendSupplier,
  useAdminGetProfiles, getAdminGetProfilesQueryKey,
  useAdminSetProfileStatus,
  useAdminGetPrices, getAdminGetPricesQueryKey,
  type Order,
} from "@workspace/api-client-react";
import { statusMeta, parseAiRecommendation, apiErrorMessage } from "@/lib/orders";

type Tab = "orders" | "accounts" | "prices";

/** لوحة إدارة المنصة: اعتماد الطلبات والحسابات، توصية الذكاء الاصطناعي، والإسناد للموردين. */
export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("orders");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chosenSupplier, setChosenSupplier] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!authLoading && !user) setLocation("/auth");
  }, [user, authLoading, setLocation]);

  const { data: access, isLoading: accessLoading } = useGetMyAccess({
    query: { enabled: !!user, queryKey: getGetMyAccessQueryKey() },
  });
  const isAdmin = !!access?.is_admin;

  useEffect(() => {
    if (!accessLoading && access && !access.is_admin) setLocation("/dashboard");
  }, [access, accessLoading, setLocation]);

  const { data: orders, isLoading: ordersLoading } = useAdminGetOrders(undefined, {
    query: { enabled: isAdmin, queryKey: getAdminGetOrdersQueryKey() },
  });
  const { data: profiles, isLoading: profilesLoading } = useAdminGetProfiles(undefined, {
    query: { enabled: isAdmin, queryKey: getAdminGetProfilesQueryKey() },
  });
  const { data: prices, isLoading: pricesLoading } = useAdminGetPrices({
    query: { enabled: isAdmin, queryKey: getAdminGetPricesQueryKey() },
  });

  const invalidateOrders = () => queryClient.invalidateQueries({ queryKey: getAdminGetOrdersQueryKey() });
  const invalidateProfiles = () => queryClient.invalidateQueries({ queryKey: getAdminGetProfilesQueryKey() });

  const actOnOrder = useAdminActOnOrder({
    mutation: {
      onSuccess: () => { invalidateOrders(); toast({ title: "تم تنفيذ الإجراء" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const recommend = useAdminRecommendSupplier({
    mutation: {
      onSuccess: (order: Order) => {
        invalidateOrders();
        const rec = parseAiRecommendation(order.ai_recommendation);
        if (rec?.supplier_id) {
          setChosenSupplier((m) => ({ ...m, [order.id]: rec.supplier_id! }));
        }
        toast({ title: "جاهزة — راجع توصية الذكاء الاصطناعي وأسند الطلب" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err, "تعذر توليد التوصية"), variant: "destructive" }),
    },
  });

  const setProfileStatus = useAdminSetProfileStatus({
    mutation: {
      onSuccess: () => { invalidateProfiles(); toast({ title: "تم تحديث الحساب" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  if (authLoading || accessLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <MainNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-slate-300" />
            <div className="text-sm font-bold text-slate-500">جارٍ التحقق من الصلاحية...</div>
          </div>
        </div>
      </div>
    );
  }

  const approvedSuppliers = (profiles ?? []).filter((p) => p.role === "supplier" && p.status === "approved");
  const pendingProfiles = (profiles ?? []).filter((p) => p.status === "pending");
  const shownOrders = (orders ?? []).filter((o) => statusFilter === "all" || o.status === statusFilter);
  const pendingOrdersCount = (orders ?? []).filter((o) => o.status === "pending").length;

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-2 px-4 h-10 rounded-sm text-xs font-extrabold border transition-colors ${
        tab === t
          ? "bg-zinc-900 text-white border-zinc-600"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-zinc-300"
      }`}
      data-testid={`tab-${t}`}
    >
      {icon} {label}
      {!!badge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{badge}</span>}
    </button>
  );

  const filterChips = ["all", "pending", "approved", "assigned", "preparing", "in_transit", "delivered", "rejected"];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <MainNav />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-zinc-800" />
            لوحة الإدارة
          </h1>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-0.5">Madd Operations Panel</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabBtn("orders", "الطلبات", <Package className="h-4 w-4" />, pendingOrdersCount)}
          {tabBtn("accounts", "الحسابات", <Users className="h-4 w-4" />, pendingProfiles.length)}
          {tabBtn("prices", "أسعار الموردين", <Tags className="h-4 w-4" />)}
        </div>

        {/* ====== الطلبات ====== */}
        {tab === "orders" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-sm text-[11px] font-bold border transition-colors ${
                    statusFilter === s
                      ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                      : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700"
                  }`}
                  data-testid={`filter-${s}`}
                >
                  {s === "all" ? "الكل" : statusMeta(s).ar}
                </button>
              ))}
            </div>

            {ordersLoading ? (
              <div className="p-12 text-center text-sm font-medium text-slate-500">جارٍ تحميل الطلبات...</div>
            ) : !shownOrders.length ? (
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardContent className="p-10 text-center text-sm font-bold text-slate-500">لا توجد طلبات هنا</CardContent>
              </Card>
            ) : (
              shownOrders.map((o) => {
                const meta = statusMeta(o.status);
                const rec = parseAiRecommendation(o.ai_recommendation);
                const canDecide = o.status === "pending";
                const canAssign = o.status === "pending" || o.status === "approved";
                return (
                  <Card key={o.id} className="rounded-sm border-slate-200 shadow-sm" data-testid={`card-admin-order-${o.id}`}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                        <Link href={`/orders/${o.id}`} className="text-sm font-extrabold text-slate-900 dark:text-white hover:text-zinc-800 transition-colors">
                          #{o.id} · {o.business_company}
                        </Link>
                        <span className="text-xs text-slate-400">{o.product_category} · إلى {o.delivery_region}</span>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-sm border ${meta.chip} mr-auto`}>{meta.ar}</span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-sm p-3 leading-relaxed">
                        {o.items}
                      </p>

                      {o.assigned_supplier_company && (
                        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
                          المورد المكلف: {o.assigned_supplier_company}
                        </p>
                      )}

                      {rec && (
                        <div className="bg-zinc-50 dark:bg-zinc-950/30 border border-zinc-100 dark:border-zinc-900 rounded-sm p-3.5 space-y-2" data-testid={`panel-ai-rec-${o.id}`}>
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-zinc-800" />
                            <span className="text-xs font-extrabold text-zinc-900 dark:text-zinc-300">
                              توصية الذكاء الاصطناعي: {rec.supplier_company}
                              {rec.estimated_total && ` · تكلفة تقديرية ${rec.estimated_total} ر.س`}
                            </span>
                          </div>
                          {rec.reasoning_ar && <p className="text-xs text-zinc-900/70 dark:text-zinc-200/70 leading-relaxed">{rec.reasoning_ar}</p>}
                          {!!rec.ranking?.length && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {rec.ranking.slice(0, 4).map((r, i) => (
                                <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-900 border border-zinc-100 dark:border-zinc-900 rounded-sm px-2 py-1 text-slate-600 dark:text-slate-300">
                                  {i + 1}. {r.supplier_company} {r.estimated_total ? `· ${r.estimated_total} ر.س` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {canDecide && (
                          <>
                            <Button
                              size="sm"
                              className="rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                              disabled={actOnOrder.isPending}
                              onClick={() => actOnOrder.mutate({ id: o.id, data: { action: "approve" } })}
                              data-testid={`button-approve-${o.id}`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 ml-1" /> اعتماد
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-sm font-bold text-xs text-red-600 border-red-200 hover:bg-red-50"
                              disabled={actOnOrder.isPending}
                              onClick={() => actOnOrder.mutate({ id: o.id, data: { action: "reject" } })}
                              data-testid={`button-reject-${o.id}`}
                            >
                              <XCircle className="h-3.5 w-3.5 ml-1" /> رفض
                            </Button>
                          </>
                        )}
                        {canAssign && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-sm font-bold text-xs text-zinc-800 border-zinc-200 hover:bg-zinc-50"
                              disabled={recommend.isPending}
                              onClick={() => recommend.mutate({ id: o.id })}
                              data-testid={`button-recommend-${o.id}`}
                            >
                              <Sparkles className="h-3.5 w-3.5 ml-1" />
                              {recommend.isPending ? "جارٍ التحليل..." : "توصية الذكاء الاصطناعي"}
                            </Button>
                            <select
                              className="h-8 rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-slate-700 dark:text-slate-200"
                              value={chosenSupplier[o.id] ?? ""}
                              onChange={(e) => setChosenSupplier((m) => ({ ...m, [o.id]: e.target.value }))}
                              data-testid={`select-supplier-${o.id}`}
                            >
                              <option value="">اختر المورد...</option>
                              {approvedSuppliers.map((s) => (
                                <option key={s.user_id} value={s.user_id}>{s.company_name}{s.country ? ` — ${s.country}` : ""}</option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              className="rounded-sm bg-zinc-900 hover:bg-zinc-700 text-white font-bold text-xs"
                              disabled={actOnOrder.isPending || !chosenSupplier[o.id]}
                              onClick={() => actOnOrder.mutate({ id: o.id, data: { action: "assign", supplier_id: chosenSupplier[o.id] } })}
                              data-testid={`button-assign-${o.id}`}
                            >
                              إسناد الطلب <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ====== الحسابات ====== */}
        {tab === "accounts" && (
          <div className="space-y-4">
            {profilesLoading ? (
              <div className="p-12 text-center text-sm font-medium text-slate-500">جارٍ تحميل الحسابات...</div>
            ) : (
              <>
                {!!pendingProfiles.length && (
                  <Card className="rounded-sm border-amber-200 shadow-sm">
                    <CardHeader className="border-b border-amber-100 bg-amber-50/60 dark:bg-amber-950/20 py-3.5">
                      <CardTitle className="text-sm font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <Clock className="h-4 w-4" /> بانتظار الاعتماد ({pendingProfiles.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800/60">
                      {pendingProfiles.map((p) => (
                        <div key={p.id} className="p-4 flex flex-wrap items-center gap-3" data-testid={`row-pending-profile-${p.id}`}>
                          {p.role === "supplier" ? <Building2 className="h-5 w-5 text-zinc-800" /> : <Store className="h-5 w-5 text-emerald-600" />}
                          <div className="flex-1 min-w-[160px]">
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.company_name}</div>
                            <div className="text-xs text-slate-400">
                              {p.role === "supplier" ? "مورّد" : "صاحب منشأة"} · {p.full_name} · {p.email}
                              {p.country ? ` · ${p.country}` : ""}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                            disabled={setProfileStatus.isPending}
                            onClick={() => setProfileStatus.mutate({ id: p.id, data: { status: "approved" } })}
                            data-testid={`button-approve-profile-${p.id}`}
                          >
                            اعتماد
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-sm font-bold text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={setProfileStatus.isPending}
                            onClick={() => setProfileStatus.mutate({ id: p.id, data: { status: "rejected" } })}
                            data-testid={`button-reject-profile-${p.id}`}
                          >
                            رفض
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card className="rounded-sm border-slate-200 shadow-sm">
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3.5">
                    <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200">كل الحسابات ({profiles?.length ?? 0})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800/60">
                    {(profiles ?? []).map((p) => (
                      <div key={p.id} className="p-4 flex flex-wrap items-center gap-3" data-testid={`row-profile-${p.id}`}>
                        {p.role === "supplier" ? <Building2 className="h-4 w-4 text-zinc-800" /> : <Store className="h-4 w-4 text-emerald-600" />}
                        <div className="flex-1 min-w-[160px]">
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.company_name}</div>
                          <div className="text-xs text-slate-400">{p.role === "supplier" ? "مورّد" : "صاحب منشأة"} · {p.email}</div>
                        </div>
                        {p.is_admin && (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-sm border bg-zinc-100 text-zinc-900 border-zinc-200 inline-flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> إدارة
                          </span>
                        )}
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-sm border ${
                          p.status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : p.status === "pending" ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-red-100 text-red-800 border-red-200"
                        }`}>
                          {p.status === "approved" ? "معتمد" : p.status === "pending" ? "قيد المراجعة" : "مرفوض"}
                        </span>
                        {p.status !== "approved" ? (
                          <Button
                            size="sm" variant="outline" className="rounded-sm font-bold text-xs"
                            disabled={setProfileStatus.isPending}
                            onClick={() => setProfileStatus.mutate({ id: p.id, data: { status: "approved" } })}
                          >
                            اعتماد
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline" className="rounded-sm font-bold text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={setProfileStatus.isPending}
                            onClick={() => setProfileStatus.mutate({ id: p.id, data: { status: "rejected" } })}
                          >
                            إيقاف
                          </Button>
                        )}
                        {p.user_id !== user?.id && (
                          <Button
                            size="sm" variant="outline"
                            className={`rounded-sm font-bold text-xs ${p.is_admin ? "text-amber-700 border-amber-200 hover:bg-amber-50" : "text-zinc-800 border-zinc-200 hover:bg-zinc-50"}`}
                            disabled={setProfileStatus.isPending}
                            data-testid={`button-toggle-admin-${p.id}`}
                            onClick={() => setProfileStatus.mutate({ id: p.id, data: { is_admin: !p.is_admin } })}
                          >
                            {p.is_admin ? "سحب الإدارة" : "منح الإدارة"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ====== الأسعار ====== */}
        {tab === "prices" && (
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3.5">
              <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Tags className="h-4 w-4 text-zinc-800" /> أسعار الموردين المسجلة ({prices?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pricesLoading ? (
                <div className="p-12 text-center text-sm font-medium text-slate-500">جارٍ التحميل...</div>
              ) : !prices?.length ? (
                <div className="p-10 text-center">
                  <p className="text-sm font-bold text-slate-500 mb-1">لا توجد أسعار مسجلة بعد</p>
                  <p className="text-xs text-slate-400">اطلب من الموردين إدخال قوائم أسعارهم ليعمل الترشيح الآلي</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                      <tr>
                        <th className="text-right font-bold p-3">المنتج</th>
                        <th className="text-right font-bold p-3">التصنيف</th>
                        <th className="text-right font-bold p-3">الوحدة</th>
                        <th className="text-right font-bold p-3">السعر</th>
                        <th className="text-right font-bold p-3">المورد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {prices.map((p) => (
                        <tr key={p.id} data-testid={`row-admin-price-${p.id}`}>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{p.product_name}</td>
                          <td className="p-3 text-slate-500">{p.category}</td>
                          <td className="p-3 text-slate-500">{p.unit}</td>
                          <td className="p-3 font-extrabold text-zinc-800 dark:text-zinc-400 whitespace-nowrap">{Number(p.price).toLocaleString("ar-SA")} ر.س</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{p.supplier_company}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
