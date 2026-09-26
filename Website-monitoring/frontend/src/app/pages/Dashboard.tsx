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
  Bell,
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
  getNodeCode,
  getNodeName,
  getNodeLocation,
  statusTextClass,
  NodeStatus,
} from '../lib/nodes';
import { useNode } from '../context/NodeContext';
import { NodeSelector } from '../components/NodeSelector';
import { NodeDetailModal } from '../components/NodeDetailModal';
import { useLanguage } from '../context/LanguageContext';

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

export function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const {
    nodes,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    summary,
    alertsUnread,
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
  useEffect(() => {
    if (!selectedNodeId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        setHistoryLoading(true);
        const res = await api.sensorData(String(selectedNodeId), 'range=today&downsample=100');
        if (cancelled) return;
        const readings = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        setHistory(
          readings
            .slice()
            .reverse()
            .map((r: any) => {
              const d = r.created_at ? new Date(r.created_at) : new Date();
              return {
                time: isNaN(d.getTime())
                  ? '-'
                  : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                ph: r.ph !== null && r.ph !== undefined ? Number(r.ph) : null,
                waterLevel: r.water_level !== null && r.water_level !== undefined ? Number(r.water_level) : null,
              };
            })
        );
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    fetchHistory();
    const timer = setInterval(fetchHistory, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedNodeId]);

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

  const selReading = selectedNode ? getLastReading(selectedNode) : null;
  const selOnline = selectedNode ? isNodeOnline(selectedNode) : false;
  const selTimestamp = selectedNode ? getNodeTimestamp(selectedNode) : null;
  const staleCount = nodes.filter((n) => (n as any).connection === 'STALE').length;

  const goDetail = (to: string) => navigate(selectedNodeId ? `${to}?node=${selectedNodeId}` : to);

  const cards: { title: string; desc: string; counts: Record<NodeStatus, number>; to: string }[] = [
    { title: 'Kualitas Air', desc: 'Agregat pH & kekeruhan semua node', counts: summary.waterQuality, to: '/water-quality' },
    { title: 'Kondisi Lingkungan', desc: 'Agregat suhu & kelembapan semua node', counts: summary.environment, to: '/environment' },
    { title: 'Status Fisik', desc: 'Agregat getaran & stabilitas semua node', counts: summary.physical, to: '/physical' },
    { title: 'Kapasitas Tandon', desc: 'Agregat level air semua tandon', counts: summary.tank, to: '/physical' },
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
            onClick={refresh}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-xs"
            title="Segarkan Data"
            aria-label="Segarkan Data"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ======================= NODE AKTIF ======================= */}
      <section className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Node Aktif</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Semua detail Dashboard mengikuti node ini. Ganti node untuk melihat data node lain.
            </p>
          </div>
          <NodeSelector nodes={nodes} value={selectedNodeId} onChange={setSelectedNodeId} className="sm:ml-auto" />
        </div>
        {selectedNode && (
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
            {getNodeCode(selectedNode)} • {getNodeName(selectedNode)} • {getNodeLocation(selectedNode)} •{' '}
            {selOnline ? 'Online' : 'Offline'}
          </p>
        )}
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

      {/* ======================= SYSTEM OVERVIEW ======================= */}
      <section className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          { label: 'Total Node', value: summary.total, sub: 'terdaftar', icon: Cpu, cls: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/50' },
          { label: 'Online', value: summary.online, sub: 'terhubung', icon: Wifi, cls: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/50' },
          { label: 'Warning/Anomali', value: summary.warning, sub: staleCount > 0 ? `termasuk ${staleCount} stale` : 'butuh perhatian', icon: AlertTriangle, cls: 'text-yellow-500 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/50' },
          { label: 'Offline', value: summary.offline, sub: 'terputus', icon: WifiOff, cls: 'text-gray-400 dark:text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
          { label: 'Active Alerts', value: alertsUnread, sub: 'belum dibaca', icon: Bell, cls: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/50' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.cls}`} />
              </span>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{s.label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-gray-900 dark:text-white">{s.value}</span>
              <span className="text-[11px] text-gray-400">{s.sub}</span>
            </div>
          </div>
        ))}
      </section>

      {/* ======================= SELECTED NODE ======================= */}
      {selectedNode && selReading && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3 font-mono">
              {getNodeCode(selectedNode)}
              <span className={`ml-2 text-xs font-sans ${statusTextClass(getNodeOverallStatus(selectedNode))}`}>
                {getNodeOverallStatus(selectedNode)}
              </span>
            </h3>
            <span className="text-[11px] text-gray-400">
              {getNodeName(selectedNode)} • {getNodeLocation(selectedNode)} • Last seen: {fmtTime(selTimestamp)}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Lokasi: {getNodeLocation(selectedNode)} • Sektor: {(selectedNode as any).sector ?? (selectedNode as any).location_name ?? '-'} •{' '}
            Koneksi: {(selectedNode as any).connection ?? (selOnline ? 'ONLINE' : 'OFFLINE')}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
            {[
              { label: 'pH', value: fmt(selReading.ph, 2) },
              { label: 'Temperature', value: fmt(selReading.temp, 1, ' °C') },
              { label: 'Humidity', value: fmt(selReading.humidity, 1, ' %') },
              { label: 'Turbidity', value: fmt(selReading.turbidity, 1, ' NTU') },
              { label: 'Water Level', value: fmt(selReading.water_level, 1, ' cm') },
              { label: 'Vibration', value: selReading.vibration ? 'Terdeteksi' : 'Tidak' },
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
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, fontSize: 12, border: 'none' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ph" name="pH" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="waterLevel" name="Level (cm)" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            {history.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                {historyLoading ? 'Memuat riwayat…' : 'Belum ada riwayat hari ini.'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ======================= 4 SUMMARY CARDS ======================= */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
            <Link to="/nodes" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
              Monitoring Nodes →
            </Link>
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
                  const wq = online ? getWaterQualityStatus(lr) : 'Offline';
                  const env = online ? getEnvironmentStatus(lr) : 'Offline';
                  const phy = online ? getPhysicalStatus(lr) : 'Offline';
                  const tank = online ? getTankWaterStatus(Number(lr.water_level)).text : 'Offline';
                  const overall = getNodeOverallStatus(node);
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
                      <td className={`px-4 py-3 font-bold ${statusTextClass(wq)}`}>{wq}</td>
                      <td className={`px-4 py-3 font-bold ${statusTextClass(env)}`}>{env}</td>
                      <td className={`px-4 py-3 font-bold ${statusTextClass(phy)}`}>{phy}</td>
                      <td className={`px-4 py-3 font-bold ${statusTextClass(tank)}`}>{tank}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold ${online ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {online ? '● Online' : '○ Offline'}
                        </span>
                        <span className={`block text-[10px] font-semibold ${statusTextClass(overall)}`}>
                          {overall === 'Offline' ? t.common.notConnected : overall}
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
