import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  status?: 'normal' | 'warning' | 'critical';
  className?: string;
  min?: number;
  max?: number;
  gaugeValue?: number;
  gaugeColor?: string;
}

export function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  trendValue,
  status = 'normal',
  className,
  min = 0,
  max = 100,
  gaugeValue,
  gaugeColor,
}: MetricCardProps) {
  const statusColors = {
    normal: '#16a34a',
    warning: '#f59e0b',
    critical: '#dc2626',
  };

  const statusColor = statusColors[status];
  const mainColor = gaugeColor || statusColor;

  const rawGaugeValue =
    gaugeValue !== undefined
      ? gaugeValue
      : typeof value === 'number'
        ? value
        : 0;

  const numericValue = Math.min(
    Math.max(rawGaugeValue, min),
    max
  );

  const percentage =
    max > min
      ? ((numericValue - min) / (max - min)) * 100
      : 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-4 shadow-sm',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        'dark:border-gray-800 dark:bg-gray-900',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {title}
        </p>
      </div>

      {/* Circular Gauge */}
      <div className="mt-4 flex justify-center">
        <div
          className="relative h-[120px] w-[120px] rounded-full"
          style={{
            background: `conic-gradient(
              ${mainColor} 0% ${percentage}%,
              #e5e7eb ${percentage}% 100%
            )`,
          }}
        >
          <div
            className="
              absolute inset-[12px]
              flex flex-col items-center justify-center
              rounded-full bg-white
              dark:bg-gray-900
            "
          >
            <span className="text-2xl font-bold leading-none text-gray-900 dark:text-white">
              {value}
            </span>

            {unit && (
              <span className="mt-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}