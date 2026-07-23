import { cn } from "@/lib/utils";
import { statusMeta, type OrderStatus } from "@/lib/orders";

export function OrderStatusBadge({
  status,
  className,
}: {
  status?: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-sm border whitespace-nowrap",
        meta.chip,
        className,
      )}
      title={meta.en}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.dot)} aria-hidden />
      {meta.ar}
    </span>
  );
}

export const ORDER_STATUS_FILTER_OPTIONS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "pending", label: "بانتظار الموافقة" },
  { value: "approved", label: "تمت الموافقة" },
  { value: "assigned", label: "أُسند لمورد" },
  { value: "preparing", label: "قيد التجهيز" },
  { value: "in_transit", label: "في الطريق" },
  { value: "delivered", label: "تم التسليم" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغي" },
];
