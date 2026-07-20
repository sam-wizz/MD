import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MainNav } from "@/components/layout/main-nav";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PackagePlus, ArrowRight } from "lucide-react";
import { useCreateOrder } from "@workspace/api-client-react";
import { PRODUCT_CATEGORIES, SAUDI_REGIONS, apiErrorMessage } from "@/lib/orders";

/** صفحة إنشاء طلب توريد جديد لصاحب المنشأة. */
export default function OrdersNew() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/auth");
  }, [user, authLoading, setLocation]);

  const [form, setForm] = useState({
    product_category: PRODUCT_CATEGORIES[0],
    items: "",
    delivery_region: SAUDI_REGIONS[0].name,
    delivery_address: "",
    business_phone: "",
    notes: "",
  });

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (order) => {
        toast({ title: "أُرسل طلبك للإدارة", description: "سيتم اعتماده ومطابقته مع أفضل مورد سعراً" });
        setLocation(`/orders/${order.id}`);
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const submit = () => {
    if (!form.items.trim()) {
      toast({ title: "اكتب الأصناف والكميات المطلوبة", variant: "destructive" });
      return;
    }
    createOrder.mutate({
      data: {
        product_category: form.product_category,
        items: form.items.trim(),
        delivery_region: form.delivery_region,
        delivery_address: form.delivery_address.trim() || undefined,
        business_phone: form.business_phone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      },
    });
  };

  const selectCls =
    "h-10 w-full rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <MainNav />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1.5 mb-4"
          data-testid="link-back-dashboard"
        >
          <ArrowRight className="h-3.5 w-3.5" /> العودة للوحة التحكم
        </button>

        <Card className="rounded-sm border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-5">
            <CardTitle className="text-xl flex items-center gap-2.5 font-extrabold text-slate-900 dark:text-white">
              <PackagePlus className="h-5 w-5 text-blue-600" />
              طلب توريد جديد
            </CardTitle>
            <p className="text-xs text-slate-400 font-medium pt-1">
              حدد احتياجك وسنطابقه مع المورد الأقل سعراً عبر إدارة المنصة
            </p>
          </CardHeader>
          <CardContent className="p-6 bg-white dark:bg-slate-950 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>تصنيف المنتجات</label>
                <select
                  className={selectCls}
                  value={form.product_category}
                  onChange={(e) => setForm({ ...form, product_category: e.target.value })}
                  data-testid="select-order-category"
                >
                  {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>مدينة التسليم</label>
                <select
                  className={selectCls}
                  value={form.delivery_region}
                  onChange={(e) => setForm({ ...form, delivery_region: e.target.value })}
                  data-testid="select-order-region"
                >
                  {SAUDI_REGIONS.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>الأصناف والكميات المطلوبة</label>
              <Textarea
                value={form.items}
                onChange={(e) => setForm({ ...form, items: e.target.value })}
                placeholder="مثال: ٥٠ كيلو أرز بسمتي، ٢٠ كرتون دجاج مجمد، ١٠ عبوات زيت طبخ ١٨ لتر"
                className="rounded-sm min-h-28 text-sm"
                data-testid="input-order-items"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>العنوان التفصيلي (اختياري)</label>
                <Input
                  value={form.delivery_address}
                  onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                  placeholder="الحي، الشارع، رقم المبنى"
                  className="rounded-sm h-10 text-sm"
                  data-testid="input-order-address"
                />
              </div>
              <div>
                <label className={labelCls}>جوال للتواصل (اختياري)</label>
                <Input
                  value={form.business_phone}
                  onChange={(e) => setForm({ ...form, business_phone: e.target.value })}
                  placeholder="05xxxxxxxx"
                  inputMode="tel"
                  dir="ltr"
                  className="rounded-sm h-10 text-sm text-right"
                  data-testid="input-order-phone"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>ملاحظات إضافية (اختياري)</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="أوقات الاستلام المفضلة، اشتراطات التخزين، علامات تجارية محددة..."
                className="rounded-sm min-h-20 text-sm"
                data-testid="input-order-notes"
              />
            </div>

            <Button
              onClick={submit}
              disabled={createOrder.isPending}
              className="w-full rounded-sm bg-blue-600 hover:bg-blue-500 text-white font-extrabold h-11"
              data-testid="button-submit-order"
            >
              {createOrder.isPending ? "جارٍ الإرسال..." : "إرسال الطلب للإدارة"}
            </Button>
            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              بعد الاعتماد، تقارن الإدارة أسعار الموردين المعتمدين وتسند طلبك للأقل سعراً — وتتابع التنفيذ خطوة بخطوة من صفحة الطلب
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
