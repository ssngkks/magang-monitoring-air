import { useEffect, useState, useMemo } from "react";
import { alertApi, Alert } from "../api/alerts";
import { Search, Download, X, AlertTriangle, Info, CheckCircle } from "lucide-react";

function severityBadge(s: string) {
  if (s === "critical") return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
  if (s === "warning") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
  if (s === "info") return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
  return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800";
}

function severityIcon(s: string) {
  if (s === "critical") return <AlertTriangle className="w-4 h-4 text-red-600" />;
  if (s === "warning") return <AlertTriangle className="w-4 h-4 text-amber-600" />;
  if (s === "info") return <Info className="w-4 h-4 text-blue-600" />;
  return <CheckCircle className="w-4 h-4 text-emerald-600" />;
}

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Alert | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await alertApi.list({ per_page: 100 });
      setAlerts(res.data);
    } catch (e: unknown) {
      const msg = e instanceof Object && "message" in e ? (e as { message: string }).message : "Gagal memuat alerts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const doLoad = async () => {
      if (inFlight || cancelled) return;
      if (document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await alertApi.list({ per_page: 100 });
        if (!cancelled) setAlerts(res.data);
      } catch {}
      inFlight = false;
    };
    load();
    const id = window.setInterval(doLoad, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filter !== "all" && a.severity !== filter) return false;
      if (search && !a.pesan.toLowerCase().includes(search.toLowerCase()) && !(a.node?.kode_node?.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [alerts, filter, search]);

  const stats = useMemo(() => {
    return {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
      info: alerts.filter((a) => a.severity === "info").length,
    };
  }, [alerts]);

  const handleDismiss = async (a: Alert) => {
    try {
      await alertApi.markRead(a.id);
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_read: true } : x)));
      setSelected(null);
    } catch {}
  };

  const handleExportCsv = () => {
    const headers = ["id", "node", "pesan", "severity", "is_read", "created_at"];
    const rows = filtered.map((a) => [a.id, a.node?.kode_node ?? a.node_id, `"${a.pesan.replace(/"/g, '""')}"`, a.severity, a.is_read ? "1" : "0", a.created_at]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Memuat alerts...</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950 p-6 text-center text-sm text-red-600 dark:text-red-300">{error} <button onClick={load} className="ml-2 underline">Coba lagi</button></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Peringatan & Notifikasi</h1>
        <button onClick={handleExportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-gray-900 dark:text-white" },
          { label: "Critical", value: stats.critical, color: "text-red-600" },
          { label: "Warnings", value: stats.warning, color: "text-amber-600" },
          { label: "Info", value: stats.info, color: "text-blue-600" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5">
          {(["all", "critical", "warning", "info"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize ${filter === f ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pesan atau node..." className="w-full h-9 pl-8 rounded-lg border bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-white text-sm" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-10 text-center text-sm text-gray-500 dark:text-gray-400">Tidak ada alert untuk filter ini</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div key={a.id} className={`flex items-start justify-between gap-3 p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 ${!a.is_read ? "ring-1 ring-blue-100 dark:ring-blue-900" : ""}`}>
              <div className="flex gap-3 flex-1 min-w-0">
                <div className="mt-0.5">{severityIcon(a.severity)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.pesan}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {a.node?.kode_node ?? `Node #${a.node_id}`} {a.node?.nama_lokasi ? `• ${a.node.nama_lokasi}` : ""} • {new Date(a.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${severityBadge(a.severity)}`}>{a.severity}</span>
                {!a.is_read && <span className="w-2 h-2 rounded-full bg-blue-600" title="Belum dibaca" />}
                <button onClick={() => setSelected(a)} className="text-xs px-2 py-1 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Detail</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-lg border dark:border-gray-800">
            <button onClick={() => setSelected(null)} className="absolute right-3 top-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              {severityIcon(selected.severity)}
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${severityBadge(selected.severity)}`}>{selected.severity}</span>
              <span className="text-xs text-gray-500">{selected.is_read ? "Sudah dibaca" : "Belum dibaca"}</span>
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{selected.pesan}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Node: {selected.node?.kode_node ?? selected.node_id} {selected.node?.nama_lokasi ? `(${selected.node.nama_lokasi})` : ""}</p>
            <p className="text-xs text-gray-400 mt-1">Waktu: {new Date(selected.created_at).toLocaleString("id-ID")}</p>
            <div className="mt-5 flex gap-2">
              {!selected.is_read && (
                <button onClick={() => handleDismiss(selected)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Tandai Dibaca</button>
              )}
              <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg border dark:border-gray-700 text-sm">Tutup</button>
              <button onClick={() => window.alert("Fitur Take Action belum tersedia untuk backend saat ini. Silakan periksa node secara manual.")} className="ml-auto px-4 py-2 rounded-lg bg-amber-500 text-white text-sm">Take Action</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
