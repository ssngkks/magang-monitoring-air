import { Wifi, Activity, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';

export interface DeviceData {
  id: string;
  name?: string;
  kode_node?: string;
  location: string;
  status: 'online' | 'offline' | 'warning';
  lastUpdate: string;
  rssi?: number | null;
  snr?: number | null;
  metrics: {
    ph: number | null;
    temperature: number | null;
    humidity: number | null;
    turbidity: number | null;
    waterLevel: number | null;
    vibration: boolean | null;
  };
}

interface SensorStatusProps {
  device?: DeviceData | null;
  hasLoaded?: boolean;
}

export function SensorStatus({ device, hasLoaded = false }: SensorStatusProps) {
  const { t } = useLanguage();
  const isOnline = device?.status === 'online';

  const getRssiQuality = (rssi?: number | null) => {
    if (rssi === undefined || rssi === null) return t.common.unknown;
    if (rssi >= -50) return t.dashboard.signalVeryGood;
    if (rssi >= -70) return t.dashboard.signalGood;
    if (rssi >= -85) return t.dashboard.signalFair;
    return t.dashboard.signalWeak;
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {/* Header Info Perangkat */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-5 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Unit Sensor ESP32 Utama
            </h3>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {device?.kode_node || 'ESP32-WATER-01'}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            1 Perangkat Keras Multi-Sensor Terintegrasi • Lokasi: {device?.location || 'Titik Pantau Sensor Utama'}
          </p>
        </div>

        {/* Status Koneksi (teks saja, tanpa titik/capsule) */}
        <div className="flex items-center gap-2">
          <span
            className={
              !hasLoaded
                ? 'text-xs font-semibold text-gray-500'
                : isOnline
                  ? 'text-xs font-bold text-green-600 dark:text-green-400'
                  : 'text-xs font-bold text-red-600 dark:text-red-400'
            }
          >
            {!hasLoaded
              ? t.common.waitingData
              : isOnline
                ? 'Terhubung (Online)'
                : 'Terputus (Offline)'}
          </span>
        </div>
      </div>

      {/* Status Jaringan & Waktu */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800/40 text-xs">
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            Terakhir Terlihat
          </span>
          <p className="font-semibold text-gray-800 dark:text-gray-200">
            {hasLoaded && device?.lastUpdate ? device.lastUpdate : t.common.noData}
          </p>
        </div>

        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <Wifi className="h-3.5 w-3.5" />
            Kekuatan Sinyal (RSSI)
          </span>
          <p className="font-semibold text-gray-800 dark:text-gray-200">
            {hasLoaded && device?.rssi !== undefined && device?.rssi !== null
              ? `${device.rssi} dBm (${getRssiQuality(device.rssi)})`
              : t.common.noData}
          </p>
        </div>

        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <Activity className="h-3.5 w-3.5" />
            Rasio Sinyal/Noise (SNR)
          </span>
          <p className="font-semibold text-gray-800 dark:text-gray-200">
            {hasLoaded && device?.snr !== undefined && device?.snr !== null
              ? `${device.snr} dB`
              : t.common.noData}
          </p>
        </div>

        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Kesehatan Perangkat
          </span>
          <p className="font-semibold text-green-700 dark:text-green-400">
            {!hasLoaded
              ? t.common.waitingData
              : isOnline
                ? t.dashboard.deviceReady
                : t.dashboard.deviceCheck}
          </p>
        </div>
      </div>

      {/* Parameter Sensor yang Terbaca dari 1 ESP32 ini */}
      <div className="mt-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Parameter Sensor Terbaca dari Unit ESP32 Ini
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
          {/* pH */}
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Sensor pH Air</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              {hasLoaded && device?.metrics.ph !== undefined && device?.metrics.ph !== null
                ? device.metrics.ph.toFixed(2)
                : t.common.noData}
            </p>
            <span className="text-[10px] text-gray-400">Rentang 0 - 14</span>
          </div>

          {/* Suhu */}
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Sensor Suhu (DHT)</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              {hasLoaded && device?.metrics.temperature !== undefined && device?.metrics.temperature !== null
                ? `${device.metrics.temperature.toFixed(1)}°C`
                : t.common.noData}
            </p>
            <span className="text-[10px] text-gray-400">Suhu Lingkungan</span>
          </div>

          {/* Kelembapan */}
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Kelembapan (DHT)</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              {hasLoaded && device?.metrics.humidity !== undefined && device?.metrics.humidity !== null
                ? `${device.metrics.humidity.toFixed(1)}%`
                : t.common.noData}
            </p>
            <span className="text-[10px] text-gray-400">Udara Sekitar</span>
          </div>

          {/* Kekeruhan */}
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Sensor Kekeruhan</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              {hasLoaded && device?.metrics.turbidity !== undefined && device?.metrics.turbidity !== null
                ? `${device.metrics.turbidity.toFixed(1)} NTU`
                : t.common.noData}
            </p>
            <span className="text-[10px] text-gray-400">Kekeruhan Air</span>
          </div>

          {/* Level Air */}
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Ketinggian Air</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              {hasLoaded && device?.metrics.waterLevel !== undefined && device?.metrics.waterLevel !== null
                ? `${device.metrics.waterLevel} cm`
                : t.common.noData}
            </p>
            <span className="text-[10px] text-gray-400">Sensor Ultrasonik</span>
          </div>

          {/* Getaran */}
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500">Sensor Getaran</p>
            {!hasLoaded || device?.metrics.vibration === undefined || device?.metrics.vibration === null ? (
              <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
                {t.common.noData}
              </p>
            ) : (
              <p
                className={cn(
                  'mt-1 text-base font-bold',
                  device.metrics.vibration ? 'text-red-600' : 'text-green-600'
                )}
              >
                {device.metrics.vibration ? t.dashboard.vibrationActive : t.dashboard.vibrationNormal}
              </p>
            )}
            <span className="text-[10px] text-gray-400">Sensor MPU6050</span>
          </div>
        </div>
      </div>
    </div>
  );
}
