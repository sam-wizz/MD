import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DashboardErrorState({
  message = "تعذر تحميل البيانات",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive" className="rounded-sm" role="alert">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="font-extrabold">حدث خطأ</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3 mt-1">
        <span>{message}</span>
        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm border-red-300 text-red-800 hover:bg-red-50 gap-1.5 w-fit"
            onClick={onRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 space-y-3"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
