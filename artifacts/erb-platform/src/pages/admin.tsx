import { useEffect, useState } from "react";
import { useLocation, Link, useSearch } from "wouter";
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
import { DashboardErrorState, StatCardsSkeleton, TableSkeleton } from "@/components/dashboard/query-state";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Package, Users, Tags, Sparkles, CheckCircle2, XCircle,
  Building2, Store, Clock, ChevronLeft, AlertTriangle, Settings, Activity,
  ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import {
  useGetMyAccess, getGetMyAccessQueryKey,
  useAdminGetOrders, getAdminGetOrdersQueryKey,
  useAdminGetNeedsAttention, getAdminGetNeedsAttentionQueryKey,
  useAdminGetAutomationHealth, getAdminGetAutomationHealthQueryKey,
  useAdminGetAutomationSettings, getAdminGetAutomationSettingsQueryKey,
  useAdminUpdateAutomationSettings,
  useAdminGetOrderOffers, getAdminGetOrderOffersQueryKey,
  useAdminActOnOrder, useAdminRecommendSupplier,
  useAdminGetProfiles, getAdminGetProfilesQueryKey,
  useAdminSetProfileStatus,
  useAdminGetPrices, getAdminGetPricesQueryKey,
  type Order,
  type OrderOffer,
} from "@workspace/api-client-react";
import { statusMeta, parseAiRecommendation, apiErrorMessage } from "@/lib/orders";

type Tab = "needs" | "orders" | "accounts" | "prices" | "settings";

const TAB_VALUES: Tab[] = ["needs", "orders", "accounts", "prices", "settings"];

function tabFromSearch(search: string): Tab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("tab");
  return TAB_VALUES.includes(value as Tab) ? (value as Tab) : "needs";
}

type AdminConfirm =
  | { kind: "reject_order"; orderId: number }
  | { kind: "force_assign"; orderId: number; supplierId: string; reason: string }
  | { kind: "reject_profile"; profileId: number; companyName: string }
  | { kind: "revoke_admin"; profileId: number; companyName: string };

type AutomationHealth = {
  mode?: string;
  enabled?: boolean;
  today?: {
    auto_approved?: number;
    auto_assigned?: number;
    fell_back_to_manual?: number;
  };
};

type AutomationWeights = {
  price?: number;
  acceptance_rate?: number;
  on_time_rate?: number;
  remaining_capacity?: number;
  region_bonus?: number;
};

type LogisticsWeights = {
  route_match?: number;
  cost?: number;
  on_time_rate?: number;
  current_load?: number;
};

type AutomationSettingsForm = {
  enabled?: boolean;
  mode?: string;
  auto_approve_enabled?: boolean;
  auto_assign_supplier_enabled?: boolean;
  auto_assign_logistics_enabled?: boolean;
  offer_ttl_minutes?: number;
  candidate_chain_cap?: number;
  min_confidence_score?: string;
  tie_margin?: string;
  daily_order_cap_per_business?: number;
  supplier_weights?: AutomationWeights;
  logistics_weights?: LogisticsWeights;
};

