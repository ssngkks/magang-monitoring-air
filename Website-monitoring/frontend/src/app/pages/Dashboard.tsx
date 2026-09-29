import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Cpu,
  Wifi,
  WifiOff,
  SignalHigh,
  Antenna,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Node, api } from '../lib/api';
import {
  getNodeOverallStatus,
  getWaterQualityStatus,
  getEnvironmentStatus,
  getPhysicalStatus,
  getTankWaterStatus,
  getLastReading,
  getNodeTimestamp,
  isNodeOnline,
  isGateway,
  sensorNodes,
  averageReadings,
  getNodeCode,
  getNodeName,
  getNodeLocation,
  statusTextClass,
  NodeStatus,
} from '../lib/nodes';
import { useNode } from '../context/NodeContext';
import { NodeSelector } from '../components/NodeSelector';
import { NodeDetailModal } from '../components/NodeDetailModal';

function CountBadge({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />
      {label}: <strong className="font-mono">{count}</strong>
    </span>
  );
}

function fmt(v: unknown, digits = 1, suffix = ''): string {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  return `${n.toFixed(digits)}${suffix}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
}

/** Kartu sinyal kecil (hijau/biru/ungu soft): ikon kiri-atas + label, value besar, progress pill. */
function SignalCard({
  icon: Icon,
  label,
  value,
  pct,
  title,
  iconBg,
  iconColor,
  cardBg,
  trackBg,
  fillBg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  pct: number | null;
  title?: string;
  iconBg: string;
  iconColor: string;
  cardBg: string;
  trackBg: string;
  fillBg: string;
}) {
  return (
    <div title={title} className={`rounded-xl border border-gray-200/70 dark:border-gray-800 p-4 ${cardBg}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </span>
        <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      <div className="mt-4 text-[26px] leading-none font-bold text-slate-800 dark:text-slate-100">{value}</div>
      <div className={`mt-3 h-2 rounded-full ${trackBg}`}>
        <div className={`h-full rounded-full ${fillBg} transition-all`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

/** Normalisasi khusus tampilan (angka asli tidak diubah — hanya panjang bar). */
function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function Dashboard() {
  const navigate = useNavigate();
  const {
    nodes,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    summary,
    isLoading,
    fetchError,
    refresh,
  } = useNode();

  const [modalNode, setModalNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');

  useEffect(() => {
    if (nodes.length) {
      const now = new Date();
      setLastUpdate(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
      );
    }
  }, [nodes]);

  // History HANYA selected node — request lama dibatalkan agar switch node bebas race.
  // Tanpa filter tanggal: tampilkan seluruh riwayat apa adanya (data lama tetap
  // terlihat walau data baru belum masuk). Error dibedakan dari kosong.
  const [historyError, setHistoryError] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Mode "Semua Node": rata-rata node sensor (gateway tidak ikut — tidak
  // punya sensor). Sekarang 1 node = data node 1 persis; nanti N node = rata-rata.
  // Murni state lokal Dashboard (tidak disimpan ke URL/storage).
  const [showAll, setShowAll] = useState(false);
  const contributors = useMemo(
    () => (showAll ? sensorNodes(nodes) : []),
    [showAll, nodes]
  );
  const aggregate = useMemo(
    () => (showAll ? averageReadings(contributors) : { count: 0, reading: null }),
    [showAll, contributors]
  );

  const fetchHistory = async (nodeIds: string[], cancelledRef?: { current: boolean }) => {
    if (nodeIds.length === 0) {
      setHistory([]);
      return;
    }
    try {
      setHistoryLoading(true);
      setHistoryError(false);
      // Ambil history tiap kontributor paralel, gabung per menit (rata-rata).
      const results = await Promise.all(
        nodeIds.map((id) =>
          api.sensorData(String(id), 'per_page=200&downsample=100').catch(() => null)
        )
      );
      if (cancelledRef?.current) return;
      const buckets = new Map<number, { time: string; ph: number[]; waterLevel: number[]; turbidity: number[] }>();
      for (const res of results) {
        const readings = res?.data?.data || (Array.isArray(res?.data) ? res.data : []);
        for (const r of readings) {
          const d = r.created_at ? new Date(r.created_at) : null;
          if (!d || isNaN(d.getTime())) continue;
          const ts = Math.floor(d.getTime() / 60000) * 60000;
          let b = buckets.get(ts);
          if (!b) {
            b = {
              time: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              ph: [], waterLevel: [], turbidity: [],
            };
            buckets.set(ts, b);
          }
          if (r.ph !== null && r.ph !== undefined) b.ph.push(Number(r.ph));
          if (r.water_level !== null && r.water_level !== undefined) b.waterLevel.push(Number(r.water_level));
          if (r.turbidity !== null && r.turbidity !== undefined) b.turbidity.push(Number(r.turbidity));
        }
      }
      const avg = (a: number[]) => (a.length > 0 ? a.reduce((x, y) => x + y, 0) / a.length : null);
      setHistory(
        [...buckets.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, b]) => ({ time: b.time, ph: avg(b.ph), waterLevel: avg(b.waterLevel), turbidity: avg(b.turbidity) }))
      );
    } catch {
      if (!cancelledRef || !cancelledRef.current) {
        setHistory([]);
        setHistoryError(true);
      }
    } finally {
      if (!cancelledRef || !cancelledRef.current) setHistoryLoading(false);
    }
  };

  // Id kontributor efektif: mode All = semua node sensor; single = node terpilih.
  const historyIds = useMemo(() => {
    if (showAll) return contributors.map((n) => String(n.id));
    return selectedNodeId ? [selectedNodeId] : [];
  }, [showAll, contributors, selectedNodeId]);

  useEffect(() => {
    const cancelledRef = { current: false };
    fetchHistory(historyIds, cancelledRef);
    const timer = setInterval(() => fetchHistory(historyIds, cancelledRef), 15000);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, showAll, nodes.length]);

  // Tombol sinkron kanan atas: putar + refresh daftar node + history terpilih.
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      refresh();
      await fetchHistory(historyIds);
    } finally {
      setSyncing(false);
    }
  };

  const fetchStatus = isLoading ? 'loading' : fetchError ? 'error' : nodes.length === 0 ? 'empty' : 'success';

  const worstAi = useMemo(() => {
    let worst = 'Normal';
    for (const n of nodes) {
      const ai = (getLastReading(n).ai_status ?? 'Normal') as string;
      if (ai === 'Bahaya') return 'Bahaya';
      if (ai === 'Anomali' || ai === 'Warning') worst = 'Warning';
    }
    return worst;
  }, [nodes]);

  // Bacaan tampil: mode All = rata-rata kontributor; single = node terpilih.
  // Koneksi tampil: mode All = ada kontributor online.
  const displayReading = showAll ? aggregate.reading : (selectedNode ? getLastReading(selectedNode) : null);
  const displayOnline = showAll
    ? contributors.some((n) => isNodeOnline(n))
    : (selectedNode ? isNodeOnline(selectedNode) : false);
  const displayTimestamp = showAll ? null : (selectedNode ? getNodeTimestamp(selectedNode) : null);
  const staleCount = nodes.filter((n) => (n as any).connection === 'STALE').length;

  // Link detail: mode All memakai kontributor pertama (detail butuh 1 node).
  const detailNodeId = showAll
    ? (contributors[0] ? String(contributors[0].id) : null)
    : selectedNodeId;
  const goDetail = (to: string) => navigate(detailNodeId ? `${to}?node=${detailNodeId}` : to);

  // Tampilan gateway: ganti kartu+chart sensor (tidak ada datanya) dengan
  // blok network (sinyal + Wi-Fi) dalam SATU box. Node/All tidak berubah.
  const isGwView = !showAll && !!selectedNode && isGateway(selectedNode);
  const gwRssi = isGwView && typeof selectedNode?.wifi_rssi === 'number' ? (selectedNode as Node).wifi_rssi as number : null;
  // Normalisasi tampilan saja (angka asli tidak diubah): WiFi -50→100, -100→0.
  const gwSignalPct = gwRssi === null ? null : clampPct(2 * (gwRssi + 100));
  const gwRssiPct = gwRssi === null ? null : clampPct(((gwRssi + 100) / 60) * 100);
  // SNR link LoRa terakhir didengar gateway (real, dari metadata bacaan).
  // Rentang LoRa umum -20..+15 dB → 0..100 untuk bar (angka tampil asli).
  const gwSnr = isGwView && typeof selectedNode?.last_link_snr === 'number' ? (selectedNode as Node).last_link_snr as number : null;
  const gwSnrPct = gwSnr === null ? null : clampPct(((gwSnr + 20) / 35) * 100);

  const cards: { title: string; desc: string; counts: Record<NodeStatus, number>; to: string }[] = [
    { title: 'Kualitas Air', desc: 'Agregat pH & kekeruhan semua node', counts: summary.waterQuality, to: '/water-quality' },
    { title: 'Kondisi Lingkungan', desc: 'Agregat suhu & kelembapan semua node', counts: summary.environment, to: '/environment' },
    { title: 'Status Fisik & Kapasitas Tandon', desc: 'Agregat getaran, stabilitas & level air semua node', counts: summary.physical, to: '/physical' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-[1600px] mx-auto overflow-x-hidden">
      {/* ======================= DASHBOARD HEADER ======================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight border-l-4 border-blue-600 pl-3">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Overview semua node. Pilih node untuk detail, klik baris tabel untuk modal, klik kartu untuk analisis.
          </p>
          <p className="text-xs font-bold text-gray-800 dark:text-gray-100 font-mono mt-1">
            Update: {lastUpdate || (fetchStatus === 'loading' ? 'Memuat data sensor...' : 'Belum ada transmisi')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            to="/ai-analytics"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-xs hover:border-blue-400 hover:shadow-md transition group"
          >
            <span>AI: <strong className={worstAi === 'Normal' ? 'text-green-600' : worstAi === 'Warning' ? 'text-yellow-500' : 'text-red-600'}>{worstAi === 'Warning' ? 'Warning' : worstAi}</strong></span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-xs disabled:opacity-60"
            title="Segarkan Data"
            aria-label="Segarkan Data"
          >
            <RefreshCw className={`h-4 w-4 ${syncing || isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ======================= SYSTEM OVERVIEW ======================= */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Node', value: summary.total, sub: 'terdaftar', icon: Cpu, bg: 'bg-blue-600 dark:bg-blue-700' },
          { label: 'Online', value: summary.online, sub: 'terhubung', icon: Wifi, bg: 'bg-green-600 dark:bg-green-700' },
          { label: 'Warning/Anomali', value: summary.warning, sub: staleCount > 0 ? `termasuk ${staleCount} stale` : 'butuh perhatian', icon: AlertTriangle, bg: 'bg-amber-500 dark:bg-amber-600' },
          { label: 'Offline', value: summary.offline, sub: 'terputus', icon: WifiOff, bg: 'bg-red-500 dark:bg-red-600' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl ${s.bg} p-5 shadow-xs min-h-[118px] flex flex-col justify-between`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-4xl font-black font-mono text-white leading-none">{s.value}</span>
              <s.icon className="h-8 w-8 text-white/80 shrink-0" />
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-white">{s.label}</div>
              <div className="text-[11px] text-white/75">{s.sub}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ======================= STATUS ALERTS ======================= */}
      {fetchStatus === 'error' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Gagal memuat telemetri sensor</p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {fetchError || 'Koneksi ke backend sensor terputus. Pastikan server aktif.'}
              </p>
              <p className="text-[11px] font-mono text-red-500/80 dark:text-red-400/70">
                Endpoint: GET /api/nodes • periksa tab Network browser
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      {fetchStatus === 'empty' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Belum Ada Perangkat Terdaftar</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Sistem belum menemukan unit ESP32. Silakan daftarkan perangkat di menu Manajemen Perangkat.
              </p>
              <p className="text-[11px] font-mono text-amber-600/80 dark:text-amber-400/70">
                Endpoint: GET /api/nodes → 0 node (bukan data palsu)
              </p>
            </div>
          </div>
          <Link
            to="/devices"
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition shrink-0"
          >
            Buka Manajemen Perangkat →
          </Link>
        </div>
      )}

      {/* ======================= SELECTED NODE ======================= */}
      {displayReading && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3 font-mono">
              {showAll ? 'Semua Node' : getNodeCode(selectedNode)}
            </h3>
            <NodeSelector
              nodes={nodes}
              value={showAll ? 'all' : selectedNodeId}
              onChange={(id) => {
                if (id === 'all') {
                  setShowAll(true);
                } else {
                  setShowAll(false);
                  setSelectedNodeId(id);
                }
              }}
              showAllOption
              className="sm:ml-auto"
            />
          </div>

          {isGwView ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <SignalCard
                  icon={SignalHigh}
                  label="Signal Strength"
                  value={gwSignalPct === null ? '-' : `${gwSignalPct}%`}
                  pct={gwSignalPct}
                  iconBg="bg-emerald-100 dark:bg-emerald-950/60"
                  iconColor="text-emerald-600 dark:text-emerald-400"
                  cardBg="bg-[#F3FBF8] dark:bg-emerald-950/20"
                  trackBg="bg-emerald-100/70 dark:bg-emerald-950/60"
                  fillBg="bg-emerald-500"
                />
                <SignalCard
                  icon={Wifi}
                  label="RSSI"
                  value={gwRssi === null ? '-' : `${gwRssi} dBm`}
                  pct={gwRssiPct}
                  iconBg="bg-blue-100 dark:bg-blue-950/60"
                  iconColor="text-blue-600 dark:text-blue-400"
                  cardBg="bg-[#F4F8FD] dark:bg-blue-950/20"
                  trackBg="bg-blue-100/70 dark:bg-blue-950/60"
                  fillBg="bg-blue-500"
                />
                <SignalCard
                  icon={Antenna}
                  label="SNR"
                  value={gwSnr === null ? '-' : `${gwSnr} dB`}
                  pct={gwSnrPct}
                  title="SNR paket LoRa terakhir didengar gateway"
                  iconBg="bg-purple-100 dark:bg-purple-950/60"
                  iconColor="text-purple-600 dark:text-purple-400"
                  cardBg="bg-[#F8F6FD] dark:bg-purple-950/20"
                  trackBg="bg-purple-100/70 dark:bg-purple-950/60"
                  fillBg="bg-purple-500"
                />
              </div>

              <div className="rounded-xl border border-gray-200/70 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-gray-100 dark:border-gray-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60">
                    <Wifi className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </span>
                  <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Wi-Fi Details</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-gray-100 dark:divide-gray-800">
                  <div className="p-4 sm:p-5 space-y-3">
                    {[
                      { label: 'SSID', value: (selectedNode as Node)?.wifi_ssid || '-' },
                      { label: 'IP Address', value: (selectedNode as Node)?.ip_address || '-' },
                      { label: 'Channel', value: (selectedNode as Node)?.wifi_channel ?? '-' },
                    ].map((f) => (
                      <div key={f.label} className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                        <div className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{f.label}</div>
                        <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">{f.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 sm:p-5 space-y-3 border-t border-gray-100 dark:border-gray-800 sm:border-t-0">
                    {[
                      { label: 'MAC Address', value: (selectedNode as Node)?.hardware_id || '-' },
                    ].map((f) => (
                      <div key={f.label} className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                        <div className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{f.label}</div>
                        <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">{f.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
            {[
              { label: 'pH', value: fmt(displayReading.ph, 2) },
              { label: 'Temperature', value: fmt(displayReading.temp, 1, ' °C') },
              { label: 'Humidity', value: fmt(displayReading.humidity, 1, ' %') },
              { label: 'Turbidity', value: fmt(displayReading.turbidity, 1, ' NTU') },
              { label: 'Water Level', value: fmt(displayReading.water_level, 1, ' cm') },
              { label: 'Vibration', value: displayReading.vibration ? 'Terdeteksi' : 'Tidak' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{m.label}</span>
                <div className="text-lg font-black font-mono text-gray-900 dark:text-white mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>

          <div className="relative h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, fontSize: 12, border: 'none' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="ph" name="pH" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="waterLevel" name="Level (cm)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="turbidity" name="Turbidity (NTU)" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            {history.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                {historyLoading ? 'Memuat riwayat…' : historyError ? 'Gagal memuat riwayat — periksa koneksi ke server.' : 'Belum ada data riwayat untuk perangkat ini.'}
              </div>
            )}
          </div>
            </>
          )}
        </section>
      )}

      {/* ======================= 3 SUMMARY CARDS ======================= */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c) => (
          <button
            key={c.title}
            onClick={() => goDetail(c.to)}
            className="text-left rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs hover:border-blue-400 hover:shadow-md transition cursor-pointer"
          >
            <h3 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2">{c.title}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-3">{c.desc}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <CountBadge label="Normal" count={c.counts.Normal} className="bg-green-500" />
              <CountBadge label="Warning" count={c.counts.Warning} className="bg-yellow-500" />
              <CountBadge label="Bahaya" count={c.counts.Bahaya} className="bg-red-500" />
              <CountBadge label="Offline" count={c.counts.Offline} className="bg-gray-400" />
            </div>
            <span className="block mt-3 text-[11px] font-semibold text-blue-600 dark:text-blue-400">Buka analisis →</span>
          </button>
        ))}
      </section>

      {/* ======================= NODE STATUS TABLE ======================= */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Status Node
          </h3>
          <div className="flex items-center gap-3">
            <Link to="/devices" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
              Kelola di Perangkat Sensor →
            </Link>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {summary.online} online dari {summary.total} node • klik baris untuk detail satu node
        </p>
        <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3">Node</th>
                <th className="px-4 py-3">Lokasi</th>
                <th className="px-4 py-3">Kualitas Air</th>
                <th className="px-4 py-3">Lingkungan</th>
                <th className="px-4 py-3">Fisik</th>
                <th className="px-4 py-3">Tandon</th>
                <th className="px-4 py-3">Koneksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {fetchStatus === 'loading' ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Memuat data...</td></tr>
              ) : nodes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Belum ada node terdaftar.</td></tr>
              ) : (
                nodes.map((node) => {
                  const online = isNodeOnline(node);
                  const lr = getLastReading(node);
                  // Gateway penerus tidak punya sensor sendiri — tampilkan '-'
                  // (bukan "Normal" palsu). Kolom koneksi tetap apa adanya.
                  const gw = isGateway(node);
                  const gwTitle = 'Gateway penerus — tidak punya sensor sendiri';
                  const wq = !online ? 'Offline' : gw ? '-' : getWaterQualityStatus(lr);
                  const env = !online ? 'Offline' : gw ? '-' : getEnvironmentStatus(lr);
                  const phy = !online ? 'Offline' : gw ? '-' : getPhysicalStatus(lr);
                  const tank = !online ? 'Offline' : gw ? '-' : getTankWaterStatus(Number(lr.water_level)).text;
                  const isSelected = String(node.id) === selectedNodeId;
                  return (
                    <tr
                      key={node.id}
                      onClick={() => setModalNode(node)}
                      className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900 dark:text-white font-mono">{getNodeCode(node)}</div>
                        <div className="text-[11px] text-gray-400">{getNodeName(node)}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">{getNodeLocation(node)}</td>
                      <td className={`px-4 py-3 font-bold ${gw ? 'text-gray-400 dark:text-gray-500' : statusTextClass(wq)}`} title={gw ? gwTitle : undefined}>{wq}</td>
                      <td className={`px-4 py-3 font-bold ${gw ? 'text-gray-400 dark:text-gray-500' : statusTextClass(env)}`} title={gw ? gwTitle : undefined}>{env}</td>
                      <td className={`px-4 py-3 font-bold ${gw ? 'text-gray-400 dark:text-gray-500' : statusTextClass(phy)}`} title={gw ? gwTitle : undefined}>{phy}</td>
                      <td className={`px-4 py-3 font-bold ${gw ? 'text-gray-400 dark:text-gray-500' : statusTextClass(tank)}`} title={gw ? gwTitle : undefined}>{tank}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold ${online ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {online ? '● Online' : '○ Offline'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ======================= FITUR ======================= */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">Fitur</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3 pl-3">
          Akses cepat modul analitika, perangkat & pelaporan
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/ai-analytics" className="group py-1">
            <strong className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-blue-600 transition-colors">Analisis Edge AI</strong>
            <span className="text-xs text-gray-400">Diagnosis prediktif & model TinyML</span>
          </Link>
          <Link to="/devices" className="group py-1">
            <strong className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-emerald-600 transition-colors">Perangkat & Update OTA</strong>
            <span className="text-xs text-gray-400">Tambah sensor & flash firmware wireless</span>
          </Link>
          <Link to="/reports" className="group py-1">
            <strong className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-purple-600 transition-colors">Laporan & Ekspor Data</strong>
            <span className="text-xs text-gray-400">Unduh Excel, CSV, dan cetak PDF</span>
          </Link>
        </div>
      </section>

      <NodeDetailModal node={modalNode} onClose={() => setModalNode(null)} />
    </div>
  );
}
