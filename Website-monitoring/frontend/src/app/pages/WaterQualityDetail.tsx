import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  Calendar,
  Filter,
  RefreshCw,
  Download,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

function formatWaktu(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

export function WaterQualityDetail() {
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'custom'>('today');
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
    ph: 7.2,
    turbidity: 8,
    temperature: 26.5,
    waterLevel: 80.0,
    aiStatus: 'Normal',
    aiConfidence: 94.5,
    aiDiagnosis: 'Seluruh parameter kualitas air dalam batas optimal.',
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

      const primaryNode = nodes[0];
      const lr = (primaryNode as any).last_reading || {};

      setMetrics({
        ph: Number(lr.ph ?? 7.2),
        turbidity: Number(lr.turbidity ?? 8),
        temperature: Number(lr.temp ?? 26.5),
        waterLevel: Number(lr.water_level ?? 80),
        aiStatus: lr.ai_status || 'Normal',
        aiConfidence: lr.ai_confidence ? Number(lr.ai_confidence) : 94.5,
        aiDiagnosis: lr.ai_diagnosis || 'Kualitas air memenuhi baku mutu standar Permenkes.',
      });

      if (primaryNode.last_seen_at) {
        const d = new Date(primaryNode.last_seen_at);
        setLastSyncTime(d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        setLastSyncDate(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
      }

      // Fetch historical data
      const queryParams: Record<string, string> = { range: timeRange };
      if (timeRange === 'custom') {
        queryParams.from = customStartDate;
        queryParams.to = customEndDate;
      }

      const historyRes = await api.sensorData(String(primaryNode.id), queryParams);
      const readings = historyRes.data?.data || (Array.isArray(historyRes.data) ? historyRes.data : []);

      if (readings.length > 0) {
        const formatted = readings
          .slice()
          .reverse()
          .map((r: any, idx: number) => {
            const dateObj = r.created_at ? new Date(r.created_at) : new Date(Date.now() - (readings.length - idx) * 300000);
            return {
              time: dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              fullDate: dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              ph: Number(r.ph ?? 7.0),
              turbidity: Number(r.turbidity ?? 0),
            };
          });
        setChartData(formatted);
      }
    } catch (err) {
      console.error('Gagal mengambil data kualitas air:', err);
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

  // Evaluasi pH
  const phValue = metrics.ph;
  const isPhAcidic = phValue < 6.5;
  const isPhBasic = phValue > 8.5;
  const isPhNormal = !isPhAcidic && !isPhBasic;

  const deltaFromNeutral = (phValue - 7.0).toFixed(2);
  const deficiencySummary = isPhAcidic
    ? `Kurang ${(6.5 - phValue).toFixed(2)} pH dari batas minimal (6.5)`
    : isPhBasic
    ? `Melebihi ${(phValue - 8.5).toFixed(2)} pH dari batas maksimal (8.5)`
    : `Ideal (Deviasi ${deltaFromNeutral > '0' ? '+' : ''}${deltaFromNeutral} dari pH netral 7.0)`;

  // Evaluasi Kekeruhan -> Normal / Warning / Bahaya (teks saja)
  const turbValue = metrics.turbidity;
  const turbStatus = turbValue <= 5 ? 'Normal' : turbValue <= 25 ? 'Warning' : 'Bahaya';
  const turbTextClass =
    turbValue <= 5
      ? 'text-green-600 dark:text-green-400'
      : turbValue <= 25
      ? 'text-yellow-500 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';

  const phStatusText = isPhNormal ? 'Normal' : 'Bahaya';
  const phTextClass = isPhNormal ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-[1600px] mx-auto overflow-x-hidden">
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
                Detail Kualitas Air (pH & Kekeruhan)
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Update: {lastSyncTime ? `${lastSyncTime} • ${lastSyncDate}` : 'Live'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls (ikon-only, berputar saat refresh) */}
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
            to="/reports?parameter=ph"
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

      {/* Grid 2 Kolom: Detail pH & Detail Kekeruhan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2 gap-6">
        {/* ===================== KARTU 1: pH AIR DEEP DIVE ===================== */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Tingkat Keasaman (pH Air)
                </h2>
              </div>
              <span className={`text-xs font-bold ${phTextClass}`}>
                {phStatusText}
              </span>
            </div>

            {/* Nilai pH Besar & Ringkasan */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-4xl font-extrabold text-gray-900 dark:text-white font-mono tracking-tight">
                {phValue.toFixed(2)}
              </span>
              <span className="text-base font-semibold text-gray-500 dark:text-gray-400">pH</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                Standar Aman: <strong>6.5 – 8.5</strong>
              </span>
            </div>

            {/* Gauge Bar Visual Proporsional */}
            <div className="space-y-1.5 mb-5">
              <div className="h-3 w-full rounded-full bg-gradient-to-r from-red-500 via-emerald-400 to-indigo-600 relative overflow-hidden shadow-inner">
                {/* Pointer Posisi Nilai pH */}
                <div
                  className="absolute top-0 bottom-0 w-1.5 bg-white border border-gray-900 shadow-md transition-all duration-500"
                  style={{ left: `${Math.min(Math.max((phValue / 14) * 100, 2), 98)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                <span>0 (Asam Ekstrem)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">6.5 - 8.5 (Normal)</span>
                <span>14 (Basa Ekstrem)</span>
              </div>
            </div>

            {/* Kotak Analisis Deviasi */}
            <div className="rounded-xl p-3.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Deviasi terhadap Standar:</span>
                <strong className="text-gray-900 dark:text-white font-medium">{deficiencySummary}</strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Titik Tengah Ideal:</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">7.00 pH (Netral Murni)</span>
              </div>
            </div>

            <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300">
              Update: {lastSyncDate ? `${lastSyncDate}` : '-'}
            </div>

            {/* Grafik Riwayat pH */}
            <div className="space-y-2 mt-4">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tren Nilai pH ({timeRange === 'today' ? 'Hari Ini' : 'Periode Terpilih'})
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[4, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        color: '#fff',
                        borderRadius: 8,
                        fontSize: 12,
                        border: 'none',
                      }}
                    />
                    <ReferenceLine y={6.5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Min 6.5', fill: '#ef4444', fontSize: 10 }} />
                    <ReferenceLine y={8.5} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Max 8.5', fill: '#3b82f6', fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="ph"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== KARTU 2: KEKERUHAN (TURBIDITY) DEEP DIVE ===================== */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Kekeruhan Air (Turbidity)
                </h2>
              </div>
              <span className={`text-xs font-bold ${turbTextClass}`}>
                {turbStatus} ({turbValue} NTU)
              </span>
            </div>

            {/* Nilai Turbidity Besar */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-4xl font-extrabold text-gray-900 dark:text-white font-mono tracking-tight">
                {turbValue}
              </span>
              <span className="text-base font-semibold text-gray-500 dark:text-gray-400">NTU</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                Batas Jernih: <strong>≤ 5 NTU</strong>
              </span>
            </div>

            {/* Clarity Level Meter */}
            <div className="space-y-1.5 mb-5">
              <div className="h-3 w-full rounded-full bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    turbValue <= 5
                      ? 'bg-emerald-500'
                      : turbValue <= 25
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(Math.max((turbValue / 100) * 100, 4), 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                <span>0 NTU (Sangat Jernih)</span>
                <span>25 NTU (Agak Keruh)</span>
                <span>100 NTU (Lumpur Pekat)</span>
              </div>
            </div>

            {/* Status Kejernihan & Filter */}
            <div className="rounded-xl p-3.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Klasifikasi Kejernihan:</span>
                <strong className="text-gray-900 dark:text-white font-medium">
                  {turbValue <= 5 ? 'Air Bening (Layak)' : turbValue <= 25 ? 'Sedikit Partikel' : 'Sedimen Tinggi'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Status Media Filter:</span>
                <span className={`font-bold ${turbValue <= 5 ? 'text-green-600' : 'text-yellow-500'}`}>
                  {turbValue <= 5 ? 'Normal' : 'Warning'}
                </span>
              </div>
            </div>

            <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300 mb-4">
              Update: {lastSyncDate ? `${lastSyncDate}` : '-'}
            </div>

            {/* Grafik Riwayat Turbidity */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tren Kekeruhan ({timeRange === 'today' ? 'Hari Ini' : 'Periode Terpilih'})
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="turbGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        color: '#fff',
                        borderRadius: 8,
                        fontSize: 12,
                        border: 'none',
                      }}
                    />
                    <ReferenceLine y={5} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Batas 5 NTU', fill: '#10b981', fontSize: 10 }} />
                    <Area
                      type="monotone"
                      dataKey="turbidity"
                      stroke="#06b6d4"
                      fillOpacity={1}
                      fill="url(#turbGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== KARTU ANALISIS AI TERINTEGRASI ===================== */}
      <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/40 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/30 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Analisis AI
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Inferensi machine learning real-time langsung dari mikrokontroler ESP32
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Tingkat Keyakinan: <strong>{metrics.aiConfidence}%</strong>
            </span>
            <span
              className={`text-xs font-bold ${
                metrics.aiStatus === 'Normal'
                  ? 'text-green-600 dark:text-green-400'
                  : metrics.aiStatus === 'Anomali'
                  ? 'text-yellow-500 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {metrics.aiStatus === 'Anomali' ? 'Warning' : metrics.aiStatus}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
          <strong>Hasil Analisis Otomatis:</strong> {metrics.aiDiagnosis}
        </div>
      </div>

      {/* Tabel data — 100 terbaru mengikuti rentang aktif */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Data Kualitas Air
          </h3>
          <Link
            to="/reports?parameter=ph"
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
                <th className="px-4 py-3">pH</th>
                <th className="px-4 py-3">Status pH</th>
                <th className="px-4 py-3">Kekeruhan</th>
                <th className="px-4 py-3">Status Kekeruhan</th>
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
                tableRows.map((r: any) => {
                  const ph = r.ph !== null && r.ph !== undefined ? Number(r.ph) : null;
                  const turb = r.turbidity !== null && r.turbidity !== undefined ? Number(r.turbidity) : null;
                  const phOk = ph !== null && ph >= 6.5 && ph <= 8.5;
                  const turbLabel = turb === null ? '-' : turb <= 5 ? 'Normal' : turb <= 25 ? 'Warning' : 'Bahaya';
                  return (
                    <tr key={r.id ?? r.created_at} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatWaktu(r.created_at)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                        {ph !== null ? ph.toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${ph === null ? 'text-gray-400' : phOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {ph === null ? '-' : phOk ? 'Normal' : 'Bahaya'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                        {turb !== null ? `${turb} NTU` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${turb === null ? 'text-gray-400' : turb <= 5 ? 'text-green-600 dark:text-green-400' : turb <= 25 ? 'text-yellow-500 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                          {turbLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
