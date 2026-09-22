import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X, Filter, Search, Download, Check, Bell, RefreshCw } from 'lucide-react';
import { api, AlertData } from '../lib/api';

interface SystemAlert {
  id: string;
  backendId?: string | number;
  type: 'critical' | 'warning' | 'info';
  message: string;
  location: string;
  timestamp: string;
  description: string;
  severity: 'Kritis' | 'Peringatan' | 'Informasi';
  isRead: boolean;
}

export function Alerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<SystemAlert | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  const [markingAll, setMarkingAll] = useState(false);

  const loadAlerts = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const response = await api.alerts('per_page=200');
      const mapped: SystemAlert[] = (response.data || []).map((item: AlertData) => {
        const isCrit = item.severity === 'critical';
        const createdDate = item.created_at ? new Date(item.created_at) : new Date();

        return {
          id: String(item.id),
          backendId: item.id,
          type: isCrit ? 'critical' : 'warning',
          message: item.pesan || 'Peringatan kondisi sensor terdeteksi',
          location: item.node?.nama_lokasi
            ? `Unit ${item.node.kode_node} – ${item.node.nama_lokasi}`
            : 'Unit ESP32 Sensor Utama',
          timestamp: createdDate.toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }) + ' WIB',
          description: item.pesan || 'Nilai parameter sensor terdeteksi melampaui batas aman operasional.',
          severity: isCrit ? 'Kritis' : 'Peringatan',
          isRead: Boolean(item.is_read),
        };
      });

      setAlerts(mapped);
      const now = new Date();
      setLastSyncTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
      const unreadCount = mapped.filter((a) => !a.isRead).length;
      window.dispatchEvent(
        new CustomEvent('alerts-updated', { detail: { unreadCount } })
      );
    } catch (error) {
      console.error('Gagal mengambil daftar peringatan:', error);
      setAlerts([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 15000); // Polling tiap 15 detik
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (alertId: string, backendId?: string | number) => {
    try {
      if (backendId) {
        await api.markAlertRead(backendId);
      }
      setAlerts((prev) => {
        const next = prev.map((a) => (a.id === alertId ? { ...a, isRead: true } : a));
        const newUnreadCount = next.filter((a) => !a.isRead).length;
        window.dispatchEvent(
          new CustomEvent('alerts-updated', { detail: { unreadCount: newUnreadCount } })
        );
        return next;
      });
      if (selectedAlert?.id === alertId) {
        setSelectedAlert((prev) => (prev ? { ...prev, isRead: true } : null));
      }
    } catch (err) {
      console.error('Gagal menandai alert sebagai dibaca:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadAlerts = alerts.filter((a) => !a.isRead);
    if (unreadAlerts.length === 0) return;

    setMarkingAll(true);
    try {
      await Promise.allSettled(
        unreadAlerts.map((a) => (a.backendId ? api.markAlertRead(a.backendId) : Promise.resolve()))
      );
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
      if (selectedAlert && !selectedAlert.isRead) {
        setSelectedAlert((prev) => (prev ? { ...prev, isRead: true } : null));
      }
      window.dispatchEvent(
        new CustomEvent('alerts-updated', { detail: { unreadCount: 0 } })
      );
    } catch (err) {
      console.error('Gagal menandai seluruh alert sebagai dibaca:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesFilter =
      filterType === 'all'
        ? true
        : filterType === 'unread'
          ? !alert.isRead
          : alert.type === filterType;

    const matchesSearch =
      alert.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const exportAlerts = () => {
    const csvContent = [
      ['ID', 'Tingkat', 'Pesan Peringatan', 'Lokasi Perangkat', 'Waktu', 'Status Dibaca'],
      ...filteredAlerts.map((a) => [
        a.id,
        a.severity,
        `"${a.message.replace(/"/g, '""')}"`,
        `"${a.location}"`,
        `"${a.timestamp}"`,
        a.isRead ? 'Sudah Dibaca' : 'Belum Dibaca',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-peringatan-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const stats = {
    total: alerts.length,
    critical: alerts.filter((a) => a.type === 'critical').length,
    warning: alerts.filter((a) => a.type === 'warning').length,
    unread: alerts.filter((a) => !a.isRead).length,
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Peringatan & Notifikasi Sistem
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Pantau kondisi anomali sensor air dan kelola notifikasi secara real-time
          </p>
          {lastSyncTime && (
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">
              Terakhir sinkronisasi: <span className="font-semibold text-gray-700 dark:text-gray-300">{lastSyncTime}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadAlerts(true)}
            disabled={isRefreshing}
            aria-label="Segarkan Peringatan"
            title="Segarkan Peringatan"
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 shadow-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Kartu Ringkasan */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Peringatan</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/50 dark:bg-red-950/40">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Kondisi Kritis</p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm dark:border-yellow-900/50 dark:bg-yellow-950/40">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Peringatan / Warning</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.warning}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/40">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Belum Dibaca</p>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.unread}</p>
        </div>
      </div>

      {/* Kontrol Filter & Pencarian */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              filterType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <Filter className="mr-1.5 inline-block h-3.5 w-3.5" />
            Semua ({stats.total})
          </button>
          <button
            onClick={() => setFilterType('critical')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              filterType === 'critical'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Kritis ({stats.critical})
          </button>
          <button
            onClick={() => setFilterType('warning')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              filterType === 'warning'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Peringatan ({stats.warning})
          </button>
          <button
            onClick={() => setFilterType('unread')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              filterType === 'unread'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Belum Dibaca ({stats.unread})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stats.unread > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={markingAll}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
              title="Tandai semua notifikasi sebagai sudah dibaca"
            >
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{markingAll ? 'Menandai...' : 'Tandai Semua Dibaca'}</span>
            </button>
          )}

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari peringatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <button
            onClick={exportAlerts}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Daftar Peringatan */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm font-medium text-gray-500 animate-pulse">Memuat daftar peringatan...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-900">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="mt-4 text-base font-bold text-gray-800 dark:text-gray-200">
              Tidak Ada Peringatan
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Seluruh parameter sensor air berada dalam rentang ambang batas aman.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isCrit = alert.type === 'critical';
            return (
              <div
                key={alert.id}
                onClick={() => setSelectedAlert(alert)}
                className={`cursor-pointer rounded-xl border p-4 transition-all shadow-sm ${
                  isCrit
                    ? 'border-red-200 bg-red-50/70 hover:border-red-300 dark:border-red-900/60 dark:bg-red-950/30'
                    : 'border-yellow-200 bg-yellow-50/70 hover:border-yellow-300 dark:border-yellow-900/60 dark:bg-yellow-950/30'
                } ${alert.isRead ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {isCrit ? (
                      <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                          {alert.message}
                        </h3>
                        {!alert.isRead && (
                          <span className="text-[10px] font-bold text-blue-600">
                            Baru
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">{alert.location}</span>
                        <span>•</span>
                        <span>{alert.timestamp}</span>
                        <span>•</span>
                        <span
                          className={`text-[10px] font-bold ${
                            isCrit
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-yellow-500 dark:text-yellow-400'
                          }`}
                        >
                          Tingkat: {alert.severity}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!alert.isRead && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(alert.id, alert.backendId);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      title="Tandai Sudah Dibaca"
                    >
                      <Check className="h-3.5 w-3.5 text-green-600" />
                      <span>Tandai Dibaca</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Detail Peringatan */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex items-start justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Rincian Peringatan Sensor
                </h3>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Pesan Anomali</p>
                <p className="font-semibold text-gray-900 dark:text-white mt-0.5">
                  {selectedAlert.message}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Perangkat Sumber</p>
                <p className="text-gray-700 dark:text-gray-300">{selectedAlert.location}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">Waktu Kejadian</p>
                  <p className="font-medium text-gray-800 dark:text-gray-200">{selectedAlert.timestamp}</p>
                </div>
                <div>
                  <p className="text-gray-500">Tingkat Keparahan</p>
                  <p className="font-semibold text-red-600 dark:text-red-400">{selectedAlert.severity}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500">Keterangan Teknis</p>
                <p className="mt-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {selectedAlert.description}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              {!selectedAlert.isRead && (
                <button
                  onClick={() => {
                    handleMarkAsRead(selectedAlert.id, selectedAlert.backendId);
                    setSelectedAlert(null);
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Tandai Sudah Dibaca
                </button>
              )}
              <button
                onClick={() => setSelectedAlert(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
