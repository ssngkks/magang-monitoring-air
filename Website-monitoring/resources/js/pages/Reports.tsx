import { useEffect, useState, useMemo, useRef } from "react";
import { nodeApi, Node, SensorDataRow } from "../api/nodes";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];

export function Reports() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [reportType, setReportType] = useState("Ringkasan Sistem");
  const [range, setRange] = useState<"today" | "7days" | "30days" | "3months" | "1year" | "custom">("7days");
  const [view, setView] = useState<"charts" | "table">("charts");
  const [history, setHistory] = useState<SensorDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    nodeApi
      .list()
      .then((r) => {
        if (cancelled || !mountedRef.current) return;
        setNodes(r.data);
        if (r.data.length > 0) setSelectedNodeId((prev) => prev ?? r.data[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    let from: string | undefined;
    let to: string | undefined = now.toISOString();
    if (range === "today") from = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    else if (range === "7days") from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    else if (range === "30days") from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    else if (range === "3months") from = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    else if (range === "1year") from = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    else if (range === "custom") {
      from = customFrom ? new Date(customFrom).toISOString() : undefined;
      to = customTo ? new Date(customTo).toISOString() : undefined;
    }
    return { from, to };
  }, [range, customFrom, customTo]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const curId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    let cancelled = false;
    const from = dateRange.from;
    const to = dateRange.to;
    nodeApi
      .sensorData(selectedNodeId, { from, to, per_page: 100 })
      .then((res) => {
        if (cancelled || curId !== reqIdRef.current || !mountedRef.current) return;
        const sorted = [...res.data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setHistory(sorted);
      })
      .catch((e: unknown) => {
        if (cancelled || curId !== reqIdRef.current || !mountedRef.current) return;
        const msg = e instanceof Object && "message" in e ? (e as { message: string }).message : "Gagal memuat data";
        setError(msg);
      })
      .finally(() => {
        if (cancelled || curId !== reqIdRef.current || !mountedRef.current) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, dateRange.from, dateRange.to]);

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const avg = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const max = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x != null);
      return v.length ? Math.max(...v) : null;
    };
    return {
      avgPh: avg(history.map((h) => h.ph)),
      avgTemp: avg(history.map((h) => h.temp)),
      maxTurbidity: max(history.map((h) => h.turbidity)),
      vibrationCount: history.filter((h) => h.vibration).length,
    };
  }, [history]);

  const chartData = useMemo(
    () =>
      history.map((r) => ({
        time: new Date(r.created_at).toLocaleDateString("id-ID", { month: "short", day: "numeric" }),
        ph: r.ph,
        turbidity: r.turbidity,
        temp: r.temp,
        humidity: r.humidity,
        water_level: r.water_level,
        vibration: r.vibration ? 1 : 0,
      })),
    [history],
  );

  const exportCsv = () => {
    const headers = ["created_at", "ph", "temp", "humidity", "turbidity", "water_level", "vibration", "ai_status"];
    const rows = history.map((r) => [r.created_at, r.ph ?? "", r.temp ?? "", r.humidity ?? "", r.turbidity ?? "", r.water_level ?? "", r.vibration ? "1" : "0", r.ai_status]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (nodes.length === 0 && !loading) return <div className="text-center py-10 text-sm text-gray-500">Belum ada node</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Laporan & Data</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="h-9 rounded-lg border bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-white px-2 text-sm">
            <option>Ringkasan Sistem</option>
            <option>Kualitas pH</option>
            <option>Suhu & Kelembapan (DHT)</option>
            <option>Kekeruhan Air</option>
            <option>Level Air (Ultrasonik)</option>
            <option>Riwayat Getaran</option>
          </select>
          <select value={selectedNodeId ?? ""} onChange={(e) => setSelectedNodeId(Number(e.target.value))} className="h-9 rounded-lg border bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-white px-2 text-sm">
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.kode_node}
              </option>
            ))}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="h-9 rounded-lg border bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-white px-2 text-sm">
            <option value="today">Hari Ini</option>
            <option value="7days">7 Hari Terakhir</option>
            <option value="30days">30 Hari Terakhir</option>
            <option value="3months">3 Bulan Terakhir</option>
            <option value="1year">Setahun Terakhir</option>
            <option value="custom">Kustom</option>
          </select>
          {range === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-lg border px-2 text-sm dark:bg-gray-900 dark:border-gray-700" />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-lg border px-2 text-sm dark:bg-gray-900 dark:border-gray-700" />
            </>
          )}
          <div className="flex rounded-lg border overflow-hidden dark:border-gray-700">
            <button onClick={() => setView("charts")} className={`px-3 py-1.5 text-xs font-medium ${view === "charts" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400"}`}>Charts</button>
            <button onClick={() => setView("table")} className={`px-3 py-1.5 text-xs font-medium ${view === "table" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400"}`}>Table</button>
          </div>
          <button onClick={exportCsv} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border dark:border-gray-700 text-sm">CSV</button>
          <button onClick={() => window.alert("Export PDF belum tersedia — gunakan CSV.")} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border dark:border-gray-700 text-sm opacity-60">PDF</button>
          <button onClick={() => window.alert("Export Excel belum tersedia — gunakan CSV.")} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border dark:border-gray-700 text-sm opacity-60">Excel</button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">pH Rata-rata</p>
            <p className="text-xl font-bold dark:text-white">{stats.avgPh?.toFixed(2) ?? "-"}</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Suhu Rata-rata</p>
            <p className="text-xl font-bold dark:text-white">{stats.avgTemp?.toFixed(1) ?? "-"}°C</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Kekeruhan Maks.</p>
            <p className="text-xl font-bold dark:text-white">{stats.maxTurbidity?.toFixed(2) ?? "-"} NTU</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Getaran Terdeteksi</p>
            <p className="text-xl font-bold dark:text-white">{stats.vibrationCount}×</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-sm text-gray-500">Memuat laporan...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error} <button onClick={() => window.location.reload()} className="underline">Coba lagi</button></div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-10 text-center text-sm text-gray-500">Tidak ada data untuk rentang ini</div>
      ) : view === "charts" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-sm font-semibold dark:text-white mb-3">Tren pH</p>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 14]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="ph" stroke="#3b82f6" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-sm font-semibold dark:text-white mb-3">Kekeruhan & Level Air</p>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="turbidity" stroke="#f59e0b" dot={false} name="Turbidity" />
                  <Line yAxisId="right" type="monotone" dataKey="water_level" stroke="#3b82f6" dot={false} name="Level" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-sm font-semibold dark:text-white mb-3">Suhu & Kelembapan</p>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="temp" fill="#ef4444" name="Suhu" />
                  <Bar yAxisId="right" dataKey="humidity" fill="#06b6d4" name="Humid" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <p className="text-sm font-semibold dark:text-white mb-3">Distribusi Sensor Aktif</p>
            <p className="text-[11px] text-gray-400 mb-2">6 kategori — data nyata dari {history.length} rows (AI: Normal {history.filter(h=>h.ai_status==="Normal").length} / Anomali {history.filter(h=>h.ai_status==="Anomali").length} / Bahaya {history.filter(h=>h.ai_status==="Bahaya").length})</p>
            <div className="h-[250px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "pH", value: history.filter((h) => h.ph != null).length },
                      { name: "DHT Suhu", value: history.filter((h) => h.temp != null).length },
                      { name: "DHT Humid", value: history.filter((h) => h.humidity != null).length },
                      { name: "Turbidity", value: history.filter((h) => h.turbidity != null).length },
                      { name: "Ultrasonik", value: history.filter((h) => h.water_level != null).length },
                      { name: "Getar", value: history.filter((h) => h.vibration).length },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2">pH</th>
                <th className="px-3 py-2">Suhu</th>
                <th className="px-3 py-2">Humid</th>
                <th className="px-3 py-2">Turbidity</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Getaran</th>
                <th className="px-3 py-2">AI</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-t dark:border-gray-800">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.ph ?? "-"}</td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.temp ?? "-"}</td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.humidity ?? "-"}</td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.turbidity ?? "-"}</td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.water_level ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.vibration ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>{r.vibration ? "Terdeteksi" : "Normal"}</span>
                  </td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.ai_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
            <span>Menampilkan {Math.min(50, history.length)} dari {history.length} data</span>
            <button onClick={exportCsv} className="underline">Unduh CSV</button>
          </div>
        </div>
      )}
    </div>
  );
}
