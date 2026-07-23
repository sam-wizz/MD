import { useMemo } from "react";
import {
  useGetMyOrders,
  useGetMyInvoiceAnalyses,
  getGetMyOrdersQueryKey,
  getGetMyInvoiceAnalysesQueryKey,
  type Order,
} from "@workspace/api-client-react";
import {
  formatSar,
  isActiveOrderStatus,
  isSameMonth,
  parseMoney,
  apiErrorMessage,
} from "@/lib/orders";

export function useBusinessDashboard() {
  const ordersQuery = useGetMyOrders({
    query: { queryKey: getGetMyOrdersQueryKey() },
  });
  const invoicesQuery = useGetMyInvoiceAnalyses({
    query: { queryKey: getGetMyInvoiceAnalysesQueryKey() },
  });

  const orders = ordersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

  const stats = useMemo(() => {
    const active = orders.filter((o) => isActiveOrderStatus(o.status)).length;
    const thisMonth = orders.filter((o) => isSameMonth(o.created_at)).length;
    const completed = orders.filter((o) => o.status === "delivered").length;
    const totalSpend = invoices.reduce((sum, inv) => sum + parseMoney(inv.invoice_total), 0);
    return {
      active,
      thisMonth,
      completed,
      totalSpend,
      totalSpendLabel: formatSar(totalSpend),
    };
  }, [orders, invoices]);

  return {
    orders,
    invoices,
    stats,
    isLoading: ordersQuery.isLoading || invoicesQuery.isLoading,
    isError: ordersQuery.isError || invoicesQuery.isError,
    errorMessage:
      (ordersQuery.error && apiErrorMessage(ordersQuery.error)) ||
      (invoicesQuery.error && apiErrorMessage(invoicesQuery.error)) ||
      undefined,
    refetch: () => {
      void ordersQuery.refetch();
      void invoicesQuery.refetch();
    },
  };
}

export function filterBusinessOrders(
  orders: Order[],
  opts: {
    status: string;
    category: string;
    search: string;
    dateFrom: string;
    dateTo: string;
  },
): Order[] {
  const q = opts.search.trim().toLowerCase();
  return orders
    .filter((o) => (opts.status === "all" ? true : o.status === opts.status))
    .filter((o) => (opts.category === "all" ? true : o.product_category === opts.category))
    .filter((o) => {
      if (!opts.dateFrom && !opts.dateTo) return true;
      const t = new Date(o.created_at).getTime();
      if (opts.dateFrom && t < new Date(opts.dateFrom).setHours(0, 0, 0, 0)) return false;
      if (opts.dateTo && t > new Date(opts.dateTo).setHours(23, 59, 59, 999)) return false;
      return true;
    })
    .filter((o) => {
      if (!q) return true;
      return (
        String(o.id).includes(q) ||
        o.items.toLowerCase().includes(q) ||
        o.product_category.toLowerCase().includes(q) ||
        o.delivery_region.toLowerCase().includes(q)
      );
    })
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
