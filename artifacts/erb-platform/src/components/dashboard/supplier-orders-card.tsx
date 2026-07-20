import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, ChevronLeft } from "lucide-react";
import {
  useGetAssignedOrders,
  getGetAssignedOrdersQueryKey,
  useUpdateOrderStatus,
} from "@workspace/api-client-react";
import { statusMeta, apiErrorMessage } from "@/lib/orders";

/** بطاقة الطلبات المسندة للمورد مع أزرار تحديث حالة التسليم. */
export function SupplierOrdersCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useGetAssignedOrders({
    query: { queryKey: getGetAssignedOrdersQueryKey() },
  });

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAssignedOrdersQueryKey() });
        toast({ title: "تم تحديث حالة الطلب" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err), variant: "destructive" }),
    },
  });

  const nextAction = (status: string): { label: string; next: "preparing" | "in_transit" | "delivered" } | null =>
    status === "assigned"  ? { label: "بدء التجهيز",   next: "preparing" }  :
    status === "preparing" ? { label: "خرج للتوصيل",   next: "in_transit" } :
    status === "in_transit" ? { label: "تم التسليم",   next: "delivered" }  : null;

  return (
    <Card className="rounded-sm border-slate-200 shadow-sm" data-testid="card-assigned-orders">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
        <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
          <ClipboardList className="h-4 w-4 text-blue-600" />
          الطلبات المسندة إليك · Assigned Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 bg-white dark:bg-slate-950">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-medium text-slate-500">جارٍ تحميل الطلبات...</div>
        ) : !orders?.length ? (
          <div className="p-8 text-center">
            <p className="text-sm font-bold text-slate-500 mb-1">لا توجد طلبات مسندة إليك حالياً</p>
            <p className="text-xs text-slate-400">عندما تسند إليك الإدارة طلباً سيظهر هنا مع تفاصيل التوصيل</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {orders.map((o) => {
              const meta = statusMeta(o.status);
              const action = nextAction(o.status);
              return (
                <div key={o.id} className="p-4" data-testid={`row-assigned-${o.id}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-[150px]">
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        #{o.id} · {o.business_company}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {o.product_category} · التسليم في {o.delivery_region}
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-sm border ${meta.chip}`}>{meta.ar}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-sm p-2.5 leading-relaxed">
                    {o.items}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    {action && (
                      <Button
                        size="sm"
                        className="rounded-sm bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ id: o.id, data: { status: action.next } })}
                        data-testid={`button-status-${o.id}`}
                      >
                        {action.label}
                      </Button>
                    )}
                    <Link href={`/orders/${o.id}`}>
                      <Button size="sm" variant="outline" className="rounded-sm font-bold text-xs" data-testid={`link-order-${o.id}`}>
                        التفاصيل <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
