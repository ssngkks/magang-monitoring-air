import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Plus, Wrench, X } from 'lucide-react';
import { api, DeviceItem, SensorData, SensorItem } from '../lib/api';

interface DeviceHistoryPrototypeProps {
  device: DeviceItem;
  sensors: SensorItem[];
}

// Event maintenance = penanda dalam timeline history.
// History sensor TIDAK pernah dihapus/direset oleh maintenance.
// Tahap 1: disimpan di localStorage per perangkat+sensor (tanpa backend).
interface MaintenanceEvent {
  id: string;
  tanggal: string; // YYYY-MM-DD
  waktu: string; // HH:MM
  kondisi: string;
  tindakan: string;
  hasil: string;
  teknisi: string;
  catatan: string;
  createdAt: string;
}

function storageKey(nodeId: string | number, sensorCode: string): string {
  return `maintenance:${String(nodeId)}:${sensorCode || '-'}`;
}

function loadMaintenances(nodeId: string | number, sensorCode: string): MaintenanceEvent[] {
  try {
    const raw = localStorage.getItem(storageKey(nodeId, sensorCode));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m) => m && typeof m.tanggal === 'string' && typeof m.kondisi === 'string',
    );
  } catch {
    return [];
  }
}

function saveMaintenances(nodeId: string | number, sensorCode: string, events: MaintenanceEvent[]): void {
  try {
    localStorage.setItem(storageKey(nodeId, sensorCode), JSON.stringify(events));
  } catch {
    // localStorage penuh/nonaktif: abaikan, timeline tetap tampil dari state.
  }
}

function maintenanceTime(m: MaintenanceEvent): number {
  const t = new Date(`${m.tanggal}T${m.waktu || '00:00'}:00`).getTime();
  return isNaN(t) ? 0 : t;
}

// Riwayat dibaca dari endpoint yang sudah ada (GET /nodes/{id}/sensor-data).
// sensor_data berbentuk wide-row per node, jadi satu baris dipetakan ke
// kolom sensor yang sedang dipilih (pH, turbidity, humidity, ...).
function readingField(sensorCode: string, sensorName: string): keyof SensorData {
  const hay = `${sensorCode} ${sensorName}`.toLowerCase();
  if (hay.includes('ph')) return 'ph';
  if (hay.includes('turbid') || hay.includes('keruh')) return 'turbidity';
  if (hay.includes('hum') || hay.includes('lembab')) return 'humidity';
  if (hay.includes('temp') || hay.includes('suhu')) return 'temp';
  if (hay.includes('water') || hay.includes('level') || hay.includes('ketinggian')) return 'water_level';
  if (hay.includes('vib') || hay.includes('getar')) return 'vibration';
  if (hay.includes('mpu') || hay.includes('gyro') || hay.includes('roll') || hay.includes('pitch')) return 'roll';
  return 'ph';
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function statusOf(value: number | null, sensor: SensorItem | undefined): 'Normal' | 'Warning' | 'Bahaya' {
  if (value === null || !sensor) return 'Normal';
  const cMin = sensor.critical_threshold_min ?? sensor.min_value;
  const cMax = sensor.critical_threshold_max ?? sensor.max_value;
  const wMin = sensor.warning_threshold_min;
  const wMax = sensor.warning_threshold_max;
  if ((cMin !== undefined && cMin !== null && value < cMin) || (cMax !== undefined && cMax !== null && value > cMax)) {
    return 'Bahaya';
  }
  if ((wMin !== undefined && wMin !== null && value < wMin) || (wMax !== undefined && wMax !== null && value > wMax)) {
    return 'Warning';
  }
  return 'Normal';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
  });
}

