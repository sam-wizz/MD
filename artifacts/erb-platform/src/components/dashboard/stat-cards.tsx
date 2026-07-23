import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardItem = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  accent?: string;
};

export function StatCards({ items }: { items: StatCardItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="stat-cards">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.key}
            className="rounded-sm border-slate-200 dark:border-slate-800 shadow-sm"
          >
            <CardHeader className="pb-2 space-y-0">
              <div className="flex items-start justify-between gap-2">
                <CardDescription className="font-bold text-[10px] text-slate-500 uppercase tracking-widest leading-snug">
                  {item.label}
                </CardDescription>
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
                    item.accent,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <CardTitle className="text-2xl md:text-3xl text-slate-900 dark:text-white pt-2 tabular-nums">
                {item.value}
              </CardTitle>
            </CardHeader>
            {item.hint && (
              <CardContent className="pt-0">
                <p className="text-[11px] font-medium text-slate-400">{item.hint}</p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