function OrderOffersPanel({ orderId, expanded }: { orderId: number; expanded: boolean }) {
  const { data: offers, isLoading } = useAdminGetOrderOffers(orderId, {
    query: { enabled: expanded, queryKey: getAdminGetOrderOffersQueryKey(orderId) },
  });

  if (!expanded) return null;

  if (isLoading) {
    return <p className="text-xs text-slate-500 py-2">جارٍ تحميل العروض...</p>;
  }

  if (!offers?.length) {
    return <p className="text-xs text-slate-400 py-2">لا توجد عروض مسجّلة لهذا الطلب</p>;
  }

  return (
    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-sm">
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
          <tr>
            <th className="text-right font-bold p-2">الرتبة</th>
            <th className="text-right font-bold p-2">الدور</th>
            <th className="text-right font-bold p-2">المرشح</th>
            <th className="text-right font-bold p-2">الدرجة</th>
            <th className="text-right font-bold p-2">التفصيل</th>
            <th className="text-right font-bold p-2">الرد</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {(offers as OrderOffer[]).map((offer) => (
            <tr key={offer.id ?? `${offer.candidate_id}-${offer.rank}`}>
              <td className="p-2 font-extrabold text-zinc-800">{offer.rank ?? "—"}</td>
              <td className="p-2 text-slate-500">{offer.candidate_role === "logistics" ? "نقل" : "مورد"}</td>
              <td className="p-2 font-bold text-slate-700 dark:text-slate-200" dir="ltr">{offer.candidate_id?.slice(0, 8)}…</td>
              <td className="p-2 font-extrabold text-indigo-700 dark:text-indigo-400">{offer.score ?? "—"}</td>
              <td className="p-2 text-slate-500 max-w-[140px]">
                {offer.score_breakdown
                  ? Object.entries(offer.score_breakdown).map(([k, v]) => `${k}: ${Number(v).toFixed(2)}`).join(" · ")
                  : "—"}
              </td>
              <td className="p-2">
                <span className={`font-bold ${offer.response === "accepted" ? "text-emerald-600" : offer.response === "rejected" ? "text-red-600" : "text-slate-400"}`}>
                  {offer.response === "accepted" ? "قبول" : offer.response === "rejected" ? "رفض" : "بانتظار"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type OrderCardProps = {
  order: Order;
  approvedSuppliers: { user_id: string; company_name: string; country?: string | null }[];
  chosenSupplier: Record<number, string>;
  setChosenSupplier: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  forceReason: Record<number, string>;
  setForceReason: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  expandedOffers: Record<number, boolean>;
  toggleOffers: (id: number) => void;
  actOnOrder: ReturnType<typeof useAdminActOnOrder>;
  recommend: ReturnType<typeof useAdminRecommendSupplier>;
  onRejectOrder: (orderId: number) => void;
  onForceAssign: (orderId: number) => void;
  highlight?: boolean;
};

function OrderAdminCard({
  order: o,
  approvedSuppliers,
  chosenSupplier,
  setChosenSupplier,
  forceReason,
  setForceReason,
  expandedOffers,
  toggleOffers,
  actOnOrder,
  recommend,
  onRejectOrder,
  onForceAssign,
  highlight,
}: OrderCardProps) {
  const meta = statusMeta(o.status);
  const rec = parseAiRecommendation(o.ai_recommendation);
  const canDecide = o.status === "pending" || o.status === "needs_manual";
  const canAssign = o.status === "pending" || o.status === "approved" || o.status === "needs_manual";
  const showForceAssign = o.status === "needs_manual" || o.status === "offered" || o.status === "approved";
  const isExpanded = !!expandedOffers[o.id];

  return (
    <Card
      key={o.id}
      className={`rounded-sm shadow-sm ${highlight ? "border-rose-200 dark:border-rose-900" : "border-slate-200"}`}
      data-testid={`card-admin-order-${o.id}`}
    >
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

        {o.automation_reason && (
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-sm p-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-rose-800 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> سبب التدخل اليدوي
            </div>
            <p className="text-xs text-rose-700/80 dark:text-rose-200/70 mt-1 leading-relaxed">{o.automation_reason}</p>
          </div>
        )}

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

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => toggleOffers(o.id)}
            className="flex items-center gap-1.5 text-[11px] font-extrabold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900"
            data-testid={`toggle-offers-${o.id}`}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            عروض المرشحين
          </button>
          <OrderOffersPanel orderId={o.id} expanded={isExpanded} />
        </div>

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
                onClick={() => onRejectOrder(o.id)}
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
          {showForceAssign && (
            <>
              <input
                type="text"
                placeholder="سبب الإسناد الإجباري (مطلوب)..."
                className="h-8 min-w-[200px] flex-1 rounded-sm border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 px-2 text-xs font-bold text-slate-700 dark:text-slate-200"
                value={forceReason[o.id] ?? ""}
                onChange={(e) => setForceReason((m) => ({ ...m, [o.id]: e.target.value }))}
                data-testid={`input-force-reason-${o.id}`}
              />
              <Button
                size="sm"
                variant="outline"
                className="rounded-sm font-bold text-xs text-amber-800 border-amber-300 hover:bg-amber-50"
                disabled={actOnOrder.isPending || !chosenSupplier[o.id] || !forceReason[o.id]?.trim()}
                onClick={() => onForceAssign(o.id)}
                data-testid={`button-force-assign-${o.id}`}
              >
                <Zap className="h-3.5 w-3.5 ml-1" /> إسناد إجباري
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** لوحة إدارة المنصة: طابور الانتباه، صحة الأتمتة، والإعدادات. */
export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>(() => tabFromSearch(search));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chosenSupplier, setChosenSupplier] = useState<Record<number, string>>({});
  const [forceReason, setForceReason] = useState<Record<number, string>>({});
  const [expandedOffers, setExpandedOffers] = useState<Record<number, boolean>>({});
  const [settingsForm, setSettingsForm] = useState<AutomationSettingsForm>({});
  const [confirmAction, setConfirmAction] = useState<AdminConfirm | null>(null);

  useEffect(() => {
    setTab(tabFromSearch(search));
  }, [search]);

  const changeTab = (t: Tab) => {
    setLocation(`/admin?tab=${t}`);
  };

  useEffect(() => {
    if (!authLoading && !user) setLocation(`/auth?redirect=${encodeURIComponent("/admin")}`);
  }, [user, authLoading, setLocation]);

  const { data: access, isLoading: accessLoading } = useGetMyAccess({
    query: { enabled: !!user, queryKey: getGetMyAccessQueryKey() },
  });
  const isAdmin = !!access?.is_admin;

  useEffect(() => {
    if (!accessLoading && access && !access.is_admin) setLocation("/dashboard");
  }, [access, accessLoading, setLocation]);

  const { data: needsAttention, isLoading: needsLoading, isError: needsError, error: needsErr, refetch: refetchNeeds } = useAdminGetNeedsAttention({
    query: { enabled: isAdmin, queryKey: getAdminGetNeedsAttentionQueryKey() },
  });
  const { data: health } = useAdminGetAutomationHealth({
    query: { enabled: isAdmin, queryKey: getAdminGetAutomationHealthQueryKey(), refetchInterval: 60_000 },
  });
  const { data: automationSettings, isLoading: settingsLoading } = useAdminGetAutomationSettings({
    query: { enabled: isAdmin && tab === "settings", queryKey: getAdminGetAutomationSettingsQueryKey() },
  });
  const { data: orders, isLoading: ordersLoading, isError: ordersError, error: ordersErr, refetch: refetchOrders } = useAdminGetOrders(undefined, {
    query: { enabled: isAdmin, queryKey: getAdminGetOrdersQueryKey() },
  });
  const { data: profiles, isLoading: profilesLoading, isError: profilesError, error: profilesErr, refetch: refetchProfiles } = useAdminGetProfiles(undefined, {
    query: { enabled: isAdmin, queryKey: getAdminGetProfilesQueryKey() },
  });
  const { data: prices, isLoading: pricesLoading, isError: pricesError, error: pricesErr, refetch: refetchPrices } = useAdminGetPrices({
    query: { enabled: isAdmin, queryKey: getAdminGetPricesQueryKey() },
  });

  useEffect(() => {
    if (automationSettings) {
      const s = automationSettings as AutomationSettingsForm;
      setSettingsForm({
        enabled: (s as { enabled?: boolean }).enabled ?? true,
        mode: s.mode ?? "shadow",
        auto_approve_enabled: s.auto_approve_enabled ?? true,
        auto_assign_supplier_enabled: s.auto_assign_supplier_enabled ?? true,
        auto_assign_logistics_enabled: s.auto_assign_logistics_enabled ?? true,
        offer_ttl_minutes: s.offer_ttl_minutes ?? 30,
        candidate_chain_cap: s.candidate_chain_cap ?? 5,
        min_confidence_score: String(s.min_confidence_score ?? "0.35"),
        tie_margin: String(s.tie_margin ?? "0.05"),
        daily_order_cap_per_business: s.daily_order_cap_per_business ?? 20,
        supplier_weights: s.supplier_weights ?? {},
        logistics_weights: s.logistics_weights ?? {},
      });
    }
  }, [automationSettings]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getAdminGetOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetNeedsAttentionQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetAutomationHealthQueryKey() });
  };

  const invalidateProfiles = () => queryClient.invalidateQueries({ queryKey: getAdminGetProfilesQueryKey() });

  const actOnOrder = useAdminActOnOrder({
    mutation: {
      onSuccess: () => { invalidateAll(); toast({ title: "تم تنفيذ الإجراء" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const recommend = useAdminRecommendSupplier({
    mutation: {
      onSuccess: (order: Order) => {
        invalidateAll();
        const rec = parseAiRecommendation(order.ai_recommendation);
        if (rec?.supplier_id) {
          setChosenSupplier((m) => ({ ...m, [order.id]: rec.supplier_id! }));
        }
        toast({ title: "جاهزة — راجع توصية الذكاء الاصطناعي وأسند الطلب" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err, "تعذر توليد التوصية"), variant: "destructive" }),
    },
  });

  const updateSettings = useAdminUpdateAutomationSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminGetAutomationSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminGetAutomationHealthQueryKey() });
        toast({ title: "تم حفظ إعدادات الأتمتة" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const setProfileStatus = useAdminSetProfileStatus({
    mutation: {
      onSuccess: () => { invalidateProfiles(); toast({ title: "تم تحديث الحساب" }); },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const toggleOffers = (id: number) => setExpandedOffers((m) => ({ ...m, [id]: !m[id] }));

  const handleRejectOrder = (orderId: number) => {
    setConfirmAction({ kind: "reject_order", orderId });
  };

  const handleForceAssign = (orderId: number) => {
    const supplierId = chosenSupplier[orderId];
    const reason = forceReason[orderId]?.trim();
    if (!supplierId || !reason) return;
    setConfirmAction({ kind: "force_assign", orderId, supplierId, reason });
  };

  const handleRejectProfile = (profileId: number, companyName: string) => {
    setConfirmAction({ kind: "reject_profile", profileId, companyName });
  };

  const handleRevokeAdmin = (profileId: number, companyName: string) => {
    setConfirmAction({ kind: "revoke_admin", profileId, companyName });
  };

  const executeConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.kind === "reject_order") {
      actOnOrder.mutate({ id: confirmAction.orderId, data: { action: "reject" } });
    } else if (confirmAction.kind === "force_assign") {
      actOnOrder.mutate({
        id: confirmAction.orderId,
        data: {
          action: "force_assign",
          supplier_id: confirmAction.supplierId,
          reason: confirmAction.reason,
        },
      });
    } else if (confirmAction.kind === "reject_profile") {
      setProfileStatus.mutate({ id: confirmAction.profileId, data: { status: "rejected" } });
    } else if (confirmAction.kind === "revoke_admin") {
      setProfileStatus.mutate({ id: confirmAction.profileId, data: { is_admin: false } });
    }
    setConfirmAction(null);
  };

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

  const healthData = health as AutomationHealth | undefined;
  const approvedSuppliers = (profiles ?? []).filter((p) => p.role === "supplier" && p.status === "approved");
  const pendingProfiles = (profiles ?? []).filter((p) => p.status === "pending");
  const shownOrders = (orders ?? []).filter((o) => statusFilter === "all" || o.status === statusFilter);
  const needsCount = needsAttention?.length ?? 0;

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      onClick={() => changeTab(t)}
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

  const filterChips = [
    "all", "needs_manual", "pending", "approved", "offered", "assigned",
    "preparing", "ready_for_pickup", "in_transit", "delivered", "rejected",
  ];

  const orderCardProps = {
    approvedSuppliers,
    chosenSupplier,
    setChosenSupplier,
    forceReason,
    setForceReason,
    expandedOffers,
    toggleOffers,
    actOnOrder,
    recommend,
    onRejectOrder: handleRejectOrder,
    onForceAssign: handleForceAssign,
  };

  const inputCls = "h-9 w-full rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-slate-700 dark:text-slate-200";
  const labelCls = "text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 block";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <MainNav />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-zinc-800" />
            لوحة الإدارة
          </h1>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-0.5">Madd Operations Panel</p>
        </div>

        {/* شريط صحة الأتمتة */}
        <Card className="rounded-sm border-zinc-200 dark:border-zinc-800 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-zinc-800" />
                <span className="text-xs font-extrabold text-slate-500">صحة الأتمتة اليوم</span>
              </div>
              <span
                className={`text-sm font-extrabold px-3 py-1.5 rounded-sm border ${
                  healthData?.mode === "live"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : "bg-amber-100 text-amber-900 border-amber-200"
                }`}
                data-testid="badge-automation-mode"
              >
                {healthData?.mode === "live" ? "مباشر LIVE" : "ظل SHADOW"}
              </span>
              <div className="flex flex-wrap gap-3 mr-auto text-center">
                <div className="px-3 py-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-sm">
                  <div className="text-lg font-extrabold text-blue-800 dark:text-blue-300">{healthData?.today?.auto_approved ?? 0}</div>
                  <div className="text-[10px] font-bold text-blue-600/70">اعتماد تلقائي</div>
                </div>
                <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-sm">
                  <div className="text-lg font-extrabold text-indigo-800 dark:text-indigo-300">{healthData?.today?.auto_assigned ?? 0}</div>
                  <div className="text-[10px] font-bold text-indigo-600/70">إسناد تلقائي</div>
                </div>
                <div className="px-3 py-1 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-sm">
                  <div className="text-lg font-extrabold text-rose-800 dark:text-rose-300">{healthData?.today?.fell_back_to_manual ?? 0}</div>
                  <div className="text-[10px] font-bold text-rose-600/70">تحويل يدوي</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 mb-6">
          {tabBtn("needs", "يحتاج انتباهاً", <AlertTriangle className="h-4 w-4" />, needsCount)}
          {tabBtn("orders", "الطلبات", <Package className="h-4 w-4" />)}
          {tabBtn("accounts", "الحسابات", <Users className="h-4 w-4" />, pendingProfiles.length)}
          {tabBtn("prices", "أسعار الموردين", <Tags className="h-4 w-4" />)}
          {tabBtn("settings", "الإعدادات", <Settings className="h-4 w-4" />)}
        </div>

        {/* ====== يحتاج انتباهاً ====== */}
        {tab === "needs" && (
          <div className="space-y-4">
            {needsError ? (
              <DashboardErrorState message={apiErrorMessage(needsErr)} onRetry={() => void refetchNeeds()} />
            ) : needsLoading ? (
              <Card className="rounded-sm"><TableSkeleton rows={4} /></Card>
            ) : !needsAttention?.length ? (
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardContent className="p-10 text-center text-sm font-bold text-slate-500">لا توجد طلبات تحتاج تدخلاً يدوياً 🎉</CardContent>
              </Card>
            ) : (
              needsAttention.map((o) => (
                <OrderAdminCard key={o.id} order={o} highlight {...orderCardProps} />
              ))
            )}
          </div>
        )}

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

            {ordersError ? (
              <DashboardErrorState message={apiErrorMessage(ordersErr)} onRetry={() => void refetchOrders()} />
            ) : ordersLoading ? (
              <Card className="rounded-sm"><TableSkeleton rows={4} /></Card>
            ) : !shownOrders.length ? (
              <Card className="rounded-sm border-slate-200 shadow-sm">
                <CardContent className="p-10 text-center text-sm font-bold text-slate-500">لا توجد طلبات هنا</CardContent>
              </Card>
            ) : (
              shownOrders.map((o) => <OrderAdminCard key={o.id} order={o} {...orderCardProps} />)
            )}
          </div>
        )}

        {/* ====== الحسابات ====== */}
        {tab === "accounts" && (
          <div className="space-y-4">
            {profilesError ? (
              <DashboardErrorState message={apiErrorMessage(profilesErr)} onRetry={() => void refetchProfiles()} />
            ) : profilesLoading ? (
              <Card className="rounded-sm"><TableSkeleton rows={6} /></Card>
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
                            onClick={() => handleRejectProfile(p.id, p.company_name)}
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
                            onClick={() => handleRejectProfile(p.id, p.company_name)}
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
                            onClick={() =>
                              p.is_admin
                                ? handleRevokeAdmin(p.id, p.company_name)
                                : setProfileStatus.mutate({ id: p.id, data: { is_admin: true } })
                            }
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
              {pricesError ? (
                <div className="p-4">
                  <DashboardErrorState message={apiErrorMessage(pricesErr)} onRetry={() => void refetchPrices()} />
                </div>
              ) : pricesLoading ? (
                <TableSkeleton rows={6} />
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

        {/* ====== إعدادات الأتمتة ====== */}
        {tab === "settings" && (
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3.5">
              <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Settings className="h-4 w-4 text-zinc-800" /> إعدادات الأتمتة
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              {settingsLoading ? (
                <div className="p-8 text-center text-sm text-slate-500">جارٍ التحميل...</div>
              ) : (
                <>
                  <label className="flex items-center gap-3 p-3 rounded-sm border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.enabled !== false}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, enabled: e.target.checked }))}
                      className="rounded-sm"
                      data-testid="checkbox-automation-enabled"
                    />
                    <span className="text-xs font-extrabold text-rose-900 dark:text-rose-100">
                      الأتمتة مفعّلة (إيقاف فوري دون إعادة نشر)
                    </span>
                  </label>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>الوضع</label>
                      <select
                        className={inputCls}
                        value={settingsForm.mode ?? "shadow"}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, mode: e.target.value }))}
                        data-testid="select-automation-mode"
                      >
                        <option value="shadow">ظل (Shadow)</option>
                        <option value="live">مباشر (Live)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>مهلة العرض (دقيقة)</label>
                      <input type="number" className={inputCls} value={settingsForm.offer_ttl_minutes ?? 30}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, offer_ttl_minutes: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className={labelCls}>حد سلسلة المرشحين</label>
                      <input type="number" className={inputCls} value={settingsForm.candidate_chain_cap ?? 5}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, candidate_chain_cap: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className={labelCls}>حد الثقة الأدنى</label>
                      <input type="text" className={inputCls} value={settingsForm.min_confidence_score ?? "0.35"}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, min_confidence_score: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>هامش التعادل</label>
                      <input type="text" className={inputCls} value={settingsForm.tie_margin ?? "0.05"}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, tie_margin: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>حد الطلبات اليومي/منشأة</label>
                      <input type="number" className={inputCls} value={settingsForm.daily_order_cap_per_business ?? 20}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, daily_order_cap_per_business: Number(e.target.value) }))} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {([
                      ["auto_approve_enabled", "اعتماد تلقائي"],
                      ["auto_assign_supplier_enabled", "إسناد مورد تلقائي"],
                      ["auto_assign_logistics_enabled", "إسناد نقل تلقائي"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!settingsForm[key]}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, [key]: e.target.checked }))}
                          className="rounded-sm"
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-xs font-extrabold text-slate-600 dark:text-slate-300 mb-3">أوزان الموردين</h3>
                    <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {(["price", "acceptance_rate", "on_time_rate", "remaining_capacity", "region_bonus"] as const).map((k) => (
                        <div key={k}>
                          <label className={labelCls}>{k}</label>
                          <input
                            type="number" step="0.01" className={inputCls}
                            value={settingsForm.supplier_weights?.[k] ?? 0}
                            onChange={(e) => setSettingsForm((f) => ({
                              ...f,
                              supplier_weights: { ...f.supplier_weights, [k]: Number(e.target.value) },
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-extrabold text-slate-600 dark:text-slate-300 mb-3">أوزان النقل</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {(["route_match", "cost", "on_time_rate", "current_load"] as const).map((k) => (
                        <div key={k}>
                          <label className={labelCls}>{k}</label>
                          <input
                            type="number" step="0.01" className={inputCls}
                            value={settingsForm.logistics_weights?.[k] ?? 0}
                            onChange={(e) => setSettingsForm((f) => ({
                              ...f,
                              logistics_weights: { ...f.logistics_weights, [k]: Number(e.target.value) },
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    className="rounded-sm bg-zinc-900 hover:bg-zinc-700 text-white font-bold text-xs"
                    disabled={updateSettings.isPending}
                    onClick={() => updateSettings.mutate({ data: settingsForm as Record<string, unknown> })}
                    data-testid="button-save-automation-settings"
                  >
                    {updateSettings.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right font-extrabold">
              {confirmAction?.kind === "reject_order" && "رفض الطلب"}
              {confirmAction?.kind === "force_assign" && "إسناد إجباري"}
              {confirmAction?.kind === "reject_profile" && "رفض الحساب"}
              {confirmAction?.kind === "revoke_admin" && "سحب صلاحية الإدارة"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs">
              {confirmAction?.kind === "reject_order" &&
                "هل أنت متأكد من رفض هذا الطلب؟ لا يمكن التراجع."}
              {confirmAction?.kind === "force_assign" &&
                `سيتم إسناد الطلب #${confirmAction.orderId} إجبارياً. السبب: «${confirmAction.reason}»`}
              {confirmAction?.kind === "reject_profile" &&
                `هل تريد رفض أو إيقاف حساب «${confirmAction.companyName}»؟`}
              {confirmAction?.kind === "revoke_admin" &&
                `هل تريد سحب صلاحية الإدارة من «${confirmAction.companyName}»؟`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-sm font-bold text-xs">تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold text-xs"
              onClick={executeConfirm}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
