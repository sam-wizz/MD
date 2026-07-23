import { Link } from "wouter";
import { PackageOpen, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "لا توجد طلبات بعد",
  description,
  actionLabel,
  onAction,
  href,
  icon: Icon = PackageOpen,
  className,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-14",
        className,
      )}
      role="status"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Icon className="h-8 w-8 text-slate-400" aria-hidden />
      </div>
      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs text-slate-400 leading-relaxed">{description}</p>
      )}
      {actionLabel && (onAction || href) && (
        <div className="mt-5">
          {href ? (
            <Link href={href}>
              <Button className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold">
                {actionLabel}
              </Button>
            </Link>
          ) : (
            <Button
              type="button"
              onClick={onAction}
              className="rounded-sm bg-zinc-900 hover:bg-zinc-700 font-bold"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
