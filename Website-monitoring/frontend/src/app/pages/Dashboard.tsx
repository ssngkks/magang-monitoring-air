import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  Wind,
  ChevronRight,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { api, SensorItem } from '../lib/api';
import { DeviceData } from '../components/SensorStatus';
import { useLanguage } from '../context/LanguageContext';
import { DynamicSensorCard } from '../components/DynamicSensorCard';

export function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const [lastSensorTime, setLastSensorTime] = useState<string>('');
  const [lastSensorDate, setLastSensorDate] = useState<string>('');
  const [aiStatus, setAiStatus] = useState<string>('Normal');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'success' | 'empty' | 'error'>('loading');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Live Metrics
  const [metrics, setMetrics] = useState({
    ph: 7.2,
    temperature: 27.5,
    humidity: 65.0,
    turbidity: 4,
    waterLevel: 82.5,
    vibration: false,
    mpuX: 0.01,
    mpuY: -0.01,
    mpuZ: 0.99,
    roll: 0.8,
    pitch: -0.4,
    yaw: 0.0,
    stabilityStatus: 'Stabil',
  });

  const [device, setDevice] = useState<DeviceData | null>(null);
  const [dynamicSensors, setDynamicSensors] = useState<SensorItem[]>([]);
  const [primaryNodeId, setPrimaryNodeId] = useState<string | number | null>(null);

  // Fetch Live Data
  const loadSensorData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setFetchError(null);
      const { data: nodes } = await api.nodes();
      if (!nodes || !nodes.length) {
        setFetchStatus('empty');
        setHasLoaded(true);
        setIsRefreshing(false);
        setLastSensorTime('Belum ada perangkat');
        setLastSensorDate('');
        return;
      }

      const primaryNode = nodes[0];
      setPrimaryNodeId(primaryNode.id);
      const lr = (primaryNode as any).last_reading || {};

      // Fallback timestamp logic (Tugas 2d): last_seen_at -> lr.created_at -> updated_at
      const rawTimestamp = primaryNode.last_seen_at || lr.created_at || (primaryNode as any).updated_at;
      if (rawTimestamp) {
        const d = new Date(rawTimestamp);
        if (!isNaN(d.getTime())) {
          setLastSensorTime(d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
          setLastSensorDate(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
        } else {
          setLastSensorTime(String(rawTimestamp));
          setLastSensorDate('');
        }
      } else {
        setLastSensorTime(primaryNode.is_online ? 'Sedang online' : 'Belum ada transmisi (Offline)');
        setLastSensorDate('');
      }

      // Map Device
      const mappedDevice: DeviceData = {
        id: String(primaryNode.id),
        kode_node: primaryNode.kode_node || 'ESP32-WATER-01',
        name: (primaryNode as any).device_name || 'Unit Sensor ESP32 Utama',
        location: primaryNode.nama_lokasi || 'Titik Pantau Sensor Utama',
        status: primaryNode.is_online ? 'online' : 'offline',
        lastUpdate: rawTimestamp
          ? new Date(rawTimestamp).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }) + ' WIB'
          : t.common.notConnected,
        rssi: (primaryNode as any).rssi ?? null,
        snr: (primaryNode as any).snr ?? null,
        metrics: {
          ph: lr.ph !== undefined && lr.ph !== null ? Number(lr.ph) : null,
          temperature: lr.temp !== undefined && lr.temp !== null ? Number(lr.temp) : null,
          humidity: lr.humidity !== undefined && lr.humidity !== null ? Number(lr.humidity) : null,
          turbidity: lr.turbidity !== undefined && lr.turbidity !== null ? Number(lr.turbidity) : null,
          waterLevel: lr.water_level !== undefined && lr.water_level !== null ? Number(lr.water_level) : null,
          vibration: lr.vibration !== undefined && lr.vibration !== null ? Boolean(lr.vibration) : null,
          mpuX: lr.mpu_x !== undefined && lr.mpu_x !== null ? Number(lr.mpu_x) : null,
          mpuY: lr.mpu_y !== undefined && lr.mpu_y !== null ? Number(lr.mpu_y) : null,
          mpuZ: lr.mpu_z !== undefined && lr.mpu_z !== null ? Number(lr.mpu_z) : null,
          roll: lr.roll !== undefined && lr.roll !== null ? Number(lr.roll) : null,
          pitch: lr.pitch !== undefined && lr.pitch !== null ? Number(lr.pitch) : null,
          yaw: lr.yaw !== undefined && lr.yaw !== null ? Number(lr.yaw) : null,
          stabilityStatus: lr.stability_status || 'Stabil',
        },
      };
      setDevice(mappedDevice);

      // Fetch dynamic sensors
      try {
        const sensorsRes = await api.deviceSensors(primaryNode.id);
        if (sensorsRes.data && Array.isArray(sensorsRes.data)) {
          setDynamicSensors(sensorsRes.data.filter((s: SensorItem) => s.is_active));
        }
      } catch (e) {
        // dynamic sensors optional
      }

      setMetrics({
        ph: Number(lr.ph ?? 7.2),
        temperature: Number(lr.temp ?? 27.5),
        humidity: Number(lr.humidity ?? 65.0),
        turbidity: Number(lr.turbidity ?? 4),
        waterLevel: Number(lr.water_level ?? 82.5),
        vibration: Boolean(lr.vibration ?? false),
        mpuX: Number(lr.mpu_x ?? 0.01),
        mpuY: Number(lr.mpu_y ?? -0.01),
        mpuZ: Number(lr.mpu_z ?? 0.99),
        roll: Number(lr.roll ?? 0.8),
        pitch: Number(lr.pitch ?? -0.4),
        yaw: Number(lr.yaw ?? 0.0),
        stabilityStatus: lr.stability_status || 'Stabil',
      });
      setAiStatus(lr.ai_status || 'Normal');
      setFetchStatus('success');
    } catch (error: any) {
      console.error('Gagal memuat data sensor dashboard:', error);
      setFetchError(error.message || 'Gagal menghubungi server sensor monitoring.');
      setFetchStatus('error');
    } finally {
      setHasLoaded(true);
      setIsRefreshing(false);
    }
  }, [t.common.notConnected]);

  useEffect(() => {
    loadSensorData();
    const timer = setInterval(loadSensorData, 8000);
    return () => clearInterval(timer);
  }, [loadSensorData]);

  // Evaluasi Box 1: Kualitas Air (pH & Kekeruhan)
  const isPhNormal = metrics.ph >= 6.5 && metrics.ph <= 8.5;
  const isTurbNormal = metrics.turbidity <= 5;
  const waterQualityGood = isPhNormal && isTurbNormal;

  // Evaluasi Box 2: Lingkungan (Suhu & Kelembapan)
  const isTempNormal = metrics.temperature >= 22 && metrics.temperature <= 32;
  const isHumNormal = metrics.humidity >= 40 && metrics.humidity <= 75;
  const environmentGood = isTempNormal && isHumNormal;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 w-full max-w-[1600px] mx-auto overflow-x-hidden">
      {/* ======================= DASHBOARD HEADER ======================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl 2xl:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight border-l-4 border-blue-600 pl-3">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Tinjauan cepat parameter tandon air. Klik pada kartu untuk membuka analisis mendalam dan grafik historis.
          </p>
          <p className="text-xs font-bold text-gray-800 dark:text-gray-100 font-mono mt-1">
            Update: {lastSensorTime || (fetchStatus === 'loading' ? 'Memuat data sensor...' : 'Belum ada transmisi')}{lastSensorDate ? ` • ${lastSensorDate}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Edge AI Badge (ikon dihapus, hanya teks status) */}
          <Link
            to="/ai-analytics"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-xs hover:border-blue-400 hover:shadow-md transition group"
          >
            <span>AI: <strong className={aiStatus === 'Normal' ? 'text-green-600' : aiStatus === 'Anomali' ? 'text-yellow-500' : 'text-red-600'}>{aiStatus === 'Anomali' ? 'Warning' : aiStatus === 'Bahaya' ? 'Bahaya' : 'Normal'}</strong></span>
            <ChevronRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Tombol refresh ikon-only, berputar saat memuat */}
          <button
            onClick={loadSensorData}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-xs"
            title="Segarkan Data"
            aria-label="Segarkan Data"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ======================= STATUS ALERTS (Error & Empty States) ======================= */}
      {fetchStatus === 'error' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 shadow-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Gagal memuat telemetri sensor</p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {fetchError || 'Koneksi ke backend sensor terputus. Pastikan server aktif.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadSensorData}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
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

      {/* ======================= THE TWO MAIN FEATURED BOXES ======================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===================== BOX 1: KUALITAS AIR (pH & KEKERUHAN) ===================== */}
        <div
          onClick={() => navigate('/water-quality')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/water-quality')}
          className="group relative rounded-3xl p-7 bg-gradient-to-br from-white via-white to-blue-50/40 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/20 border-2 border-gray-200/80 dark:border-gray-800 shadow-sm hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
        >
          {/* Header Kartu (ikon dihapus sesuai revisi) */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors border-l-4 border-blue-600 pl-3">
                    Kualitas Air
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Kombinasi sensor pH-4502C & Optik Kekeruhan
                  </p>
                </div>
              </div>

              {/* Status teks saja: Normal / Warning / Bahaya */}
              <span
                className={`text-xs font-bold ${
                  waterQualityGood
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-yellow-500 dark:text-yellow-400'
                }`}
              >
                {waterQualityGood ? 'Normal' : 'Warning'}
              </span>
            </div>

            {/* Split Tampilan 2 Sensor: pH (Kiri) & Kekeruhan (Kanan) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
              {/* Sisi Kiri: pH Air */}
              <div className="sm:border-r border-gray-200 dark:border-gray-700 sm:pr-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">pH Air</span>
                  <span className={`text-[11px] font-bold ${isPhNormal ? 'text-green-600' : 'text-red-600'}`}>
                    {isPhNormal ? 'Normal' : 'Bahaya'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 my-1">
                  <span className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                    {metrics.ph.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">pH</span>
                </div>
                {/* Visual Bar pH */}
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isPhNormal ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(Math.max((metrics.ph / 14) * 100, 5), 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-1">Target: 6.5 – 8.5 pH</span>
              </div>

              {/* Sisi Kanan: Kekeruhan */}
              <div className="sm:pl-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Kekeruhan</span>
                  <span className={`text-[11px] font-bold ${isTurbNormal ? 'text-green-600' : 'text-yellow-500'}`}>
                    {isTurbNormal ? 'Normal' : 'Warning'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 my-1">
                  <span className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                    {metrics.turbidity}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">NTU</span>
                </div>
                {/* Visual Bar Kekeruhan */}
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isTurbNormal ? 'bg-cyan-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(Math.max((metrics.turbidity / 50) * 100, 5), 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-1">Target: ≤ 5 NTU</span>
              </div>
            </div>
          </div>

          {/* Footer Call-to-Action */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800/80 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <span>Buka Detail Lengkap Kualitas Air</span>
          </div>
        </div>

        {/* ===================== BOX 2: KONDISI LINGKUNGAN (SUHU & KELEMBAPAN) ===================== */}
        <div
          onClick={() => navigate('/environment')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/environment')}
          className="group relative rounded-3xl p-7 bg-gradient-to-br from-white via-white to-blue-50/40 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/20 border-2 border-gray-200/80 dark:border-gray-800 shadow-sm hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
        >
          {/* Header Kartu (ikon dihapus sesuai revisi) */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors border-l-4 border-blue-600 pl-3">
                    Kondisi Lingkungan
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Kombinasi sensor Suhu Udara & Kelembapan DHT22
                  </p>
                </div>
              </div>

              {/* Status teks saja */}
              <span
                className={`text-xs font-bold ${
                  environmentGood
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-yellow-500 dark:text-yellow-400'
                }`}
              >
                {environmentGood ? 'Normal' : 'Warning'}
              </span>
            </div>

            {/* Split Tampilan 2 Sensor: Suhu (Kiri) & Kelembapan (Kanan) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6 p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
              {/* Sisi Kiri: Suhu */}
              <div className="sm:border-r border-gray-200 dark:border-gray-700 sm:pr-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Suhu Udara</span>
                  <span className={`text-[11px] font-bold ${isTempNormal ? 'text-green-600' : 'text-yellow-500'}`}>
                    {isTempNormal ? 'Normal' : 'Warning'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 my-1">
                  <span className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                    {metrics.temperature.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">°C</span>
                </div>
                {/* Visual Bar Suhu */}
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-amber-500 transition-all duration-500"
                    style={{ width: `${Math.min(Math.max(((metrics.temperature - 15) / 30) * 100, 5), 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-1">Normal: 22 – 30 °C</span>
              </div>

              {/* Sisi Kanan: Kelembapan */}
              <div className="sm:pl-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Kelembapan</span>
                  <span className={`text-[11px] font-bold ${isHumNormal ? 'text-green-600' : 'text-yellow-500'}`}>
                    {isHumNormal ? 'Normal' : 'Warning'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 my-1">
                  <span className="text-3xl lg:text-4xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                    {metrics.humidity.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">%</span>
                </div>
                {/* Visual Bar Kelembapan */}
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-all duration-500"
                    style={{ width: `${Math.min(Math.max(metrics.humidity, 5), 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 block mt-1">Optimal: 40 – 70 %</span>
              </div>
            </div>
          </div>

          {/* Footer Call-to-Action */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800/80 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <span>Buka Detail Lengkap Lingkungan</span>
          </div>
        </div>
      </div>

      {/* ======================= TANDON & STABILITAS FISIK (BARIS RINGKAS) ======================= */}
      <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
                Status Fisik & Kapasitas Tandon Air
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tinggi air tandon, stabilitas getaran pompa, dan orientasi sudut MPU6050
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4 pt-2">
          {/* Ketinggian Air */}
          <div className="rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 min-w-0">
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

          {/* Stabilitas Wadah MPU6050 (titik status dihapus, hanya teks) */}
          <div className="rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 min-w-0">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Stabilitas Tangki</span>
            <div className="flex items-center gap-2 mt-1 mb-2">
              <span className={`text-lg font-bold font-mono ${
                metrics.stabilityStatus === 'Stabil' ? 'text-green-600 dark:text-green-400'
                : metrics.stabilityStatus === 'Pergerakan ringan' ? 'text-yellow-500 dark:text-yellow-400'
                : 'text-red-600 dark:text-red-400'
              }`}>
                {metrics.stabilityStatus === 'Stabil' ? 'Normal' : metrics.stabilityStatus === 'Pergerakan ringan' ? 'Warning' : 'Bahaya'}
              </span>
            </div>
            <span className="text-xs text-gray-400 block font-mono">
              Roll: {metrics.roll.toFixed(1)}° • Pitch: {metrics.pitch.toFixed(1)}°
            </span>
          </div>

          {/* Getaran Pompa Air (titik status dihapus, hanya teks) */}
          <div className="rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 min-w-0 sm:col-span-2 xl:col-span-1">
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
        </div>

        {/* Dynamic Sensors (Jika ada yang ditambahkan dari menu Perangkat) */}
        {dynamicSensors.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h4 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
              Sensor Tambahan Dinamis ({dynamicSensors.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {dynamicSensors.map((s) => (
                <DynamicSensorCard key={s.id} sensor={s} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ======================= KOTAK "FITUR" (SESUAI PROMPT FINAL REVISI 6) ======================= */}
      <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
              Fitur
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-3">
              Akses cepat modul analitika TinyML, orkestrasi perangkat & OTA, serta pelaporan data
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <Link
            to="/ai-analytics"
            className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 hover:border-blue-500 hover:shadow-md transition flex items-center gap-3 group min-w-0"
          >
            <div className="min-w-0">
              <strong className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-blue-600 transition-colors">
                Analisis Edge AI
              </strong>
              <span className="text-xs text-gray-400">Diagnosis prediktif & model TinyML</span>
            </div>
          </Link>

          <Link
            to="/devices"
            className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 hover:border-emerald-500 hover:shadow-md transition flex items-center gap-3 group min-w-0"
          >
            <div className="min-w-0">
              <strong className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-emerald-600 transition-colors">
                Perangkat & Update OTA
              </strong>
              <span className="text-xs text-gray-400">Tambah sensor & flash firmware wireless</span>
            </div>
          </Link>

          <Link
            to="/reports"
            className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/60 hover:border-purple-500 hover:shadow-md transition flex items-center gap-3 group min-w-0 sm:col-span-2 xl:col-span-1"
          >
            <div className="min-w-0">
              <strong className="text-sm font-bold text-gray-900 dark:text-white block group-hover:text-purple-600 transition-colors">
                Laporan & Ekspor Data
              </strong>
              <span className="text-xs text-gray-400">Unduh Excel, CSV, dan cetak PDF</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}