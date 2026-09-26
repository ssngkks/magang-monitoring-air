import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Search,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  MonitorPlay,
  Info,
} from 'lucide-react';
import { Node } from '../lib/api';
import { isNodeOnline, getNodeCode, statusTextClass } from '../lib/nodes';
import { useNode } from '../context/NodeContext';
import { NodeDetailModal } from '../components/NodeDetailModal';

type StatusFilter = 'all' | 'online' | 'warning' | 'offline';

function fallback(v: unknown): string {
  if (v === undefined || v === null || v === '') return '-';
  return String(v);
}

function fmtLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'Belum tersedia';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Belum tersedia';
  return (
    d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );
}

function nodeStatus(n: Node): 'Online' | 'Warning' | 'Offline' {
  if (!isNodeOnline(n)) return 'Offline';
  const conn = (n as any).connection as string | undefined;
  if (conn === 'STALE') return 'Warning';
  return 'Online';
}

export function NodesMonitoring() {
  const navigate = useNavigate();
  const { nodes, selectedNodeId, setSelectedNodeId, isLoading, fetchError, refresh } = useNode();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [detailNode, setDetailNode] = useState<Node | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => {
      if (statusFilter !== 'all') {
        const s = nodeStatus(n).toLowerCase();
        if (statusFilter === 'warning' ? s !== 'warning' : s !== statusFilter) return false;
      }
      if (!q) return true;
      return [n.kode_node, (n as any).device_name, n.nama_lokasi]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [nodes, query, statusFilter]);

  const openInDashboard = (n: Node) => {
    setSelectedNodeId(String(n.id));
    navigate(`/?node=${n.id}`);
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'online', label: 'Online' },
    { key: 'warning', label: 'Stale / Warning' },
    { key: 'offline', label: 'Offline' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="pb-2 border-b border-gray-100 dark:border-gray-800">
        <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight border-l-4 border-blue-600 pl-3">
          Monitoring Nodes
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Pantau seluruh node yang terdaftar. Pilih node untuk menjadikannya Node Aktif di Dashboard.
        </p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-100 font-mono mt-1">
          Total Node: {nodes.length} node terdaftar
        </p>
      </div>

      {/* Lokasi Node — berbasis teks dari database (tanpa koordinat palsu) */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-2">
          Lokasi Node
        </h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 mb-3">
          Koordinat lokasi belum tersedia — peta dinonaktifkan. Klik node untuk menjadikannya Node Aktif.
        </p>
        {nodes.length === 0 ? (
          <p className="text-xs text-gray-400">Belum ada node terdaftar.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nodes.map((n) => {
              const active = String(n.id) === selectedNodeId;
              const online = isNodeOnline(n);
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNodeId(String(n.id))}
                  aria-pressed={active}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs transition ${
                    active
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 shadow-xs'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${online ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="min-w-0">
                    <span className="block font-bold font-mono text-gray-900 dark:text-white">{getNodeCode(n)}</span>
                    <span className="block text-[10px] text-gray-400 truncate max-w-[180px]">{fallback(n.nama_lokasi)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Search + filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode node, nama perangkat, lokasi…"
            className="w-full bg-transparent text-xs text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none"
            aria-label="Cari node"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === f.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={refresh}
            title="Segarkan Data"
            aria-label="Segarkan Data"
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* States */}
      {isLoading && nodes.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-500 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          Memuat data node...
        </div>
      )}

      {fetchError && nodes.length === 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Gagal memuat data node.</p>
              <p className="text-[11px] font-mono opacity-80">Endpoint: GET /api/nodes</p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shrink-0"
          >
            Coba lagi
          </button>
        </div>
      )}

      {!isLoading && !fetchError && nodes.length === 0 && (
        <div className="p-8 text-center rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Belum ada node terdaftar.</p>
          <Link to="/devices" className="mt-2 inline-block text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
            Daftarkan perangkat di Perangkat & Sensor →
          </Link>
        </div>
      )}

      {/* Table (desktop) */}
      {filtered.length > 0 && (
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
          <table className="w-full text-left text-xs min-w-[880px]">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3">Kode Node</th>
                <th className="px-4 py-3">Perangkat</th>
                <th className="px-4 py-3">Lokasi</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">Firmware</th>
                <th className="px-4 py-3">Model / Role</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((n) => {
                const s = nodeStatus(n);
                return (
                  <tr key={n.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                    <td className="px-4 py-3 font-bold font-mono text-gray-900 dark:text-white">{getNodeCode(n)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fallback((n as any).device_name)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fallback(n.nama_lokasi)}</td>
                    <td className={`px-4 py-3 font-bold ${statusTextClass(s === 'Online' ? 'Normal' : s === 'Warning' ? 'Warning' : 'Offline')}`}>
                      {s === 'Online' ? '● Online' : s === 'Warning' ? '◐ Stale' : '○ Offline'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtLastSeen(n.last_seen_at)}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">{fallback((n as any).firmware_version)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {fallback((n as any).model_type)}
                      {(n as any).device_role ? ` / ${(n as any).device_role}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openInDashboard(n)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition"
                        >
                          <MonitorPlay className="h-3.5 w-3.5" /> Monitoring
                        </button>
                        <button
                          onClick={() => setDetailNode(n)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-[11px] font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                        >
                          <Info className="h-3.5 w-3.5" /> Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards (mobile) */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {filtered.map((n) => {
            const s = nodeStatus(n);
            return (
              <div key={n.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold font-mono text-sm text-gray-900 dark:text-white truncate">{getNodeCode(n)}</p>
                    <p className="text-[11px] text-gray-400 truncate">{fallback((n as any).device_name)} • {fallback(n.nama_lokasi)}</p>
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ${statusTextClass(s === 'Online' ? 'Normal' : s === 'Warning' ? 'Warning' : 'Offline')}`}>
                    {s === 'Online' ? '● Online' : s === 'Warning' ? '◐ Stale' : '○ Offline'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Last seen: {fmtLastSeen(n.last_seen_at)} • FW: {fallback((n as any).firmware_version)}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openInDashboard(n)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition"
                  >
                    <MonitorPlay className="h-3.5 w-3.5" /> Monitoring
                  </button>
                  <button
                    onClick={() => setDetailNode(n)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-[11px] font-semibold transition"
                  >
                    <Info className="h-3.5 w-3.5" /> Detail
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !fetchError && nodes.length > 0 && filtered.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-500 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Tidak ada node yang cocok dengan pencarian/filter.</span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Butuh tambah/edit node? <Link to="/devices" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">Kelola di Perangkat & Sensor →</Link>
      </p>

      <NodeDetailModal node={detailNode} onClose={() => setDetailNode(null)} />
    </div>
  );
}
