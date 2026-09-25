import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  Filter,
  RefreshCw,
  Download,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type TimeRange = 'today' | '7d' | '30d' | 'custom';

// Kapasitas maksimum tandon — sama dengan yang sudah ditampilkan halaman ini
// ("cm / 100 cm") dan config_schema tank_height_cm pada SensorTypeSeeder.
const TANK_CAPACITY_CM = 100;

interface TankWaterStatus {
  text: 'Normal' | 'Warning' | 'Bahaya';
  textClass: string;
  fill: string;
  surface: string;
}

// Status visual level air memakai ambang yang sudah dipakai project:
// peringatan Min 20 cm / Max 85 cm (garis acuan grafik lama) dan
// kritis < 10 cm / > 92 cm (SensorReconcileService water_level).
function getTankWaterStatus(level: number): TankWaterStatus {
  if (level < 10 || level > 92) {
    return {
      text: 'Bahaya',
      textClass: 'text-red-600 dark:text-red-400',
      fill: '#ef4444',
      surface: '#f87171',
    };
  }
  if (level < 20 || level > 85) {
    return {
      text: 'Warning',
      textClass: 'text-yellow-500 dark:text-yellow-400',
      fill: '#f59e0b',
      surface: '#fbbf24',
    };
  }
  return {
    text: 'Normal',
    textClass: 'text-green-600 dark:text-green-400',
    fill: '#3b82f6',
    surface: '#60a5fa',
  };
}

