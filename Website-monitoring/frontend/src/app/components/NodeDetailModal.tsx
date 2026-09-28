import { useEffect, useState } from 'react';
import { X, Cpu } from 'lucide-react';
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
import { api, Node } from '../lib/api';
import {
  getLastReading,
  getWaterQualityStatus,
  getEnvironmentStatus,
  getPhysicalStatus,
  getTankWaterStatus,
  getNodeOverallStatus,
  getNodeCode,
  getNodeName,
  getNodeLocation,
  isNodeOnline,
  statusTextClass,
} from '../lib/nodes';

interface NodeDetailModalProps {
  node: Node | null;
  onClose: () => void;
}

function fmt(v: unknown, digits = 1, suffix = ''): string {
  if (v === undefined || v === null || v === '') return '-';
  const n = Number(v);
  if (isNaN(n)) return '-';
  return `${n.toFixed(digits)}${suffix}`;
}

function Row({ label, value, statusClass }: { label: string; value: string; statusClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-b border-gray-50 dark:border-gray-800/60 last:border-0">
      <span className="text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className={`font-bold font-mono ${statusClass ?? 'text-gray-900 dark:text-white'}`}>{value}</span>
    </div>
  );
}

export function NodeDetailModal({ node, onClose }: NodeDetailModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await api.sensorData(String(node.id), 'range=today&downsample=100');
        const readings = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        if (cancelled) return;
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
                turbidity: r.turbidity !== null && r.turbidity !== undefined ? Number(r.turbidity) : null,
                temp: r.temp !== null && r.temp !== undefined ? Number(r.temp) : null,
                waterLevel: r.water_level !== null && r.water_level !== undefined ? Number(r.water_level) : null,
              };
            })
        );
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [node]);

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onClose]);

  if (!node) return null;

  const lr = getLastReading(node);
  const online = isNodeOnline(node);
  const overall = getNodeOverallStatus(node);
  const wq = online ? getWaterQualityStatus(lr) : 'Offline';
  const env = online ? getEnvironmentStatus(lr) : 'Offline';
  const phy = online ? getPhysicalStatus(lr) : 'Offline';
  const tank = online ? getTankWaterStatus(Number(lr.water_level)).text : 'Offline';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 dark:text-white font-mono">{getNodeCode(node)}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {getNodeName(node)} • {getNodeLocation(node)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-bold ${online ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
              {online ? '● Online' : '○ Offline'}
            </span>
            <span className={`text-xs font-bold ${statusTextClass(overall)}`}>{overall}</span>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Info perangkat */}
          <section>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2 mb-1">
              Info Perangkat
            </h4>
            <Row label="Kode Node" value={getNodeCode(node)} />
            <Row label="Device Name" value={String((node as any).device_name ?? '-')} />
            <Row label="Lokasi" value={getNodeLocation(node)} />
            <Row label="Status" value={online ? 'Online' : 'Offline'} statusClass={online ? 'text-green-600 dark:text-green-400' : undefined} />
            <Row label="Last Seen" value={(() => { const t = (node as any).last_seen_at; if (!t) return '-'; const d = new Date(t); return isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID'); })()} />
            <Row label="Firmware" value={String((node as any).firmware_version ?? '-')} />
            <Row label="Model" value={String((node as any).model_type ?? '-')} />
            <Row label="Role" value={String((node as any).device_role ?? '-')} />
            <Row label="IP Address" value={String((node as any).ip_address ?? '-')} />
            <Row label="Hardware ID" value={String((node as any).hardware_id ?? '-')} />
          </section>

          {/* Kualitas Air */}
          <section>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2 mb-1">
              Kualitas Air <span className={`ml-1 text-xs ${statusTextClass(wq)}`}>{wq}</span>
            </h4>
            <Row label="pH" value={fmt(lr.ph, 2)} />
            <Row label="Turbidity" value={fmt(lr.turbidity, 1, ' NTU')} />
          </section>

          {/* Lingkungan */}
          <section>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2 mb-1">
              Lingkungan <span className={`ml-1 text-xs ${statusTextClass(env)}`}>{env}</span>
            </h4>
            <Row label="Temperature" value={fmt(lr.temp, 1, ' °C')} />
            <Row label="Humidity" value={fmt(lr.humidity, 1, ' %')} />
          </section>

          {/* Fisik */}
          <section>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2 mb-1">
              Fisik <span className={`ml-1 text-xs ${statusTextClass(phy)}`}>{phy}</span>
              <span className={`ml-2 text-xs font-medium ${statusTextClass(tank)}`}>Tandon: {tank}</span>
            </h4>
            <Row label="Water level" value={fmt(lr.water_level, 1, ' cm')} />
            <Row
              label="Vibration"
              value={lr.vibration ? 'Terdeteksi' : 'Tidak'}
              statusClass={lr.vibration ? 'text-yellow-500' : 'text-green-600 dark:text-green-400'}
            />
            <Row label="Roll" value={fmt(lr.roll, 1, '°')} />
            <Row label="Pitch" value={fmt(lr.pitch, 1, '°')} />
            <Row label="Stabilitas" value={String(lr.stability_status ?? '-')} />
          </section>

          {/* History chart */}
          <section>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2 mb-2">
              Riwayat Hari Ini
            </h4>
            <div className="relative h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={32} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, fontSize: 12, border: 'none' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ph" name="pH" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="temp" name="Suhu (°C)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="waterLevel" name="Level (cm)" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              {history.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                  {loading ? 'Memuat riwayat...' : 'Belum ada riwayat hari ini.'}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
