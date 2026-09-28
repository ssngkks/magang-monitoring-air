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
import { getLastReading, getNodeCode } from '../lib/nodes';
import { useNode } from '../context/NodeContext';
import { NodeSelector } from '../components/NodeSelector';
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

export function EnvironmentDetail() {
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
  const { nodes, selectedNode, selectedNodeId, setSelectedNodeId, isLoading: nodesLoading } = useNode();

  // Tandai selesai saat daftar node global selesai dimuat (termasuk kasus kosong).
  useEffect(() => {
    if (!nodesLoading) setHasLoaded(true);
  }, [nodesLoading]);

  const [metrics, setMetrics] = useState({
    temperature: 28.5,
    humidity: 65.0,
    tempMin: 24.2,
    tempMax: 32.1,
    humidityMin: 52.0,
    humidityMax: 78.0,
  });

  const loadData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      if (!selectedNode || !selectedNodeId) {
        setIsRefreshing(false);
        return;
      }

      const lr = getLastReading(selectedNode);

      const currentTemp = Number(lr.temp ?? 28.5);
      const currentHum = Number(lr.humidity ?? 65.0);

      if (selectedNode.last_seen_at) {
        const d = new Date(selectedNode.last_seen_at);
        setLastSyncTime(d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        setLastSyncDate(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
      }

      // Fetch historical data: 1 request, server mengembalikan ≤200 titik
      // yang tersebar MERATA selebar rentang (downsample server-side).
      const chartParams = new URLSearchParams({ range: timeRange, downsample: '200' });
      if (timeRange === 'custom') {
        chartParams.set('from', customStartDate);
        chartParams.set('to', customEndDate);
      }

      const historyRes: any = await api.sensorData(String(selectedNodeId), chartParams.toString());
      const readings = historyRes?.data?.data || (Array.isArray(historyRes?.data) ? historyRes.data : []);

      if (readings.length > 0) {
        let minT = 999;
        let maxT = -999;
        let minH = 999;
        let maxH = -999;

        const formatted = readings
          .slice()
          .reverse()
          .map((r: any, idx: number) => {
            const dateObj = r.created_at ? new Date(r.created_at) : new Date(Date.now() - (readings.length - idx) * 300000);
            const t = Number(r.temp ?? 28);
            const h = Number(r.humidity ?? 60);

            if (t < minT) minT = t;
            if (t > maxT) maxT = t;
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;

            return {
              time: timeRange === 'today'
                ? dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                : `${dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric' })} ${dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
              fullDate: dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
              temperature: t,
              humidity: h,
            };
          });

        setMetrics({
          temperature: currentTemp,
          humidity: currentHum,
          tempMin: minT !== 999 ? minT : currentTemp - 2,
          tempMax: maxT !== -999 ? maxT : currentTemp + 3,
          humidityMin: minH !== 999 ? minH : currentHum - 8,
          humidityMax: maxH !== -999 ? maxH : currentHum + 10,
        });

        setChartData(formatted);
      } else {
        setMetrics((prev) => ({
          ...prev,
          temperature: currentTemp,
          humidity: currentHum,
        }));
      }
    } catch (err) {
      console.error('Gagal mengambil data lingkungan:', err);
    } finally {
      setHasLoaded(true);
      setIsRefreshing(false);
    }
  }, [selectedNode, selectedNodeId, timeRange, customStartDate, customEndDate]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Tabel 100 data terbaru — mengikuti node terpilih & rentang aktif
  useEffect(() => {
    let cancelled = false;
    const fetchTable = async () => {
      if (!selectedNodeId) {
        if (!cancelled) setTableRows([]);
        return;
      }
      try {
        setTableLoading(true);
        const params = new URLSearchParams({ range: timeRange, per_page: '100' });
        if (timeRange === 'custom') {
          params.set('from', customStartDate);
          params.set('to', customEndDate);
        }
        const res = await api.sensorData(String(selectedNodeId), params.toString());
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
  }, [selectedNodeId, timeRange, customStartDate, customEndDate]);

  // Evaluasi Suhu -> Normal / Warning / Bahaya (teks saja)
  const tempVal = metrics.temperature;
  const tempStatus = tempVal <= 30 ? 'Normal' : tempVal <= 35 ? 'Warning' : 'Bahaya';
  const tempTextClass =
    tempVal <= 30
      ? 'text-green-600 dark:text-green-400'
      : tempVal <= 35
      ? 'text-yellow-500 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';

  // Evaluasi Kelembapan & Titik Embun (Dew Point approximation: T - ((100 - RH) / 5))
  const humVal = metrics.humidity;
  const dewPoint = (tempVal - (100 - humVal) / 5).toFixed(1);
  const humStatus = humVal >= 40 && humVal <= 70 ? 'Normal' : humVal > 70 && humVal <= 85 ? 'Warning' : 'Bahaya';
  const humTextClass =
    humVal >= 40 && humVal <= 70
      ? 'text-green-600 dark:text-green-400'
      : humVal > 70 && humVal <= 85
      ? 'text-yellow-500 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';

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
                Detail Kondisi Lingkungan (Suhu & Kelembapan)
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Update: {lastSyncTime ? `${lastSyncTime} • ${lastSyncDate}` : 'Live'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls (ikon-only) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={loadData}
            disabled={isRefreshing}
            aria-label="Segarkan Data"
            title="Segarkan Data"
            className="flex items-center justify-center p-2.5 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-xs"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
          </button>

          <Link
            to="/reports?parameter=suhu"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Ekspor Laporan</span>
          </Link>
        </div>
      </div>

      {/* Node selector global — semua metrics, chart & tabel mengikuti node terpilih */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Node:</span>
        <NodeSelector nodes={nodes} value={selectedNodeId} onChange={setSelectedNodeId} />
        {selectedNode && (
          <span className="text-[11px] text-gray-400">
            {getNodeCode(selectedNode)} • {selectedNode.nama_lokasi}
          </span>
        )}
      </div>

      {/* Time Range Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
          <Filter className="h-4 w-4 text-amber-500" />
          <span>Rentang Waktu Analisis Lingkungan:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['today', '7d', '30d', 'custom'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                timeRange === r
                  ? 'bg-amber-600 text-white shadow-xs'
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

      {/* Grid 2 Kolom: Detail Suhu & Detail Kelembapan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2 gap-6">
        {/* ===================== KARTU 1: SUHU UDARA DEEP DIVE ===================== */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Suhu Lingkungan Tandon
                </h2>
              </div>
              <span className={`text-xs font-bold ${tempTextClass}`}>
                {tempStatus}
              </span>
            </div>

            {/* Nilai Suhu Besar */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-4xl font-extrabold text-gray-900 dark:text-white font-mono tracking-tight">
                {tempVal.toFixed(1)}
              </span>
              <span className="text-base font-semibold text-gray-500 dark:text-gray-400">°C</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                Rentang Optimal: <strong>22 – 30 °C</strong>
              </span>
            </div>

            {/* Thermometer Visual Bar */}
            <div className="space-y-1.5 mb-5">
              <div className="h-3 w-full rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 to-red-500 relative overflow-hidden shadow-inner">
                <div
                  className="absolute top-0 bottom-0 w-1.5 bg-white border border-gray-900 shadow-md transition-all duration-500"
                  style={{ left: `${Math.min(Math.max(((tempVal - 15) / 30) * 100, 2), 98)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                <span>15 °C (Dingin)</span>
                <span className="font-bold text-emerald-600">22 - 30 °C (Ideal)</span>
                <span>45 °C (Panas Ekstrem)</span>
              </div>
            </div>

            {/* Statistik Suhu Min/Max */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60">
                <span className="text-[11px] text-gray-400">Suhu Terendah Periode:</span>
                <div className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                  {metrics.tempMin.toFixed(1)} °C
                </div>
              </div>
              <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60">
                <span className="text-[11px] text-gray-400">Suhu Tertinggi Periode:</span>
                <div className="text-sm font-bold text-red-600 dark:text-red-400 font-mono mt-0.5">
                  {metrics.tempMax.toFixed(1)} °C
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300 mb-4">
              Update: {lastSyncDate ? `${lastSyncDate}` : '-'}
            </div>

            {/* Grafik Riwayat Suhu */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tren Fluktuasi Suhu ({timeRange === 'today' ? 'Hari Ini' : 'Periode Terpilih'})
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[15, 45]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        color: '#fff',
                        borderRadius: 8,
                        fontSize: 12,
                        border: 'none',
                      }}
                    />
                    <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Batas 30°C', fill: '#ef4444', fontSize: 10 }} />
                    <Area
                      type="monotone"
                      dataKey="temperature"
                      stroke="#f59e0b"
                      fillOpacity={1}
                      fill="url(#tempGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== KARTU 2: KELEMBAPAN UDARA DEEP DIVE ===================== */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Kelembapan Relatif Udara (RH)
                </h2>
              </div>
              <span className={`text-xs font-bold ${humTextClass}`}>
                {humStatus}
              </span>
            </div>

            {/* Nilai Kelembapan Besar */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-4xl font-extrabold text-gray-900 dark:text-white font-mono tracking-tight">
                {humVal.toFixed(1)}
              </span>
              <span className="text-base font-semibold text-gray-500 dark:text-gray-400">%</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                Rentang Ideal: <strong>40 – 70 %</strong>
              </span>
            </div>

            {/* Humidity Visual Meter */}
            <div className="space-y-1.5 mb-5">
              <div className="h-3 w-full rounded-full bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-all duration-500"
                  style={{ width: `${Math.min(Math.max(humVal, 5), 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                <span>0% (Sangat Kering)</span>
                <span className="font-bold text-blue-600">40 - 70% (Nyaman)</span>
                <span>100% (Kondensasi Jenuh)</span>
              </div>
            </div>

            {/* Estimasi Titik Embun & Kondensasi */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60">
                <span className="text-[11px] text-gray-400">Titik Embun (Dew Point):</span>
                <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono mt-0.5">
                  {dewPoint} °C
                </div>
              </div>
              <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60">
                <span className="text-[11px] text-gray-400">Risiko Kondensasi Fisik:</span>
                <div className={`text-sm font-bold font-mono mt-0.5 ${humVal > 75 ? 'text-yellow-500' : 'text-green-600'}`}>
                  {humVal > 75 ? 'Warning' : 'Normal'}
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300 mb-4">
              Update: {lastSyncDate ? `${lastSyncDate}` : '-'}
            </div>

            {/* Grafik Riwayat Kelembapan */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tren Kelembapan ({timeRange === 'today' ? 'Hari Ini' : 'Periode Terpilih'})
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[20, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        color: '#fff',
                        borderRadius: 8,
                        fontSize: 12,
                        border: 'none',
                      }}
                    />
                    <ReferenceLine y={70} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Batas 70%', fill: '#3b82f6', fontSize: 10 }} />
                    <Area
                      type="monotone"
                      dataKey="humidity"
                      stroke="#3b82f6"
                      fillOpacity={1}
                      fill="url(#humGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabel data — 100 terbaru mengikuti rentang aktif */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Data Lingkungan
          </h3>
          <Link
            to="/reports?parameter=temperature"
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
                <th className="px-4 py-3">Suhu</th>
                <th className="px-4 py-3">Status Suhu</th>
                <th className="px-4 py-3">Kelembapan</th>
                <th className="px-4 py-3">Status Kelembapan</th>
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
                  const t = r.temp !== null && r.temp !== undefined ? Number(r.temp) : null;
                  const h = r.humidity !== null && r.humidity !== undefined ? Number(r.humidity) : null;
                  const tempLabel = t === null ? '-' : t <= 30 ? 'Normal' : t <= 35 ? 'Warning' : 'Bahaya';
                  const humLabel = h === null ? '-' : h >= 40 && h <= 70 ? 'Normal' : 'Warning';
                  return (
                    <tr key={r.id ?? r.created_at} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatWaktu(r.created_at)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                        {t !== null ? `${t.toFixed(1)} °C` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${t === null ? 'text-gray-400' : t <= 30 ? 'text-green-600 dark:text-green-400' : t <= 35 ? 'text-yellow-500 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                          {tempLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">
                        {h !== null ? `${h.toFixed(1)} %` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${h === null ? 'text-gray-400' : h >= 40 && h <= 70 ? 'text-green-600 dark:text-green-400' : 'text-yellow-500 dark:text-yellow-400'}`}>
                          {humLabel}
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
