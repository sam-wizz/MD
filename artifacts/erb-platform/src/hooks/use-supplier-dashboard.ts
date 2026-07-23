import { useMemo } from "react";
import {
  useGetAssignedOrders,
  useGetMyPrices,
  getGetAssignedOrdersQueryKey,
  getGetMyPricesQueryKey,
} from "@workspace/api-client-react";
import { apiErrorMessage, isSameMonth } from "@/lib/orders";

export function useSupplierDashboard() {
  const ordersQuery = useGetAssignedOrders({
    query: { queryKey: getGetAssignedOrdersQueryKey() },
  });
  const pricesQuery = useGetMyPrices({
    query: { queryKey: getGetMyPricesQueryKey() },
  });

  const orders = ordersQuery.data ?? [];
  const prices = pricesQuery.data ?? [];

  const stats = useMemo(() => {
    const assigned = orders.filter((o) => o.status === "assigned").length;
    const preparing = orders.filter((o) => o.status === "preparing").length;
    const inTransit = orders.filter((o) => o.status === "in_transit").length;
    const completedThisMonth = orders.filter(
      (o) => o.status === "delivered" && isSameMonth(o.updated_at || o.created_at),
    ).length;
    return { assigned, preparing, inTransit, completedThisMonth };
  }, [orders]);

  return {
    orders,
    prices,
    stats,
    isLoading: ordersQuery.isLoading || pricesQuery.isLoading,
    isError: ordersQuery.isError || pricesQuery.isError,
    errorMessage:
      (ordersQuery.error && apiErrorMessage(ordersQuery.error)) ||
      (pricesQuery.error && apiErrorMessage(pricesQuery.error)) ||
      undefined,
    refetch: () => {
      void ordersQuery.refetch();
      void pricesQuery.refetch();
    },
    ordersQuery,
    pricesQuery,
  };
}
