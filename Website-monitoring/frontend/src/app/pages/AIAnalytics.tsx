import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import {
  api,
  AIDiagnosticResponse,
  AIDiagnosticCurrent,
  AIDiagnosticHistoryItem,
} from '../lib/api';
import { useNode } from '../context/NodeContext';
import { getNodeCode } from '../lib/nodes';

export function AIAnalytics() {
  // Node aktif global — tanpa selector kedua; seluruh analisis mengikuti node ini.
  const { selectedNode, selectedNodeId } = useNode();
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AIDiagnosticResponse['data'] | null>(null);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  const fetchDiagnostics = useCallback(async (isManualRefresh = false) => {
    if (!selectedNodeId) {
      setData(null);
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
      return;
    }
    if (isManualRefresh) setRefreshing(true);
    try {
      setError(null);
      const response = await api.aiDiagnostics(selectedNodeId);
      if (response && response.data) {
        setData(response.data);
      } else {
        throw new Error('Data diagnostik AI tidak valid atau kosong.');
      }
    } catch (err: any) {
      console.error('Gagal mengambil data diagnostik AI:', err);
      setError(err?.message || 'Gagal menghubungi server diagnostik AI');
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(() => {
      fetchDiagnostics();
    }, 15000); // Polling otomatis tiap 15 detik
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  // Tanpa data backend → null (jangan tampilkan angka palsu).
  const current: AIDiagnosticCurrent | null = data?.current || null;

  const history: AIDiagnosticHistoryItem[] = data?.history || [];

  const formattedUpdateTime = useMemo(() => {
    try {
      if (!current?.timestamp) return 'Menunggu data...';
      if (current.timestamp.includes('WIB')) return current.timestamp;
      const d = new Date(current.timestamp);
      if (isNaN(d.getTime())) return `${current.timestamp} WIB`;
      const datePart = d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const timePart = d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).replace(/:/g, '.');
      return `${datePart}, ${timePart} WIB`;
    } catch {
      return `${current?.timestamp ?? '-'}`;
    }
  }, [current?.timestamp]);

  // Filter history
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchSearch =
        item.trigger.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.note.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.timestamp.toLowerCase().includes(historySearch.toLowerCase());
      const matchStatus =
        selectedStatusFilter === 'all' ||
        item.status.toLowerCase() === selectedStatusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [history, historySearch, selectedStatusFilter]);

  // Color config based on AI status (teks saja, tanpa capsule/dot)
  const statusConfig = {
    Normal: {
      textClass: 'text-green-600 dark:text-green-400',
      borderAccent: 'border-emerald-500/40',
      radarColor: '#10b981',
    },
    Anomali: {
      textClass: 'text-yellow-500 dark:text-yellow-400',
      borderAccent: 'border-amber-500/40',
      radarColor: '#f59e0b',
    },
    Bahaya: {
      textClass: 'text-red-600 dark:text-red-400',
      borderAccent: 'border-rose-500/40',
      radarColor: '#ef4444',
    },
  }[current?.status ?? ''] || {
    textClass: 'text-gray-600 dark:text-gray-300',
    borderAccent: 'border-gray-500',
    radarColor: '#3b82f6',
  };

  const displayStatus = !current ? '-' : current.status === 'Anomali' ? 'Warning' : current.status;

  // Tren status dari riwayat + rekomendasi berbasis trigger aktual (tanpa fabrikasi).
  const trendCounts = useMemo(() => {
    const c = { Normal: 0, Warning: 0, Bahaya: 0 };
    for (const h of history) {
      if (h.status === 'Bahaya') c.Bahaya += 1;
      else if (h.status === 'Anomali') c.Warning += 1;
      else c.Normal += 1;
    }
    return c;
  }, [history]);

  const recommendations: string[] = useMemo(() => {
    if (!current) return [];
    if (!current.triggers || current.triggers.length === 0) {
      return ['Semua parameter dalam batas aman — pertahankan jadwal perawatan dan kalibrasi rutin.'];
    }
    const advice: Record<string, string> = {
      ph: 'Periksa kalibrasi sensor pH dan sumber air baku.',
      turbidity: 'Periksa media filter dan endapan di tandon.',
      temp: 'Periksa ventilasi dan paparan panas di sekitar tandon.',
      water_level: 'Periksa pompa pengisi dan sensor level ultrasonik.',
      vibration: 'Periksa dudukan pompa dan peredam getaran.',
    };
    return current.triggers.map((tr) => {
      const key = Object.keys(advice).find((k) => tr.param.toLowerCase().includes(k));
      const base = `Parameter ${tr.param} (${tr.value}, level ${tr.level})`;
      return key ? `${base} — ${advice[key]}` : `${base} — periksa kondisi lapangan.`;
    });
  }, [current]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 w-full max-w-[1600px] mx-auto overflow-x-hidden">
      {/* =========================================================================
          HEADER
      ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl 2xl:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 border-l-4 border-blue-600 pl-3">
            Analisis AI
          </h1>
          {selectedNode && (
            <p className="text-xs font-mono text-gray-600 dark:text-gray-300 mt-1">
              Node aktif: <strong>{getNodeCode(selectedNode)}</strong> • {selectedNode.nama_lokasi}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Tombol Refresh ikon-only */}
          <button
            type="button"
            onClick={() => fetchDiagnostics(true)}
            disabled={refreshing}
            aria-label="Perbarui data AI"
            title="Perbarui data AI"
            className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2.5 text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          ERROR & LOADING STATES
      ========================================================================= */}
      {error && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Gagal Mengambil Diagnostik AI</p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchDiagnostics(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Coba Lagi
          </button>
        </div>
      )}

      {loading && !data && !error && (
        <div className="flex items-center justify-center p-12 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Menganalisis telemetri sensor dengan Edge AI...
            </p>
          </div>
        </div>
      )}

      {!current && !loading && !error && (
        <div className="flex items-center justify-center p-12 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
          <div className="text-center">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Belum ada hasil analisis AI untuk node ini.
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {selectedNode ? `Node: ${getNodeCode(selectedNode)}` : 'Pilih node aktif terlebih dahulu.'}
            </p>
          </div>
        </div>
      )}

      {current && (
      <>
      {/* =========================================================================
          3.1 KARTU DIAGNOSIS MULTIVARIAT AI (XAI CARD)
      ========================================================================= */}
      <div
        className={`relative overflow-hidden rounded-xl border-2 bg-white p-6 shadow-sm dark:bg-gray-900 transition-all ${statusConfig.borderAccent}`}
      >
        {/* Header Kartu: Status Keputusan AI & Terakhir Update (Bold) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-4 dark:border-gray-800">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Status Keputusan AI
          </span>
          <span className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">
            Terakhir Update: {formattedUpdateTime}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Sisi Kiri: Penjelasan Bahasa Manusia */}
          <div className="flex-1 space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 border border-gray-100 dark:border-gray-800 dark:bg-gray-800/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                Penjelasan
              </h4>
              <p className="mt-1 text-sm font-medium leading-relaxed text-gray-800 dark:text-gray-200">
                "{current.diagnosis}"
              </p>
            </div>
          </div>

          {/* Sisi Kanan: Area Tingkat Keyakinan dengan Status Keputusan AI di Kanan Atas */}
          <div className="w-full lg:w-80 rounded-xl bg-gray-50/80 p-4 border border-gray-100 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Tingkat Keyakinan
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black tracking-tight text-gray-900 dark:text-gray-100">
                    {current.confidence}%
                  </span>
                  <span className="text-xs font-semibold text-gray-500">Yakin</span>
                </div>
              </div>

              {/* Status Keputusan AI teks saja (tanpa dot/capsule) */}
              <span className={`text-xs sm:text-sm font-bold ${statusConfig.textClass}`}>
                {displayStatus.toUpperCase()}
              </span>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full transition-all duration-500 ${
                  current.status === 'Bahaya'
                    ? 'bg-rose-500'
                    : current.status === 'Anomali'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(current.confidence, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MIDDLE GRID: RADAR CHART (3.2) & TRADITIONAL VS AI SUMMARY (3.3)
      ========================================================================= */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 3.2 Grafik Radar / Spider Chart (5 Parameter) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 lg:col-span-6 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Radar Analisis 5 Parameter
              </h3>
            </div>
          </div>

          <div className="my-3 h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={current.radar}>
                <PolarGrid stroke="#94a3b8" strokeOpacity={0.25} />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 9 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg dark:border-gray-700 dark:bg-gray-800 text-xs">
                          <p className="font-bold text-gray-900 dark:text-gray-100">{d.subject}</p>
                          <p className="text-gray-600 dark:text-gray-300">
                            Nilai Aktual: <strong>{d.nilai_aktual} {d.unit}</strong>
                          </p>
                          <p className="text-emerald-600 dark:text-emerald-400">
                            Batas Aman Deviasi: {d.batas_aman}%
                          </p>
                          <p className="text-blue-600 dark:text-blue-400">
                            Tingkat Resiko AI: {d.skor}%
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
                  iconType="circle"
                />
                {/* Layer 1: Batas Aman (Area hijau transparan) */}
                <Radar
                  name="Batas Aman Sistem"
                  dataKey="batas_aman"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.18}
                />
                {/* Layer 2: Data Real-Time Aktual */}
                <Radar
                  name="Data Aktual Telemetri"
                  dataKey="skor"
                  stroke={statusConfig.radarColor}
                  fill={statusConfig.radarColor}
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg bg-gray-50 p-2.5 text-[11px] text-gray-500 dark:bg-gray-800/60 dark:text-gray-400 flex items-center justify-between">
            <span>• Area hijau: zona toleransi ideal tanpa gangguan.</span>
            <span>• Titik menonjol: anomali multivariat.</span>
          </div>
        </div>

        {/* Ringkasan Nilai Sensor Aktual */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 lg:col-span-6 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Nilai Telemetri Sensor Saat Ini
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Data masukan sensor yang diolah oleh Edge AI di ESP32.
            </p>
          </div>

          <div className="my-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">pH Air</span>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {current.raw_reading.ph} <span className="text-xs font-normal text-gray-500">pH</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Batas: 6.5 - 8.5</span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Kekeruhan</span>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {current.raw_reading.turbidity} <span className="text-xs font-normal text-gray-500">NTU</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Batas: &lt; 5 NTU</span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Suhu Air</span>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {current.raw_reading.temp} <span className="text-xs font-normal text-gray-500">°C</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Batas: &lt; 32°C</span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Ketinggian Air</span>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {current.raw_reading.water_level} <span className="text-xs font-normal text-gray-500">cm</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Batas: 20 - 85 cm</span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50 col-span-2 sm:col-span-2">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Getaran Pompa Mekanis</span>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {current.raw_reading.vibration} <span className="text-xs font-normal text-gray-500">pulsa / sampling</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Ambang batas normal: &lt; 6 pulsa</span>
            </div>
          </div>
        </div>
      </div>


      </>
      )}

      {/* TREN STATUS + REKOMENDASI BERBASIS DATA AKTUAL */}
      {current && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Tren & Rekomendasi
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Dihitung dari {history.length} diagnosis terakhir node {selectedNode ? getNodeCode(selectedNode) : '-'}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-green-50 dark:bg-green-950/50 px-2.5 py-1 text-green-600 dark:text-green-400">
              Normal: {trendCounts.Normal}
            </span>
            <span className="rounded-full bg-yellow-50 dark:bg-yellow-950/50 px-2.5 py-1 text-yellow-600 dark:text-yellow-400">
              Warning: {trendCounts.Warning}
            </span>
            <span className="rounded-full bg-red-50 dark:bg-red-950/50 px-2.5 py-1 text-red-600 dark:text-red-400">
              Bahaya: {trendCounts.Bahaya}
            </span>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* =========================================================================
          3.4 TABEL RIWAYAT DIAGNOSA AI
      ========================================================================= */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Riwayat Diagnosa Multivariat AI
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Log keputusan inferensi realtime yang tercatat secara kronologis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Status */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="all">Semua Status</option>
              <option value="Normal">Normal</option>
              <option value="Anomali">Warning</option>
              <option value="Bahaya">Bahaya</option>
            </select>

            {/* Pencarian */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari catatan / pemicu..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600 dark:text-gray-300">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Waktu Telemetri</th>
                <th className="px-4 py-3">Status AI</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Parameter Pemicu Utama</th>
                <th className="px-4 py-3">Catatan Singkat / Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {row.timestamp}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-bold ${
                          row.status === 'Bahaya'
                            ? 'text-red-600 dark:text-red-400'
                            : row.status === 'Anomali'
                              ? 'text-yellow-500 dark:text-yellow-400'
                              : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {row.status === 'Anomali' ? 'Warning' : row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200">
                      {row.confidence}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                      {row.trigger}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 leading-relaxed max-w-md">
                      {row.note}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                    {loading ? 'Memuat riwayat diagnosa...' : 'Tidak ada riwayat diagnosa AI yang cocok.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
