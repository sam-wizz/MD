import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Tags, Plus, Trash2 } from "lucide-react";
import {
  useGetMyPrices,
  getGetMyPricesQueryKey,
  useCreatePrice,
  useDeletePrice,
} from "@workspace/api-client-react";
import { PRODUCT_CATEGORIES, PRICE_UNITS, apiErrorMessage } from "@/lib/orders";

/** قائمة أسعار المورد: منها يقارن الذكاء الاصطناعي ويرشح الأقل سعراً. */
export function SupplierPricesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: prices, isLoading } = useGetMyPrices({
    query: { queryKey: getGetMyPricesQueryKey() },
  });

  const [form, setForm] = useState({ product_name: "", category: PRODUCT_CATEGORIES[0], unit: PRICE_UNITS[0], price: "" });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetMyPricesQueryKey() });

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
      onSuccess: invalidate,
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

  const selectCls =
    "h-9 rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-zinc-500";

  return (
    <Card className="rounded-sm border-slate-200 shadow-sm" data-testid="card-my-prices">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
        <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
          <Tags className="h-4 w-4 text-zinc-800" />
          قائمة أسعاري · My Price List
        </CardTitle>
        <p className="text-xs text-slate-400 font-medium pt-1">
          كلما كانت قائمتك أكمل وأسعارك أفضل، زادت فرص إسناد الطلبات إليك تلقائياً
        </p>
      </CardHeader>
      <CardContent className="p-4 bg-white dark:bg-slate-950 space-y-4">
        {/* نموذج إضافة سعر */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-sm p-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">المنتج</label>
            <Input
              value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              placeholder="أرز بسمتي ٥ كيلو"
              className="h-9 rounded-sm text-xs"
              data-testid="input-price-product"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">التصنيف</label>
            <select className={`${selectCls} w-full`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="select-price-category">
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">الوحدة</label>
            <select className={`${selectCls} w-full`} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="select-price-unit">
              {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">السعر (ريال)</label>
            <Input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="42.50"
              inputMode="decimal"
              className="h-9 rounded-sm text-xs"
              data-testid="input-price-value"
            />
          </div>
          <Button
            onClick={submit}
            disabled={createPrice.isPending}
            className="h-9 rounded-sm bg-zinc-900 hover:bg-zinc-700 text-white font-bold text-xs"
            data-testid="button-add-price"
          >
            <Plus className="h-4 w-4 ml-1" /> إضافة
          </Button>
        </div>

        {/* الجدول */}
        {isLoading ? (
          <div className="p-6 text-center text-sm font-medium text-slate-500">جارٍ تحميل الأسعار...</div>
        ) : !prices?.length ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-slate-500 mb-1">قائمتك فارغة</p>
            <p className="text-xs text-slate-400">أضف منتجاتك وأسعارك ليقارنها النظام تلقائياً عند كل طلب توريد</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-sm">
            {prices.map((p) => (
              <div key={p.id} className="px-3 py-2.5 flex items-center gap-3" data-testid={`row-price-${p.id}`}>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.product_name}</span>
                  <span className="text-xs text-slate-400 mr-2">{p.category} · لكل {p.unit}</span>
                </div>
                <span className="text-sm font-extrabold text-zinc-800 dark:text-zinc-400 whitespace-nowrap">
                  {Number(p.price).toLocaleString("ar-SA")} ر.س
                </span>
                <button
                  onClick={() => deletePrice.mutate({ id: p.id })}
                  className="text-slate-300 hover:text-red-500 transition-colors p-1"
                  title="حذف"
                  data-testid={`button-delete-price-${p.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
