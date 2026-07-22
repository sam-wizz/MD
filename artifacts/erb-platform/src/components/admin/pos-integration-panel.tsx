import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  approvePosSuggestion,
  createPosItemMap,
  getPosConsents,
  getPosItemMaps,
  getPosPolicies,
  getPosProducts,
  getPosSuggestions,
  getPosSummary,
  grantPosConsents,
  rejectPosSuggestion,
  revokePosConsents,
  runPosSuggestions,
  updatePosItemMap,
  updatePosSuggestionItem,
  upsertPosPolicy,
  type PosSuggestion,
} from "@/lib/pos-admin-api";
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

const DEFAULT_POLICY = {
  lookback_days: 7,
  lead_time_days: 1,
  safety_stock_ratio: 0.2,
  coverage_days: 3,
  rounding_step: 1,
};

const SCOPE_SET = ["branches.read", "stock.read", "consumption.read"] as const;

type PolicyDraft = typeof DEFAULT_POLICY & { default_branch_id: string };

type ItemEdit = { qty: string; price: string };
type MapEdit = {
  product_id: string;
  unit_conversion_factor: string;
  confidence: string;
  is_active: boolean;
};

export function PosIntegrationPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>({
    ...DEFAULT_POLICY,
    default_branch_id: "",
  });
  const [itemEdits, setItemEdits] = useState<Record<number, ItemEdit>>({});
  const [mapEdits, setMapEdits] = useState<Record<number, MapEdit>>({});
  const [quickMappingProduct, setQuickMappingProduct] = useState<Record<string, string>>(
    {},
  );

  const summaryQuery = useQuery({
    queryKey: ["pos-summary"],
    queryFn: () => getPosSummary(),
  });
  const productsQuery = useQuery({
    queryKey: ["pos-products"],
    queryFn: () => getPosProducts(),
  });
  const policiesQuery = useQuery({
    queryKey: ["pos-policies"],
    queryFn: () => getPosPolicies(),
  });
  const consentsQuery = useQuery({
    queryKey: ["pos-consents", clientId],
    queryFn: () => getPosConsents(clientId),
    enabled: !!clientId,
  });
  const mapsQuery = useQuery({
    queryKey: ["pos-item-maps", clientId],
    queryFn: () => getPosItemMaps(clientId),
    enabled: !!clientId,
  });
  const suggestionsQuery = useQuery({
    queryKey: ["pos-suggestions", clientId],
    queryFn: () => getPosSuggestions(clientId),
    enabled: !!clientId,
  });

  const selectedClient = summaryQuery.data?.find((client) => client.user_id === clientId);
  const hasFullConsent =
    !!clientId &&
    SCOPE_SET.every((scope) =>
      (consentsQuery.data ?? []).some(
        (consent) => consent.scope === scope && consent.revoked_at === null,
      ),
    );

  useEffect(() => {
    if (!clientId && summaryQuery.data?.length) {
      setClientId(summaryQuery.data[0].user_id);
    }
  }, [clientId, summaryQuery.data]);

  useEffect(() => {
    if (!clientId) return;
    const policy = policiesQuery.data?.find((row) => row.client_id === clientId);
    if (!policy) {
      setPolicyDraft({ ...DEFAULT_POLICY, default_branch_id: "" });
      return;
    }
    setPolicyDraft({
      lookback_days: policy.lookback_days,
      lead_time_days: policy.lead_time_days,
      safety_stock_ratio: Number(policy.safety_stock_ratio),
      coverage_days: policy.coverage_days,
      rounding_step: Number(policy.rounding_step),
      default_branch_id: policy.default_branch_id ?? "",
    });
  }, [clientId, policiesQuery.data]);

  const invalidatePosQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pos-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["pos-consents", clientId] }),
      queryClient.invalidateQueries({ queryKey: ["pos-policies"] }),
      queryClient.invalidateQueries({ queryKey: ["pos-item-maps", clientId] }),
      queryClient.invalidateQueries({ queryKey: ["pos-suggestions", clientId] }),
    ]);
  };

  const grantConsentMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("اختر عميلًا أولًا");
      return grantPosConsents({ client_id: clientId });
    },
    onSuccess: async () => {
      await invalidatePosQueries();
      toast({ title: "تم تفعيل موافقة التكامل" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const revokeConsentMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("اختر عميلًا أولًا");
      return revokePosConsents({ client_id: clientId });
    },
    onSuccess: async () => {
      await invalidatePosQueries();
      toast({ title: "تم سحب موافقة التكامل" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const savePolicyMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("اختر عميلًا أولًا");
      return upsertPosPolicy(clientId, {
        default_branch_id: policyDraft.default_branch_id || null,
        lookback_days: Math.max(1, Math.trunc(policyDraft.lookback_days)),
        lead_time_days: Math.max(1, Math.trunc(policyDraft.lead_time_days)),
        safety_stock_ratio: Math.max(0, policyDraft.safety_stock_ratio),
        coverage_days: Math.max(1, Math.trunc(policyDraft.coverage_days)),
        rounding_step: Math.max(0.001, policyDraft.rounding_step),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos-policies"] });
      toast({ title: "تم حفظ سياسة إعادة الطلب" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const runClientMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("اختر عميلًا أولًا");
      return runPosSuggestions({ client_id: clientId });
    },
    onSuccess: async (result) => {
      await invalidatePosQueries();
      toast({
        title:
          result.status === "created"
            ? "تم إنشاء مسودة اقتراح جديدة"
            : `تم التشغيل (${result.status})`,
      });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const runAllMutation = useMutation({
    mutationFn: async () => runPosSuggestions(),
    onSuccess: async (result) => {
      await invalidatePosQueries();
      toast({
        title: `تم التشغيل لجميع العملاء - مسودات جديدة: ${result.createdSuggestions ?? 0}`,
      });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const saveSuggestionItemMutation = useMutation({
    mutationFn: async (input: {
      suggestionId: number;
      itemId: number;
      qty: number;
      price: number;
    }) =>
      updatePosSuggestionItem(input.suggestionId, input.itemId, {
        editable_qty: input.qty,
        editable_unit_price: input.price,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos-suggestions", clientId] });
      toast({ title: "تم حفظ تعديل السطر" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const approveSuggestionMutation = useMutation({
    mutationFn: async (suggestionId: number) => approvePosSuggestion(suggestionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos-suggestions", clientId] });
      toast({ title: "تم اعتماد المسودة وتحويلها لطلبية" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const rejectSuggestionMutation = useMutation({
    mutationFn: async (suggestionId: number) => rejectPosSuggestion(suggestionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos-suggestions", clientId] });
      toast({ title: "تم رفض المسودة" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const createMapMutation = useMutation({
    mutationFn: async (input: {
      clientId: string;
      externalItemId: string;
      externalItemName: string;
      productId: number;
    }) =>
      createPosItemMap({
        client_id: input.clientId,
        external_item_id: input.externalItemId,
        external_item_name: input.externalItemName,
        product_id: input.productId,
        unit_conversion_factor: 1,
        confidence: 1,
        is_active: true,
      }),
    onSuccess: async () => {
      await invalidatePosQueries();
      toast({ title: "تم اعتماد المطابقة يدويًا" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const updateMapMutation = useMutation({
    mutationFn: async (input: {
      mapId: number;
      productId: number;
      factor: number;
      confidence: number;
      isActive: boolean;
    }) =>
      updatePosItemMap(input.mapId, {
        product_id: input.productId,
        unit_conversion_factor: input.factor,
        confidence: input.confidence,
        is_active: input.isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos-item-maps", clientId] });
      toast({ title: "تم تحديث المطابقة" });
    },
    onError: (error) =>
      toast({ title: error.message, variant: "destructive" }),
  });

  const activeSuggestions = useMemo(
    () =>
      (suggestionsQuery.data ?? []).filter(
        (suggestion) => suggestion.status === "pending_review",
      ),
    [suggestionsQuery.data],
  );

  const saveItem = (suggestion: PosSuggestion, itemId: number) => {
    const draft = itemEdits[itemId];
    const source = suggestion.items.find((item) => item.id === itemId);
    const qty = Number(draft?.qty ?? source?.editable_qty ?? 0);
    const price = Number(draft?.price ?? source?.editable_unit_price ?? 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      toast({ title: "أدخل كمية وسعرًا صالحين", variant: "destructive" });
      return;
    }
    saveSuggestionItemMutation.mutate({
      suggestionId: suggestion.id,
      itemId,
      qty,
      price,
    });
  };

  const saveMap = (mapId: number) => {
    const draft = mapEdits[mapId];
    if (!draft) return;
    const productId = Number(draft.product_id);
    const factor = Number(draft.unit_conversion_factor);
    const confidence = Number(draft.confidence);
    if (
      !Number.isFinite(productId) ||
      !Number.isFinite(factor) ||
      factor <= 0 ||
      !Number.isFinite(confidence)
    ) {
      toast({ title: "تأكد من قيم المطابقة", variant: "destructive" });
      return;
    }
    updateMapMutation.mutate({
      mapId,
      productId,
      factor,
      confidence,
      isActive: draft.is_active,
    });
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-sm border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3.5">
          <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-zinc-800" />
            تكامل POS (قراءة فقط)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500">العميل</label>
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className="mt-1 h-9 w-full rounded-sm border border-slate-200 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
              >
                {(summaryQuery.data ?? []).map((client) => (
                  <option key={client.user_id} value={client.user_id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => runClientMutation.mutate()}
                disabled={!clientId || runClientMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 ml-1" />
                تشغيل يدوي للعميل
              </Button>
              <Button
                size="sm"
                className="bg-zinc-900 hover:bg-zinc-700 text-white"
                onClick={() => runAllMutation.mutate()}
                disabled={runAllMutation.isPending}
              >
                تشغيل يومي يدوي (الكل)
              </Button>
            </div>
          </div>

          {selectedClient && (
            <div className="rounded-sm border border-slate-200 px-3 py-2 text-xs font-bold flex items-center justify-between gap-3">
              <span>
                حالة الموافقة:{" "}
                {hasFullConsent ? (
                  <span className="text-emerald-700">مفعلة</span>
                ) : (
                  <span className="text-red-700">غير مفعلة</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {!hasFullConsent ? (
                  <Button
                    size="sm"
                    className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                    onClick={() => grantConsentMutation.mutate()}
                    disabled={grantConsentMutation.isPending}
                  >
                    تفعيل الموافقات
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-red-700 border-red-200 hover:bg-red-50 text-xs"
                    onClick={() => revokeConsentMutation.mutate()}
                    disabled={revokeConsentMutation.isPending}
                  >
                    سحب الموافقات
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-5 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-500">N (أيام الاستهلاك)</label>
              <Input
                type="number"
                min={1}
                value={policyDraft.lookback_days}
                onChange={(event) =>
                  setPolicyDraft((draft) => ({
                    ...draft,
                    lookback_days: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">أيام التوريد</label>
              <Input
                type="number"
                min={1}
                value={policyDraft.lead_time_days}
                onChange={(event) =>
                  setPolicyDraft((draft) => ({
                    ...draft,
                    lead_time_days: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">مخزون الأمان (نسبة)</label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={policyDraft.safety_stock_ratio}
                onChange={(event) =>
                  setPolicyDraft((draft) => ({
                    ...draft,
                    safety_stock_ratio: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">أيام التغطية</label>
              <Input
                type="number"
                min={1}
                value={policyDraft.coverage_days}
                onChange={(event) =>
                  setPolicyDraft((draft) => ({
                    ...draft,
                    coverage_days: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">خطوة التقريب</label>
              <Input
                type="number"
                step="0.01"
                min={0.01}
                value={policyDraft.rounding_step}
                onChange={(event) =>
                  setPolicyDraft((draft) => ({
                    ...draft,
                    rounding_step: Number(event.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => savePolicyMutation.mutate()}
              disabled={!clientId || savePolicyMutation.isPending}
            >
              حفظ سياسة إعادة الطلب
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-sm border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3.5">
          <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
            مسودات الاقتراحات ({activeSuggestions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {suggestionsQuery.isLoading ? (
            <p className="text-xs text-slate-500">جارٍ تحميل المسودات...</p>
          ) : !activeSuggestions.length ? (
            <p className="text-xs text-slate-500">لا توجد مسودات pending_review حالياً.</p>
          ) : (
            activeSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-sm border border-slate-200 p-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700">
                    #{suggestion.id} · {suggestion.branch_name}
                    <span className="text-slate-400 mr-2">
                      ({new Date(suggestion.generated_at).toLocaleString("ar-SA")})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                      onClick={() => approveSuggestionMutation.mutate(suggestion.id)}
                      disabled={approveSuggestionMutation.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                      اعتماد وتحويل لطلبية
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-red-700 border-red-200 hover:bg-red-50 text-xs"
                      onClick={() => rejectSuggestionMutation.mutate(suggestion.id)}
                      disabled={rejectSuggestionMutation.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5 ml-1" />
                      رفض
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {suggestion.items.map((item) => {
                    const draft = itemEdits[item.id];
                    const qty = draft?.qty ?? item.editable_qty;
                    const price = draft?.price ?? item.editable_unit_price;
                    return (
                      <div
                        key={item.id}
                        className="rounded-sm border border-slate-100 p-2 grid md:grid-cols-6 gap-2 items-end"
                      >
                        <div className="md:col-span-2">
                          <div className="text-xs font-bold text-slate-700">
                            {item.product_name_snapshot}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {item.external_item_name} · الاستهلاك اليومي{" "}
                            {Number(item.avg_daily_consumption).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-500">
                            كمية قابلة للتعديل
                          </label>
                          <Input
                            value={qty}
                            onChange={(event) =>
                              setItemEdits((state) => ({
                                ...state,
                                [item.id]: {
                                  qty: event.target.value,
                                  price,
                                },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-500">
                            سعر البيع
                          </label>
                          <Input
                            value={price}
                            onChange={(event) =>
                              setItemEdits((state) => ({
                                ...state,
                                [item.id]: {
                                  qty,
                                  price: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          مقترح: {Number(item.suggested_qty_rounded).toFixed(2)}{" "}
                          {item.unit_snapshot}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => saveItem(suggestion, item.id)}
                            disabled={saveSuggestionItemMutation.isPending}
                          >
                            حفظ السطر
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!!suggestion.unmapped_items.length && (
                  <div className="rounded-sm border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <div className="text-xs font-extrabold text-amber-800">
                      أصناف تحتاج مطابقة ({suggestion.unmapped_items.length})
                    </div>
                    {suggestion.unmapped_items.map((unmapped) => {
                      const key = `${suggestion.id}:${unmapped.external_item_id}`;
                      return (
                        <div
                          key={unmapped.id}
                          className="grid md:grid-cols-4 gap-2 items-end"
                        >
                          <div className="text-xs font-bold text-slate-700">
                            {unmapped.external_item_name}
                          </div>
                          <select
                            className="h-9 rounded-sm border border-slate-200 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                            value={quickMappingProduct[key] ?? ""}
                            onChange={(event) =>
                              setQuickMappingProduct((state) => ({
                                ...state,
                                [key]: event.target.value,
                              }))
                            }
                          >
                            <option value="">اختر صنفنا...</option>
                            {(productsQuery.data ?? []).map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          <div className="text-[11px] text-slate-500">اعتماد يدوي فقط</div>
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-zinc-900 hover:bg-zinc-700 text-white"
                            disabled={!quickMappingProduct[key] || createMapMutation.isPending}
                            onClick={() =>
                              createMapMutation.mutate({
                                clientId: suggestion.client_id,
                                externalItemId: unmapped.external_item_id,
                                externalItemName: unmapped.external_item_name,
                                productId: Number(quickMappingProduct[key]),
                              })
                            }
                          >
                            اعتماد مطابقة
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-sm border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3.5">
          <CardTitle className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
            مراجعة المطابقات اليدوية
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!mapsQuery.data?.length ? (
            <div className="p-4 text-xs text-slate-500">لا توجد مطابقات بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                  <tr>
                    <th className="text-right font-bold p-3">الصنف الخارجي</th>
                    <th className="text-right font-bold p-3">صنفنا</th>
                    <th className="text-right font-bold p-3">عامل التحويل</th>
                    <th className="text-right font-bold p-3">الثقة</th>
                    <th className="text-right font-bold p-3">مفعل</th>
                    <th className="text-right font-bold p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {mapsQuery.data.map((map) => {
                    const draft = mapEdits[map.id] ?? {
                      product_id: String(map.product_id),
                      unit_conversion_factor: String(map.unit_conversion_factor),
                      confidence: String(map.confidence),
                      is_active: map.is_active,
                    };
                    return (
                      <tr key={map.id}>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-100">
                          {map.external_item_name}
                        </td>
                        <td className="p-3">
                          <select
                            className="h-8 rounded-sm border border-slate-200 bg-white dark:bg-slate-900 px-2 text-xs font-bold"
                            value={draft.product_id}
                            onChange={(event) =>
                              setMapEdits((state) => ({
                                ...state,
                                [map.id]: {
                                  ...draft,
                                  product_id: event.target.value,
                                },
                              }))
                            }
                          >
                            {(productsQuery.data ?? []).map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          <Input
                            value={draft.unit_conversion_factor}
                            onChange={(event) =>
                              setMapEdits((state) => ({
                                ...state,
                                [map.id]: {
                                  ...draft,
                                  unit_conversion_factor: event.target.value,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            value={draft.confidence}
                            onChange={(event) =>
                              setMapEdits((state) => ({
                                ...state,
                                [map.id]: {
                                  ...draft,
                                  confidence: event.target.value,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={(event) =>
                              setMapEdits((state) => ({
                                ...state,
                                [map.id]: {
                                  ...draft,
                                  is_active: event.target.checked,
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => saveMap(map.id)}
                            disabled={updateMapMutation.isPending}
                          >
                            حفظ
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
