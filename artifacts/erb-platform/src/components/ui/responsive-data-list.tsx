import type { ReactNode } from "react";

/**
 * جدول على سطح المكتب + بطاقات على الجوال (بدون تمرير أفقي).
 */
export function ResponsiveDataList({
  table,
  cards,
}: {
  table: ReactNode;
  cards: ReactNode;
}) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">{table}</div>
      <div className="md:hidden space-y-3">{cards}</div>
    </>
  );
}

export function MobileDataCard({
  title,
  subtitle,
  rows,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  rows: { label: string; value: ReactNode }[];
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 space-y-3">
      <div>
        <div className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</div>
        {subtitle ? (
          <div className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 text-xs">
            <dt className="text-slate-500 font-semibold shrink-0">{r.label}</dt>
            <dd className="text-slate-800 dark:text-slate-200 font-bold text-left">{r.value}</dd>
          </div>
        ))}
      </dl>
      {footer ? <div className="pt-2 border-t border-slate-100 dark:border-slate-800">{footer}</div> : null}
    </div>
  );
}
