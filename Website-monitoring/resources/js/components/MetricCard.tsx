import { memo } from "react";
import { cn } from "../lib/utils";

type Props = {
  title: string;
  value: string;
  unit?: string;
  icon?: React.ReactNode;
  status?: "normal" | "warning" | "critical";
  min?: number;
  max?: number;
  current?: number;
};

function getColor(status?: string) {
  if (status === "critical") return "#ef4444";
  if (status === "warning") return "#f59e0b";
  return "#10b981";
}

export const MetricCard = memo(function MetricCard({ title, value, unit, icon, status = "normal", min = 0, max = 14, current }: Props) {
  const color = getColor(status);
  const pct = current !== undefined ? Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100)) : 0;

  return (
    <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
            {icon}
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide border",
            status === "normal" && "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
            status === "warning" && "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
            status === "critical" && "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
          )}
        >
          {status}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</span>
            {unit && <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>}
          </div>
          {current !== undefined && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Range {min} – {max}
            </p>
          )}
        </div>

        {current !== undefined && (
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div
              className="w-16 h-16 rounded-full"
              style={{
                background: `conic-gradient(${color} ${pct}%, #e5e7eb ${pct}%)`,
              }}
            />
            <div className="absolute inset-1.5 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold" style={{ color }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {current !== undefined && (
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
});