function fmtShort(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type TimelineItem =
  | { kind: 'reading'; time: number; reading: SensorData }
  | { kind: 'maintenance'; time: number; event: MaintenanceEvent };

export function DeviceHistoryPrototype({ device, sensors }: DeviceHistoryPrototypeProps) {
  const [readings, setReadings] = useState<SensorData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSensorCode, setSelectedSensorCode] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [maintenances, setMaintenances] = useState<MaintenanceEvent[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [mSensorCode, setMSensorCode] = useState('');
  const [mDate, setMDate] = useState(todayStr());
  const [mTime, setMTime] = useState(nowHM());
  const [mKondisi, setMKondisi] = useState('');
  const [mTindakan, setMTindakan] = useState('');
  const [mHasil, setMHasil] = useState('');
  const [mTeknisi, setMTeknisi] = useState('');
  const [mCatatan, setMCatatan] = useState('');

  useEffect(() => {
    setSelectedSensorCode('');
    setStartDate('');
    setEndDate('');
    let cancelled = false;
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const res = await api.sensorData(device.id, 'per_page=200');
        const rows = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        if (!cancelled) setReadings(rows);
      } catch {
        if (!cancelled) setReadings([]);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [device.id]);

  // Prefill nama teknisi dari user yang sedang login (GET /me).
  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((res) => {
        if (!cancelled && res?.data?.name) setMTeknisi(res.data.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSensor = useMemo<SensorItem | undefined>(() => {
    if (sensors.length === 0) return undefined;
    return sensors.find((s) => String(s.code) === selectedSensorCode) || sensors[0];
  }, [sensors, selectedSensorCode]);

  const activeCode = activeSensor ? String(activeSensor.code) : '';

  // Muat maintenance dari localStorage setiap ganti perangkat/sensor.
  useEffect(() => {
    setMaintenances(loadMaintenances(device.id, activeCode));
  }, [device.id, activeCode]);

  const field = useMemo(
    () => readingField(activeSensor?.code || '', activeSensor?.name || ''),
    [activeSensor]
  );

  const filtered = useMemo(() => {
    return readings
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .filter((r) => {
        if (!r.created_at) return true;
        const day = r.created_at.slice(0, 10);
        if (startDate && day < startDate) return false;
        if (endDate && day > endDate) return false;
        return true;
      });
  }, [readings, startDate, endDate]);

  const filteredMaintenances = useMemo(() => {
    return maintenances
      .slice()
      .sort((a, b) => maintenanceTime(a) - maintenanceTime(b))
      .filter((m) => {
        if (startDate && m.tanggal < startDate) return false;
        if (endDate && m.tanggal > endDate) return false;
        return true;
      });
  }, [maintenances, startDate, endDate]);

  // Timeline gabungan: data sensor + event maintenance dalam satu urutan waktu.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...filtered.map((r) => ({
        kind: 'reading' as const,
        time: r.created_at ? new Date(r.created_at).getTime() : 0,
        reading: r,
      })),
      ...filteredMaintenances.map((m) => ({
        kind: 'maintenance' as const,
        time: maintenanceTime(m),
        event: m,
      })),
    ];
    items.sort((a, b) => a.time - b.time);
    return items.slice(-40);
  }, [filtered, filteredMaintenances]);

  // Nilai sensor terdekat sebelum & sesudah sebuah maintenance.
  const surrounding = (time: number): { before: number | null; after: number | null } => {
    let before: number | null = null;
    let after: number | null = null;
    for (const r of filtered) {
      const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
      if (isNaN(t)) continue;
      if (t <= time) before = toNumber((r as unknown as Record<string, unknown>)[field]);
      if (t >= time && after === null) after = toNumber((r as unknown as Record<string, unknown>)[field]);
    }
    return { before, after };
  };

  const chartPoints = useMemo(
    () =>
      filtered
        .map((r) => ({
          time: r.created_at ? fmtShort(r.created_at) : '-',
          value: toNumber((r as unknown as Record<string, unknown>)[field]),
        }))
        .filter((p) => p.value !== null),
    [filtered, field]
  );

  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : null;
  const latestValue = latest ? toNumber((latest as unknown as Record<string, unknown>)[field]) : null;
  const latestStatus = statusOf(latestValue, activeSensor);
  const statusClass =
    latestStatus === 'Bahaya'
      ? 'text-red-600 dark:text-red-400'
      : latestStatus === 'Warning'
        ? 'text-yellow-500 dark:text-yellow-400'
        : 'text-green-600 dark:text-green-400';

  const displayValue = (v: number | null): string => {
    if (v === null) return '-';
    if (field === 'vibration') return v ? 'Terdeteksi' : 'Normal';
    return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  };

  const openForm = (): void => {
    setFormError('');
    setMSensorCode(activeCode);
    setMDate(todayStr());
    setMTime(nowHM());
    setIsFormOpen(true);
  };

  const saveMaintenance = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!mDate) {
      setFormError('Tanggal maintenance wajib diisi.');
      return;
    }
    if (!mKondisi.trim()) {
      setFormError('Kondisi / kerusakan yang ditemukan wajib diisi manual oleh petugas.');
      return;
    }
    const targetCode = mSensorCode || activeCode;
    const event: MaintenanceEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tanggal: mDate,
      waktu: mTime || '00:00',
      kondisi: mKondisi.trim(),
      tindakan: mTindakan.trim(),
      hasil: mHasil.trim(),
      teknisi: mTeknisi.trim(),
      catatan: mCatatan.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [...loadMaintenances(device.id, targetCode), event].sort(
      (a, b) => maintenanceTime(a) - maintenanceTime(b),
    );
    saveMaintenances(device.id, targetCode, next);
    if (targetCode === activeCode) setMaintenances(next);
    setMKondisi('');
    setMTindakan('');
    setMHasil('');
    setMCatatan('');
    setFormError('');
    setIsFormOpen(false);
  };

  const deleteMaintenance = (id: string): void => {
    if (!window.confirm('Hapus catatan maintenance ini dari preview? History sensor tidak ikut terhapus.')) return;
    const next = maintenances.filter((m) => m.id !== id);
    saveMaintenances(device.id, activeCode, next);
    setMaintenances(next);
  };

  return (
    <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
          History Monitoring
        </h4>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Riwayat pembacaan sensor perangkat ini dari waktu ke waktu. History lama tetap tersimpan walaupun sensor dilakukan maintenance.
      </p>

      {/* Info perangkat & sensor */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3 text-xs mb-4">
        <div>
          <span className="block text-gray-400">Nama perangkat</span>
          <span className="font-bold text-gray-900 dark:text-white">{device.device_name || device.kode_node}</span>
        </div>
        <div>
          <span className="block text-gray-400">Nama sensor</span>
          <span className="font-bold text-gray-900 dark:text-white">{activeSensor?.name || '-'}</span>
        </div>
        <div>
          <span className="block text-gray-400">Nilai terbaru</span>
          <span className="font-bold font-mono text-gray-900 dark:text-white">
            {displayValue(latestValue)}{activeSensor?.unit ? ` ${activeSensor.unit}` : ''}
          </span>
        </div>
        <div>
          <span className="block text-gray-400">Status</span>
          <span className={`font-bold ${statusClass}`}>{latestStatus}</span>
        </div>
        <div>
          <span className="block text-gray-400">Terakhir update</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            {latest?.created_at ? fmtShort(latest.created_at) : '-'}
          </span>
        </div>
      </div>

      {/* Filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4 text-xs">
        <div>
          <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1">Perangkat</label>
          <input
            type="text"
            readOnly
            value={device.kode_node}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 font-mono text-gray-600 dark:text-gray-300"
          />
        </div>
        <div>
          <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1">Sensor</label>
          <select
            value={activeSensor ? String(activeSensor.code) : ''}
            onChange={(e) => setSelectedSensorCode(e.target.value)}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200"
          >
            {sensors.map((s) => (
              <option key={s.id} value={String(s.code)}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1">Tanggal mulai</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1">Tanggal akhir</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>

      {/* Grafik */}
      <div className="h-52 w-full mb-4">
        {loadingHistory ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">Memuat riwayat...</div>
        ) : chartPoints.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">
            Belum ada data history untuk sensor ini.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={32} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, fontSize: 12, border: 'none' }}
              />
              <Line type="monotone" dataKey="value" name={activeSensor?.unit || 'Nilai'} stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800 max-h-[320px] overflow-y-auto mb-5">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2.5">Tanggal</th>
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Nilai</th>
              <th className="px-4 py-2.5">Satuan</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {loadingHistory ? 'Memuat data...' : 'Belum ada data history untuk sensor ini.'}
                </td>
              </tr>
            ) : (
              filtered.slice(-20).reverse().map((r) => {
                const v = toNumber((r as unknown as Record<string, unknown>)[field]);
                const st = statusOf(v, activeSensor);
                return (
                  <tr key={r.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {fmtDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {fmtTime(r.created_at, true)}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-900 dark:text-white">
                      {displayValue(v)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                      {activeSensor?.unit || '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-bold ${st === 'Bahaya' ? 'text-red-600 dark:text-red-400' : st === 'Warning' ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                        {st}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Riwayat Maintenance sebagai event dalam timeline history */}
      <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h5 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Riwayat Maintenance — Sensor {activeSensor?.name || '-'}
          </h5>
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Catat Maintenance
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
          Maintenance hanya menjadi penanda dalam history — data sebelum maintenance tetap tersimpan dan data sesudahnya menjadi kelanjutan.
        </p>

        {filteredMaintenances.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
            Belum ada riwayat maintenance untuk sensor ini. Klik “Catat Maintenance” untuk mencatat temuan petugas.
          </p>
        ) : (
          <div className="space-y-0">
            {filteredMaintenances.map((m, i) => {
              const { before, after } = surrounding(maintenanceTime(m));
              const unit = activeSensor?.unit ? ` ${activeSensor.unit}` : '';
              return (
                <div key={m.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0 ring-4 ring-amber-100 dark:ring-amber-950" />
                    {i < filteredMaintenances.length - 1 && <span className="w-px flex-1 bg-amber-200 dark:bg-amber-900/60" />}
                  </div>
                  <div className={`flex-1 rounded-xl border border-amber-200/70 dark:border-amber-900/40 bg-white dark:bg-gray-900 p-3 ${i < filteredMaintenances.length - 1 ? 'mb-3' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">
                          🔧 MAINTENANCE — {fmtDate(`${m.tanggal}T00:00:00`)} • {m.waktu}
                        </p>
                        <p className="text-[11px] font-mono text-gray-500">
                          Sebelum: {displayValue(before)}{before !== null ? unit : ''} → Sesudah: {displayValue(after)}{after !== null ? unit : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteMaintenance(m.id)}
                        className="text-[11px] text-gray-400 hover:text-red-600 transition-colors cursor-pointer shrink-0"
                        title="Hapus catatan ini (preview lokal)"
                      >
                        Hapus
                      </button>
                    </div>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div>
                        <dt className="font-semibold text-gray-700 dark:text-gray-300">Kerusakan / kondisi ditemukan:</dt>
                        <dd className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{m.kondisi}</dd>
                      </div>
                      {m.tindakan && (
                        <div>
                          <dt className="font-semibold text-gray-700 dark:text-gray-300">Tindakan / perbaikan:</dt>
                          <dd className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{m.tindakan}</dd>
                        </div>
                      )}
                      {m.hasil && (
                        <div>
                          <dt className="font-semibold text-gray-700 dark:text-gray-300">Hasil setelah maintenance:</dt>
                          <dd className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{m.hasil}</dd>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
                        {m.teknisi ? `Teknisi: ${m.teknisi}` : 'Teknisi: -'}{m.catatan ? ` • Catatan: ${m.catatan}` : ''}
                      </p>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeline gabungan: sebelum → maintenance → sesudah */}
      <div className="mb-1">
        <h5 className="text-xs font-bold text-gray-900 dark:text-white mb-2">
          Timeline History {timeline.some((t) => t.kind === 'maintenance') ? '(sebelum → maintenance → sesudah)' : ''}
        </h5>
        {timeline.length === 0 ? (
          <p className="text-xs text-gray-500 py-2">Belum ada data history untuk sensor ini.</p>
        ) : (
          <div className="space-y-0 max-h-[320px] overflow-y-auto pr-1">
            {timeline.slice().reverse().map((item, idx) => {
              if (item.kind === 'maintenance') {
                const m = item.event;
                return (
                  <div key={`m-${m.id}-${idx}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                      {idx < timeline.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />}
                    </div>
                    <div className={idx < timeline.length - 1 ? 'pb-3 flex-1' : 'flex-1'}>
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                        {fmtDate(`${m.tanggal}T00:00:00`)} • {m.waktu} — 🔧 MAINTENANCE
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{m.kondisi}</p>
                    </div>
                  </div>
                );
              }
              const r = item.reading;
              const v = toNumber((r as unknown as Record<string, unknown>)[field]);
              const st = statusOf(v, activeSensor);
              return (
                <div key={`r-${r.id}-${idx}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                    {idx < timeline.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />}
                  </div>
                  <div className={idx < timeline.length - 1 ? 'pb-3' : ''}>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      {r.created_at ? fmtShort(r.created_at) : '-'} — {displayValue(v)}{activeSensor?.unit ? ` ${activeSensor.unit}` : ''}
                    </p>
                    <p className={`text-[11px] font-semibold ${st === 'Bahaya' ? 'text-red-600 dark:text-red-400' : st === 'Warning' ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                      {st}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form input maintenance */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsFormOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1 pr-8">
              Catat Maintenance Sensor
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              History sensor tidak dihapus — catatan ini hanya menjadi penanda dalam timeline.
            </p>

            <form onSubmit={saveMaintenance} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Perangkat</label>
                  <input
                    type="text"
                    readOnly
                    value={device.kode_node}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-2.5 font-mono text-gray-600 dark:text-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Sensor</label>
                  <select
                    value={mSensorCode || activeCode}
                    onChange={(e) => setMSensorCode(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {sensors.map((s) => (
                      <option key={s.id} value={String(s.code)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Tanggal Maintenance *</label>
                  <input
                    type="date"
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Waktu</label>
                  <input
                    type="time"
                    value={mTime}
                    onChange={(e) => setMTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Kondisi / Kerusakan yang Ditemukan *</label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Pembacaan sensor pH tidak stabil dan nilai sering meloncat."
                  value={mKondisi}
                  onChange={(e) => setMKondisi(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Tindakan / Perbaikan</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Sensor dibersihkan dan dilakukan kalibrasi ulang."
                  value={mTindakan}
                  onChange={(e) => setMTindakan(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Hasil Setelah Maintenance</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Pembacaan kembali stabil."
                  value={mHasil}
                  onChange={(e) => setMHasil(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Teknisi / Petugas</label>
                <input
                  type="text"
                  placeholder="Nama teknisi"
                  value={mTeknisi}
                  onChange={(e) => setMTeknisi(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Perlu pengecekan ulang dalam 7 hari."
                  value={mCatatan}
                  onChange={(e) => setMCatatan(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {formError && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold cursor-pointer shadow-md shadow-amber-500/20"
                >
                  Simpan Maintenance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
