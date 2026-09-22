import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  FileSpreadsheet,
  Printer,
  Calendar,
  Filter,
  RefreshCw,
  Clock,
  Activity,
  CheckCircle,
  FileText,
  Building2,
  Cpu,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api, DeviceItem, LocationItem } from '../lib/api';

interface ReportSummary {
  total_records: number;
  earliest_record: string | null;
  latest_record: string | null;
  sampling_interval_seconds: number;
  parameters: string[];
  averages: {
    ph: number;
    temp: number;
    humidity: number;
    turbidity: number;
    water_level: number;
  } | null;
}

interface SensorRecord {
  id: string;
  device_code?: string;
  location_name?: string;
  date: string;
  time: string;
  timestamp: string;
  ph: number;
  temperature: number;
  humidity: number;
  turbidity: number;
  water_level: number;
  vibration: boolean;
  ai_status: string;
  mpu_x?: number | null;
  mpu_y?: number | null;
  mpu_z?: number | null;
  roll?: number | null;
  pitch?: number | null;
  yaw?: number | null;
  stability_status?: string;
}

export function Reports() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [records, setRecords] = useState<SensorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Filters
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedParam, setSelectedParam] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');

  // Metadata items
  const [devicesList, setDevicesList] = useState<DeviceItem[]>([]);
  const [locationsList, setLocationsList] = useState<LocationItem[]>([]);

  // Load locations & devices for filter dropdowns
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [devRes, locRes] = await Promise.all([
          api.devices().catch(() => ({ data: [] })),
          api.locations().catch(() => ({ data: [] })),
        ]);
        if (devRes.data) setDevicesList(devRes.data);
        if (locRes.data) setLocationsList(locRes.data);
      } catch (e) {
        // Ignored
      }
    };
    loadMetadata();
  }, []);

  // Fetch report data based on all filters
  const fetchReportData = useCallback(async () => {
    try {
      setIsFiltering(true);
      let query = `per_page=100`;
      if (startDate) query += `&from=${encodeURIComponent(startDate + 'T00:00:00')}`;
      if (endDate) query += `&to=${encodeURIComponent(endDate + 'T23:59:59')}`;
      if (selectedDevice !== 'all') query += `&node_id=${encodeURIComponent(selectedDevice)}`;
      if (selectedParam !== 'all') query += `&parameter=${encodeURIComponent(selectedParam)}`;

      const [sumRes, dataRes] = await Promise.all([
        api.reportsSummary(),
        api.reportsData(query),
      ]);

      setSummary(sumRes.data);

      let rawRows: SensorRecord[] = dataRes.data || [];
      // Apply location filter on client if specified
      if (selectedLocation !== 'all') {
        rawRows = rawRows.filter(
          (r) =>
            r.location_name?.toLowerCase().includes(selectedLocation.toLowerCase())
        );
      }
      setRecords(rawRows);
      const now = new Date();
      setLastSyncTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    } catch (err) {
      console.error('Gagal memuat laporan data sensor:', err);
    } finally {
      setLoading(false);
      setIsFiltering(false);
    }
  }, [startDate, endDate, selectedDevice, selectedLocation, selectedParam]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Export CSV
  const exportCSV = () => {
    if (records.length === 0) {
      alert('Tidak ada data sensor aktual untuk diekspor.');
      return;
    }

    const deviceText = selectedDevice === 'all' ? 'Semua Perangkat' : selectedDevice;
    const locationText = selectedLocation === 'all' ? 'Semua Lokasi' : selectedLocation;
    const paramText = selectedParam === 'all' ? 'Semua Parameter' : selectedParam.toUpperCase();

    // Metadata header
    const metaHeader = [
      `# LAPORAN MONITORING SENSOR IOT`,
      `# Periode: ${startDate} s/d ${endDate}`,
      `# Perangkat: ${deviceText}`,
      `# Lokasi: ${locationText}`,
      `# Parameter: ${paramText}`,
      `# Tanggal Ekspor: ${new Date().toLocaleString('id-ID')}`,
      `# Total Baris: ${records.length}`,
      ``,
    ].join('\n');

    // Headers
    const headers = [
      'ID',
      'Kode Perangkat',
      'Nama Lokasi',
      'Tanggal',
      'Waktu (WIB)',
      'pH Air',
      'Suhu (C)',
      'Kelembapan (%)',
      'Kekeruhan (NTU)',
      'Level Air (cm)',
      'Getaran',
      'Roll (deg)',
      'Pitch (deg)',
      'Kestabilan',
      'Status AI',
    ];

    const rows = records.map((r) => [
      r.id,
      r.device_code || 'ESP32-WATER-01',
      `"${(r.location_name || 'Titik Pantau').replace(/"/g, '""')}"`,
      r.date,
      r.time,
      r.ph,
      r.temperature,
      r.humidity,
      r.turbidity,
      r.water_level,
      r.vibration ? 'Terdeteksi' : 'Normal',
      r.roll ?? 0,
      r.pitch ?? 0,
      r.stability_status || 'Stabil',
      r.ai_status || 'Normal',
    ]);

    const csvContent =
      metaHeader +
      headers.join(',') +
      '\n' +
      rows.map((row) => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-iot-${startDate}_sd_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Export Excel (.csv formatted with UTF-8 BOM for Microsoft Excel)
  const exportExcel = () => {
    if (records.length === 0) {
      alert('Tidak ada data sensor aktual untuk diekspor ke Excel.');
      return;
    }

    const deviceText = selectedDevice === 'all' ? 'Semua Perangkat' : selectedDevice;
    const locationText = selectedLocation === 'all' ? 'Semua Lokasi' : selectedLocation;
    const paramText = selectedParam === 'all' ? 'Semua Parameter' : selectedParam.toUpperCase();

    // Excel Metadata Table Header
    const excelLines = [
      `LAPORAN RESMI MONITORING KUALITAS AIR & SENSOR IOT`,
      `Periode;${startDate} s/d ${endDate}`,
      `Perangkat;${deviceText}`,
      `Lokasi;${locationText}`,
      `Parameter Difilter;${paramText}`,
      `Waktu Ekspor;${new Date().toLocaleString('id-ID')}`,
      `Total Data;${records.length}`,
      ``,
      `ID;Kode Device;Lokasi;Tanggal;Waktu (WIB);pH Air;Suhu (°C);Kelembapan (%);Kekeruhan (NTU);Tinggi Air (cm);Getaran;Roll (°);Pitch (°);Kestabilan;Status AI`,
      ...records.map((r) =>
        [
          r.id,
          r.device_code || 'ESP32-WATER-01',
          r.location_name || 'Titik Pantau',
          r.date,
          r.time,
          r.ph,
          r.temperature,
          r.humidity,
          r.turbidity,
          r.water_level,
          r.vibration ? 'Terdeteksi' : 'Normal',
          r.roll ?? 0,
          r.pitch ?? 0,
          r.stability_status || 'Stabil',
          r.ai_status || 'Normal',
        ].join(';')
      ),
    ].join('\r\n');

    // Menambahkan BOM \uFEFF agar Excel otomatis mengenali encoding UTF-8 tanpa teks rusak
    const blob = new Blob(['\uFEFF' + excelLines], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-excel-iot-${startDate}_sd_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Export PDF via Print View
  const exportPDF = () => {
    window.print();
  };

  // Chart data
  const chartData = records
    .slice()
    .reverse()
    .map((r) => ({
      time: r.time,
      ph: r.ph,
      turbidity: r.turbidity,
      temperature: r.temperature,
      humidity: r.humidity,
      waterLevel: r.water_level,
      roll: r.roll ?? 0,
      pitch: r.pitch ?? 0,
    }));

  return (
    <div className="p-6 lg:p-8 print:p-0 print:m-0">
      {/* Header Halaman */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Laporan & Data Riwayat Sensor
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Filter multi-dimensi dan ekspor data aktual database sistem monitoring IoT
          </p>
          {lastSyncTime && (
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">
              Terakhir sinkronisasi: <span className="font-semibold text-gray-700 dark:text-gray-300">{lastSyncTime}</span>
            </p>
          )}
        </div>

        {/* Tombol Ekspor Multi-Format & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchReportData()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-xs transition-colors disabled:opacity-50 cursor-pointer dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            onClick={exportExcel}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>

          <button
            type="button"
            onClick={exportCSV}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={exportPDF}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-900 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            <Printer className="w-4 h-4" />
            Cetak / PDF
          </button>
        </div>
      </div>

      {/* Header Khusus Cetak PDF */}
      <div className="hidden print:block mb-6 pb-4 border-b border-gray-300">
        <h2 className="text-xl font-bold text-gray-900">LAPORAN PEMANTAUAN KUALITAS AIR & SENSOR IOT</h2>
        <div className="mt-2 text-xs text-gray-600 grid grid-cols-2 gap-1">
          <span>Periode: <strong>{startDate} s/d {endDate}</strong></span>
          <span>Perangkat: <strong>{selectedDevice === 'all' ? 'Semua Perangkat' : selectedDevice}</strong></span>
          <span>Lokasi: <strong>{selectedLocation === 'all' ? 'Semua Lokasi' : selectedLocation}</strong></span>
          <span>Waktu Unduh: <strong>{new Date().toLocaleString('id-ID')}</strong></span>
        </div>
      </div>

      {/* ========================================== */}
      {/* FILTER PANEL                               */}
      {/* ========================================== */}
      <div className="mb-6 p-5 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs print:hidden">
        <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Filter Laporan Terpadu
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs">
          {/* Tanggal Mulai */}
          <div>
            <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Tanggal Mulai
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Tanggal Akhir */}
          <div>
            <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Tanggal Akhir
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Filter Device */}
          <div>
            <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> Perangkat / ESP32
            </label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">Semua Perangkat (All)</option>
              {devicesList.map((d) => (
                <option key={d.id} value={d.kode_node}>
                  {d.kode_node} ({d.device_name || 'ESP32'})
                </option>
              ))}
              {devicesList.length === 0 && (
                <option value="ESP32-WATER-01">ESP32-WATER-01 (Utama)</option>
              )}
            </select>
          </div>

          {/* Filter Lokasi */}
          <div>
            <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Lokasi / Tandon
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">Semua Lokasi</option>
              {locationsList.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Sensor/Parameter */}
          <div>
            <label className="block text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Sensor / Parameter
            </label>
            <select
              value={selectedParam}
              onChange={(e) => setSelectedParam(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">Semua Parameter (Lengkap)</option>
              <option value="ph">pH Air</option>
              <option value="turbidity">Kekeruhan Air (NTU)</option>
              <option value="water_level">Ketinggian Air (Ultrasonik)</option>
              <option value="temperature">Suhu Air / Ruang</option>
              <option value="humidity">Kelembapan Udara</option>
              <option value="vibration">Getaran Pompa</option>
              <option value="mpu">MPU6050 (Roll/Pitch/Sumbu)</option>
            </select>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs text-gray-500">
            Ditemukan <strong>{records.length}</strong> data hasil filter
          </span>
          <button
            type="button"
            onClick={fetchReportData}
            disabled={isFiltering}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 dark:text-blue-400 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFiltering ? 'animate-spin' : ''}`} />
            Terapkan Filter
          </button>
        </div>
      </div>

      {/* Rata-rata Parameter Aktual */}
      {summary?.averages && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs print:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
            <span className="text-gray-500">Rata-rata pH</span>
            <p className="mt-1 text-lg font-bold text-blue-600">{summary.averages.ph} pH</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
            <span className="text-gray-500">Rata-rata Suhu</span>
            <p className="mt-1 text-lg font-bold text-blue-600">{summary.averages.temp} °C</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
            <span className="text-gray-500">Rata-rata Kelembapan</span>
            <p className="mt-1 text-lg font-bold text-blue-600">{summary.averages.humidity} %</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
            <span className="text-gray-500">Rata-rata Kekeruhan</span>
            <p className="mt-1 text-lg font-bold text-blue-600">{summary.averages.turbidity} NTU</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
            <span className="text-gray-500">Rata-rata Level Air</span>
            <p className="mt-1 text-lg font-bold text-blue-600">{summary.averages.water_level} cm</p>
          </div>
        </div>
      )}

      {/* Mode Tampilan Tab (Tabel vs Grafik) */}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Tabel Data
          </button>
          <button
            onClick={() => setViewMode('charts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              viewMode === 'charts'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Grafik Tren
          </button>
        </div>

        <span className="text-xs text-gray-500">
          Menampilkan {records.length} data aktual
        </span>
      </div>

      {/* Render Grafik jika mode Charts */}
      {viewMode === 'charts' && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
            Grafik Tren Parameter Sensor ({startDate} s/d {endDate})
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" stroke="#6b7280" style={{ fontSize: '11px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ph" stroke="#3b82f6" name="pH Air" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="turbidity" stroke="#f59e0b" name="Kekeruhan (NTU)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="waterLevel" stroke="#10b981" name="Level Air (cm)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabel Data Aktual */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Perangkat</th>
                <th className="px-4 py-3">Lokasi</th>
                {(selectedParam === 'all' || selectedParam === 'ph') && (
                  <th className="px-4 py-3">pH Air</th>
                )}
                {(selectedParam === 'all' || selectedParam === 'temperature') && (
                  <th className="px-4 py-3">Suhu</th>
                )}
                {(selectedParam === 'all' || selectedParam === 'humidity') && (
                  <th className="px-4 py-3">Kelembapan</th>
                )}
                {(selectedParam === 'all' || selectedParam === 'turbidity') && (
                  <th className="px-4 py-3">Kekeruhan</th>
                )}
                {(selectedParam === 'all' || selectedParam === 'water_level') && (
                  <th className="px-4 py-3">Level Air</th>
                )}
                {(selectedParam === 'all' || selectedParam === 'vibration') && (
                  <th className="px-4 py-3">Getaran</th>
                )}
                {(selectedParam === 'all' || selectedParam === 'mpu') && (
                  <th className="px-4 py-3">Orientasi MPU</th>
                )}
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-blue-600" />
                    Memuat data sensor...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Tidak ada data ditemukan untuk kriteria filter yang dipilih.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {r.date} <span className="text-gray-400">{r.time}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                      {r.device_code || 'ESP32-WATER-01'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {r.location_name || 'Titik Pantau'}
                    </td>

                    {(selectedParam === 'all' || selectedParam === 'ph') && (
                      <td className="px-4 py-3 font-semibold">
                        <span
                          className={
                            r.ph < 6.5 || r.ph > 8.5
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-800 dark:text-gray-200'
                          }
                        >
                          {r.ph.toFixed(2)} pH
                        </span>
                      </td>
                    )}

                    {(selectedParam === 'all' || selectedParam === 'temperature') && (
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {r.temperature.toFixed(1)} °C
                      </td>
                    )}

                    {(selectedParam === 'all' || selectedParam === 'humidity') && (
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {r.humidity.toFixed(1)} %
                      </td>
                    )}

                    {(selectedParam === 'all' || selectedParam === 'turbidity') && (
                      <td className="px-4 py-3">
                        <span
                          className={
                            r.turbidity > 5.0
                              ? 'text-red-600 font-semibold'
                              : 'text-gray-700 dark:text-gray-300'
                          }
                        >
                          {r.turbidity.toFixed(2)} NTU
                        </span>
                      </td>
                    )}

                    {(selectedParam === 'all' || selectedParam === 'water_level') && (
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {r.water_level.toFixed(1)} cm
                      </td>
                    )}

                    {(selectedParam === 'all' || selectedParam === 'vibration') && (
                      <td className="px-4 py-3">
                        {r.vibration ? (
                          <span className="text-[11px] font-bold text-red-600">
                            Bahaya
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-green-600">Normal</span>
                        )}
                      </td>
                    )}

                    {(selectedParam === 'all' || selectedParam === 'mpu') && (
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        R:{r.roll ?? 0}° P:{r.pitch ?? 0}° ({r.stability_status || 'Stabil'})
                      </td>
                    )}

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-bold ${
                          r.ai_status === 'Bahaya'
                            ? 'text-red-600 dark:text-red-400'
                            : r.ai_status === 'Anomali'
                            ? 'text-yellow-500 dark:text-yellow-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {r.ai_status === 'Anomali' ? 'Warning' : (r.ai_status || 'Normal')}
                      </span>
                    </td>
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
