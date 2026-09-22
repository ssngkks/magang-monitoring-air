import React from 'react';
import { LucideIcon, Droplet, Thermometer, CloudRain, Activity, Zap, Compass, Gauge } from 'lucide-react';

interface DynamicSensorCardProps {
  title?: string;
  value?: number | string | boolean;
  unit?: string;
  sensorCode?: string;
  status?: 'normal' | 'warning' | 'critical';
  min?: number;
  max?: number;
  subText?: string;
  onClick?: () => void;
  // Kompatibilitas: Dashboard mengirim objek sensor {id,name,code,unit,...}
  sensor?: {
    id?: string | number;
    name?: string;
    code?: string;
    unit?: string;
    min_value?: number;
    max_value?: number;
  };
}

export const DynamicSensorCard: React.FC<DynamicSensorCardProps> = ({
  title,
  value,
  unit = '',
  sensorCode = 'sensor',
  status = 'normal',
  min = 0,
  max = 100,
  subText,
  onClick,
  sensor,
}) => {
  // Dukung pemakaian <DynamicSensorCard sensor={s} /> dari Dashboard
  const resolvedTitle = title || sensor?.name || 'Sensor';
  const resolvedCode = sensor?.code || sensorCode;
  const resolvedUnit = sensor?.unit || unit || '';
  const resolvedMin = sensor?.min_value ?? min;
  const resolvedMax = sensor?.max_value ?? max;
  const resolvedValue: number | string | boolean = value !== undefined ? value : '-';

  // Resolve icon dynamically based on sensorCode or title
  const getIcon = (): LucideIcon => {
    const code = (resolvedCode || '').toLowerCase();
    const t = (resolvedTitle || '').toLowerCase();
    if (code.includes('ph') || t.includes('ph')) return Droplet;
    if (code.includes('turbid') || t.includes('keruh')) return Activity;
    if (code.includes('water') || code.includes('level') || code.includes('air')) return Droplet;
    if (code.includes('temp') || code.includes('suhu') || t.includes('suhu')) return Thermometer;
    if (code.includes('hum') || code.includes('lembab')) return CloudRain;
    if (code.includes('vib') || code.includes('getar')) return Zap;
    if (code.includes('mpu') || code.includes('gyro') || code.includes('orient')) return Compass;
    return Gauge;
  };

  const IconComponent = getIcon();

  const statusText = status === 'critical' ? 'Bahaya' : status === 'warning' ? 'Warning' : 'Normal';
  const statusClass =
    status === 'critical'
      ? 'text-red-600 dark:text-red-400'
      : status === 'warning'
        ? 'text-yellow-500 dark:text-yellow-400'
        : 'text-green-600 dark:text-green-400';

  // Hitung progress bar jika nilai numeric
  const numericVal = typeof resolvedValue === 'number' ? resolvedValue : parseFloat(String(resolvedValue)) || 0;
  const range = resolvedMax - resolvedMin || 1;
  const percent = Math.min(Math.max(((numericVal - resolvedMin) / range) * 100, 0), 100);

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:scale-[1.01] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shrink-0">
            <IconComponent className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">{resolvedTitle}</h4>
            <span className="text-[11px] text-gray-400">{subText || `Rentang: ${resolvedMin} - ${resolvedMax} ${resolvedUnit}`}</span>
          </div>
        </div>

        <span className={`text-[11px] font-bold shrink-0 ${statusClass}`}>
          {statusText}
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <div className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          {typeof resolvedValue === 'boolean'
            ? resolvedValue ? 'Terdeteksi' : 'Normal'
            : typeof resolvedValue === 'number'
            ? resolvedValue.toLocaleString('id-ID', { maximumFractionDigits: 2 })
            : resolvedValue}
          {resolvedUnit && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">{resolvedUnit}</span>}
        </div>
      </div>

      {/* Mini Progress Bar */}
      <div className="mt-3 w-full bg-gray-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            status === 'critical' ? 'bg-red-500' : status === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {onClick && (
        <span className="mt-3 text-[11px] font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 group-hover:underline">
          Klik untuk rincian & kalibrasi →
        </span>
      )}
    </div>
  );
};