function formatWaktu(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

export function WaterPhysicalDetail() {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(Date.now() - 86400000).toISOString().split('T')[0]
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('');
  const [lastSyncDate, setLastSyncDate] = useState('');
  const [chartData, setChartData] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tableLoading, setTableLoading] = useState(false);

  const [metrics, setMetrics] = useState({
    waterLevel: 82.5,
    vibration: false,
    roll: 0.8,
    pitch: -0.4,
    stabilityStatus: 'Stabil',
  });

  const loadData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const { data: nodes } = await api.nodes();
      if (!nodes.length) {
        setHasLoaded(true);
        setIsRefreshing(false);
        return;
      }

      // Penjaga node-utama: abaikan baris hantu/pending — pilih device aktif duluan
      const primaryNode = nodes.find((n) => ((n as any).status ?? 'active') === 'active') ?? nodes[0];
      const lr = (primaryNode as any).last_reading || {};

      setMetrics({
        waterLevel: Number(lr.water_level ?? 82.5),
        vibration: Boolean(lr.vibration ?? false),
        roll: Number(lr.roll ?? 0.8),
        pitch: Number(lr.pitch ?? -0.4),
        stabilityStatus: lr.stability_status || 'Stabil',
      });

      if (primaryNode.last_seen_at) {
        const d = new Date(primaryNode.last_seen_at);
        setLastSyncTime(d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        setLastSyncDate(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
      }

      // Fetch historical data / chart: 1 request, server mengembalikan ≤200 titik
      // yang tersebar MERATA selebar rentang (downsample server-side).
      const chartParams = new URLSearchParams({ range: timeRange, downsample: '200' });
      if (timeRange === 'custom') {
        chartParams.set('from', customStartDate);
        chartParams.set('to', customEndDate);
      }

      const historyRes: any = await api.sensorData(String(primaryNode.id), chartParams.toString());
      const readings = historyRes?.data?.data || (Array.isArray(historyRes?.data) ? historyRes.data : []);

      if (readings.length > 0) {
        const formatted = readings
          .slice()
          .reverse()
          .map((r: any, idx: number) => {
            const dateObj = r.created_at ? new Date(r.created_at) : new Date(Date.now() - (readings.length - idx) * 300000);
            return {
              time: timeRange === 'today'
                ? dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                : `${dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric' })} ${dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
              fullDate: dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              waterLevel: Number(r.water_level ?? 0),
              vibration: r.vibration ? 1 : 0,
              roll: r.roll !== null && r.roll !== undefined ? Number(r.roll) : null,
              pitch: r.pitch !== null && r.pitch !== undefined ? Number(r.pitch) : null,
            };
          });
        setChartData(formatted);
      } else {
        setChartData([]);
      }
    } catch (err) {
      console.error('Gagal mengambil data fisik tandon:', err);
    } finally {
      setHasLoaded(true);
      setIsRefreshing(false);
    }
  }, [timeRange, customStartDate, customEndDate]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Tabel 100 data terbaru — mengikuti rentang aktif (data lengkap ada di Reports)
  useEffect(() => {
    let cancelled = false;
    const fetchTable = async () => {
      try {
        setTableLoading(true);
        const { data: nodes } = await api.nodes();
        if (!nodes.length) {
          if (!cancelled) setTableRows([]);
          return;
        }
        const params = new URLSearchParams({ range: timeRange, per_page: '100' });
        if (timeRange === 'custom') {
          params.set('from', customStartDate);
          params.set('to', customEndDate);
        }
        const res = await api.sensorData(String(nodes[0].id), params.toString());
        const readings = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        if (!cancelled) setTableRows(readings.slice(0, 100));
      } catch {
        if (!cancelled) setTableRows([]);
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    };
    fetchTable();
    return () => {
      cancelled = true;
    };
  }, [timeRange, customStartDate, customEndDate]);

  const stabilityText = metrics.stabilityStatus === 'Stabil' ? 'Normal' : metrics.stabilityStatus === 'Pergerakan ringan' ? 'Warning' : 'Bahaya';
  const stabilityClass =
    metrics.stabilityStatus === 'Stabil'
      ? 'text-green-600 dark:text-green-400'
      : metrics.stabilityStatus === 'Pergerakan ringan'
        ? 'text-yellow-500 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';

  // Seri grafik getaran: 60 titik terakhir dari riwayat yang sama (tanpa fetch baru).
  const vibrationSeries = useMemo(() => chartData.slice(-60), [chartData]);

  // Visualisasi tandon mengikuti nilai aktual + kapasitas yang sudah dipakai halaman ini.
  const tankPercent = Math.min(Math.max((metrics.waterLevel / TANK_CAPACITY_CM) * 100, 0), 100);
  const tankStatus = getTankWaterStatus(metrics.waterLevel);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-none mx-0 overflow-x-hidden min-w-0">
      {/* Top Bar with Back to Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Dashboard</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
                Detail Status Fisik & Kapasitas Tandon
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Update: {lastSyncTime ? `${lastSyncTime} • ${lastSyncDate}` : 'Live'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={loadData}
            disabled={isRefreshing}
            aria-label="Segarkan Data"
            title="Segarkan Data"
            className="flex items-center justify-center p-2.5 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-xs"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
          </button>

          <Link
            to="/reports?parameter=water_level"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Ekspor Laporan</span>
          </Link>
        </div>
      </div>

      {/* Time Range Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
          <Filter className="h-4 w-4 text-blue-500" />
          <span>Rentang Waktu Analisis:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['today', '7d', '30d', 'custom'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                timeRange === r
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {r === 'today' ? 'Hari Ini' : r === '7d' ? '7 Hari Terakhir' : r === '30d' ? '30 Hari' : 'Kustom'}
            </button>
          ))}

          {timeRange === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              />
              <span className="text-gray-400 text-xs">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              />
            </div>
          )}
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs min-w-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Ketinggian Air</span>
          <div className="flex items-baseline gap-2 mt-1 mb-2">
            <span className="text-2xl font-black text-gray-900 dark:text-white font-mono">
              {metrics.waterLevel.toFixed(1)}
            </span>
            <span className="text-xs text-gray-400">cm / 100 cm</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${Math.min(metrics.waterLevel, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs min-w-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Status Pompa & Getaran</span>
          <div className="flex items-center gap-2 mt-1 mb-2">
            <span className={`text-lg font-bold ${metrics.vibration ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
              {metrics.vibration ? 'Warning' : 'Normal'}
            </span>
          </div>
          <span className="text-xs text-gray-400 block">
            {metrics.vibration ? 'Vibrasi mekanis terdeteksi' : 'Tidak ada getaran berlebih'}
          </span>
        </div>

        <div className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs min-w-0 sm:col-span-2 xl:col-span-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Stabilitas Tangki</span>
          <div className="flex items-center gap-2 mt-1 mb-2">
            <span className={`text-lg font-bold font-mono ${stabilityClass}`}>
              {stabilityText}
            </span>
          </div>
          <span className="text-xs text-gray-400 block font-mono">
            Roll: {metrics.roll.toFixed(1)}° • Pitch: {metrics.pitch.toFixed(1)}°
          </span>
        </div>
      </div>

      {/* Visualisasi Kondisi Fisik Tandon: tandon (kiri) + grafik getaran (kanan) */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
          Kondisi Fisik Tandon
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-4">
          Visualisasi level air dan grafik getaran mengikuti data aktual
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-0 lg:divide-x lg:divide-gray-100 dark:lg:divide-gray-800">
          {/* Kolom kiri: visualisasi fisik tandon */}
          <div className="min-w-0 flex flex-col items-center lg:pr-6">
            {/* Ilustrasi tandon — tinggi air = nilai aktual */}
            <div className="w-44 sm:w-52">
              {/* Tutup tandon */}
              <div className="mx-3 h-3 rounded-t-lg bg-gray-300 dark:bg-gray-600" />
              <div className="mx-6 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mb-1" />
              {/* Badan tandon */}
              <div className="relative h-56 sm:h-64 overflow-hidden rounded-b-2xl rounded-t-md border-2 border-t-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                {/* Isi air */}
                <div
                  className="absolute inset-x-0 bottom-0 transition-all duration-700"
                  style={{ height: `${tankPercent}%`, backgroundColor: tankStatus.fill }}
                >
                  <div
                    className="absolute -top-1.5 inset-x-0 h-3 rounded-[50%] opacity-80"
                    style={{ backgroundColor: tankStatus.surface }}
                  />
                </div>
                {/* Garis skala kuartil */}
                {[25, 50, 75].map((t) => (
                  <div
                    key={t}
                    className="absolute inset-x-0 h-px bg-gray-900/10 dark:bg-white/15"
                    style={{ bottom: `${t}%` }}
                  />
                ))}
                {/* Lencana persentase */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-white/85 dark:bg-gray-900/85 px-2.5 py-0.5 text-sm font-black font-mono text-gray-900 dark:text-white shadow-xs">
                    {tankPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Info minimal tepat di bawah tandon */}
            <div className="mt-3 text-center">
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-3xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                  {metrics.waterLevel.toFixed(1)}
                </span>
                <span className="text-xs text-gray-400 font-semibold">cm</span>
              </div>
              <div className="mt-1 text-xs">
                <span className="font-bold font-mono text-gray-500 dark:text-gray-400">{tankPercent.toFixed(1)}%</span>
                <span className="text-gray-300 dark:text-gray-600 mx-1.5">•</span>
                <span className={`font-bold ${tankStatus.textClass}`}>{tankStatus.text}</span>
              </div>
              <span className="text-[10px] text-gray-400 block mt-1">Sumber sensor: <span className="font-semibold text-gray-500 dark:text-gray-400">Ultrasonic Level Air Tandon</span></span>
            </div>
          </div>

          {/* Kolom kanan: grafik getaran */}
          <div className="min-w-0 w-full lg:pl-6 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Grafik Getaran</span>
              <span className={`text-[11px] font-bold ${metrics.vibration ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                {metrics.vibration ? 'Warning' : 'Normal'}
              </span>
            </div>
            <div className="relative h-64 sm:h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={vibrationSeries} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} ticks={[0, 1]} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 12,
                      border: 'none',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="stepAfter"
                    dataKey="vibration"
                    name="Getaran (0/1)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="#f59e0b"
                    fillOpacity={0.25}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {vibrationSeries.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  {hasLoaded ? 'Belum ada data getaran pada rentang ini.' : 'Memuat data...'}
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Kondisi terkini: <strong className={metrics.vibration ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}>{metrics.vibration ? 'Vibrasi mekanis terdeteksi' : 'Tidak ada getaran berlebih'}</strong>
              </span>
              <span className="text-gray-400 font-mono">
                Roll: {metrics.roll.toFixed(1)}° • Pitch: {metrics.pitch.toFixed(1)}°
              </span>
            </div>
            <span className="text-[10px] text-gray-400 block mt-1">Sumber sensor: <span className="font-semibold text-gray-500 dark:text-gray-400">SW-420</span> • Orientasi: <span className="font-semibold text-gray-500 dark:text-gray-400">MPU6050</span></span>
          </div>
        </div>
      </section>

      {/* Tabel data — 100 terbaru mengikuti rentang aktif */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Data Status Fisik
          </h3>
          <Link
            to="/reports?parameter=water_level"
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            Data lengkap di Reports →
          </Link>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          100 data terbaru • {timeRange === 'today' ? 'Hari Ini' : timeRange === '7d' ? '7 Hari Terakhir' : timeRange === '30d' ? '30 Hari' : 'Rentang Kustom'}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800 max-h-[520px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Ketinggian Air</th>
                <th className="px-4 py-3">Getaran</th>
                <th className="px-4 py-3">Roll / Pitch</th>
                <th className="px-4 py-3">Stabilitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {tableLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Memuat data...</td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {hasLoaded ? 'Belum ada data pada rentang ini.' : 'Memuat data...'}
                  </td>
                </tr>
              ) : (
                tableRows.map((r: any) => (
                  <tr key={r.id ?? `${r.created_at}-${r.water_level}`} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatWaktu(r.created_at)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                      {r.water_level !== null && r.water_level !== undefined ? `${Number(r.water_level).toFixed(1)} cm` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${r.vibration ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                        {r.vibration ? 'Terdeteksi' : 'Tidak'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">
                      {r.roll !== null && r.roll !== undefined ? Number(r.roll).toFixed(1) : '-'}° / {r.pitch !== null && r.pitch !== undefined ? Number(r.pitch).toFixed(1) : '-'}°
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.stability_status || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
