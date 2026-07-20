import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Plus, ChevronLeft } from "lucide-react";
import { useGetMyOrders, getGetMyOrdersQueryKey } from "@workspace/api-client-react";
import { statusMeta } from "@/lib/orders";

/** بطاقة طلبات صاحب المنشأة في لوحة التحكم. */
export function BusinessOrdersCard() {
  const { data: orders, isLoading } = useGetMyOrders({
    query: { queryKey: getGetMyOrdersQueryKey() },
  });

  return (
    <Card className="rounded-sm border-slate-200 shadow-sm" data-testid="card-my-orders">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
          <Package className="h-4 w-4 text-blue-600" />
          طلبات التوريد · My Orders
        </CardTitle>
        <Link href="/orders/new">
          <Button size="sm" className="rounded-sm bg-blue-600 hover:bg-blue-500 text-white font-bold" data-testid="button-new-order">
            <Plus className="h-4 w-4 ml-1" /> طلب جديد
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0 bg-white dark:bg-slate-950">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-medium text-slate-500">جارٍ تحميل الطلبات...</div>
        ) : !orders?.length ? (
          <div className="p-8 text-center">
            <p className="text-sm font-bold text-slate-500 mb-1">لا توجد طلبات بعد</p>
            <p className="text-xs text-slate-400">أنشئ أول طلب توريد وستتولى الإدارة مطابقته مع أفضل مورد سعراً</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {orders.slice(0, 6).map((o) => {
              const meta = statusMeta(o.status);
              return (
                <Link key={o.id} href={`/orders/${o.id}`}>
                  <div className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer" data-testid={`row-order-${o.id}`}>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        #{o.id} · {o.product_category}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {o.items} · {o.delivery_region}
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-sm border ${meta.chip} shrink-0`}>
                      {meta.ar}
                    </span>
                    <ChevronLeft className="h-4 w-4 text-slate-300 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
