import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { nodeApi, Node, SensorDataRow } from "../api/nodes";
import { alertApi, Alert } from "../api/alerts";
import { MetricCard } from "../components/MetricCard";
import { SensorStatus } from "../components/SensorStatus";
import { Droplets, Thermometer, CloudRain, Wind, Activity, Timer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart, BarChart, Bar } from "recharts";

function getPhStatus(ph: number | null): "normal" | "warning" | "critical" {
  if (ph == null) return "normal";
  if (ph < 6.5 || ph > 8.5) return "critical";
  if (ph < 6.8 || ph > 7.8) return "warning";
  return "normal";
}
function getTurbidityStatus(v: number | null): "normal" | "warning" | "critical" {
  if (v == null) return "normal";
  if (v > 4) return "critical";
  if (v > 1.5) return "warning";
  return "normal";
}
function getWaterLevelStatus(v: number | null): "normal" | "warning" | "critical" {
  if (v == null) return "normal";
  if (v < 60 || v > 150) return "critical";
  if (v < 80 || v > 130) return "warning";
  return "normal";
}

export function Dashboard() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [history, setHistory] = useState<SensorDataRow[]>([]);
  const [latestMap, setLatestMap] = useState<Map<number, SensorDataRow>>(new Map());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date().toLocaleTimeString("id-ID"));
  const [activeTab, setActiveTab] = useState<"ph" | "temp" | "level">("ph");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const selectedNodeIdRef = useRef<number | null>(null);
  const historyReqIdRef = useRef(0);
  const pollingInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null, [nodes, selectedNodeId]);
  const latest = useMemo(() => {
    if (!selectedNode) return null;
    return latestMap.get(selectedNode.id) || null;
  }, [latestMap, selectedNode]);

  // Stable fetchers
  const fetchNodesStable = useCallback(async () => {
    const res = await nodeApi.list();
    if (!mountedRef.current) return res;
    setNodes(res.data);
    // set initial selection only once via functional update to avoid dep on selectedNodeId
    setSelectedNodeId((prev) => {
      if (prev == null && res.data.length > 0) return res.data[0].id;
      return prev;
    });
    return res;
  }, []);

  const fetchHistoryStable = useCallback(async (nodeId: number) => {
    const reqId = ++historyReqIdRef.current;
    const res = await nodeApi.sensorData(nodeId, { per_page: 24 });
    // race guard: only apply if still latest request for current node
    if (reqId !== historyReqIdRef.current) return;
    if (selectedNodeIdRef.current !== null && selectedNodeIdRef.current !== nodeId) return;
    const sorted = [...res.data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (!mountedRef.current) return;
    // bounded history 24
    setHistory(sorted.slice(-24));
    if (sorted.length > 0) {
      const latestRow = sorted[sorted.length - 1];
      setLatestMap((prev) => {
        const next = new Map(prev);
        next.set(nodeId, latestRow);
        return next;
      });
    }
  }, []);

  const fetchLatestForAll = useCallback(async (nodeList: Node[]) => {
    const results = await Promise.all(
      nodeList.map(async (n) => {
        try {
          const res = await nodeApi.sensorData(n.id, { per_page: 1 });
          return res.data.length > 0 ? ([n.id, res.data[0]] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    if (!mountedRef.current) return;
    const m = new Map<number, SensorDataRow>();
    results.forEach((r) => {
      if (r) m.set(r[0], r[1]);
    });
    setLatestMap(m);
  }, []);

  const fetchAlertsStable = useCallback(async () => {
    try {
      const res = await alertApi.list({ per_page: 5 });
      if (!mountedRef.current) return;
      setAlerts(res.data);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchNodesStable();
      if (res.data.length > 0) {
        await Promise.all([fetchLatestForAll(res.data), fetchAlertsStable()]);
        // history will be fetched by selectedNode effect, avoid duplicate here
      }
    } catch (e: unknown) {
      const msg = e instanceof Object && "message" in e ? (e as { message: string }).message : "Gagal memuat data";
      if (mountedRef.current) setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetchNodesStable, fetchLatestForAll, fetchAlertsStable]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // history for selected node — single source, with race guard already in fetchHistoryStable
  useEffect(() => {
    if (selectedNode) {
      fetchHistoryStable(selectedNode.id);
    }
  }, [selectedNode, fetchHistoryStable]);

  // clock — cleanup
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!mountedRef.current) return;
      setNow(new Date().toLocaleTimeString("id-ID"));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // polling — respects realtimeHealthy, visibility, in-flight guard, cleanup
  useEffect(() => {
    if (!autoRefresh || !selectedNode) return;
    const getInterval = () => {
      const iv = Number(localStorage.getItem("aqua_refresh_interval") || "10000");
      const base = Math.max(5000, isNaN(iv) ? 10000 : iv);
      // if realtime healthy, reduce polling frequency (increase interval) for sensor data
      return realtimeHealthy ? Math.max(base, 30000) : base;
    };
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        // when realtime healthy, skip history poll (realtime pushes), only poll nodes/alerts for status
        if (!realtimeHealthy && selectedNode) {
          await fetchHistoryStable(selectedNode.id);
        }
        await fetchAlertsStable();
        await fetchNodesStable();
      } catch {}
      pollingInFlightRef.current = false;
    }, getInterval());
    return () => window.clearInterval(id);
  }, [autoRefresh, selectedNode, fetchHistoryStable, fetchAlertsStable, fetchNodesStable, realtimeHealthy]);

  // Realtime via Reverb private channel — with health tracking and proper leave
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        await import("../echo.js").catch(() => null);
        const Echo = (window as unknown as { Echo?: { private: (name: string) => { listen: (event: string, cb: (p: unknown) => void) => unknown; stopListening: (e: string) => void; unsubscribe?: () => void }; leave?: (name: string) => void } }).Echo;
        if (!Echo || !selectedNode || cancelled) {
          if (mountedRef.current) setRealtimeHealthy(false);
          return;
        }
        (window as unknown as { refreshEchoAuth?: () => void }).refreshEchoAuth?.();
        const ch = Echo.private(`node.${selectedNode.id}`);
        // assume healthy after subscribe attempt; pusher will error if auth fails (we treat as not healthy but polling fallback will handle)
        if (mountedRef.current) setRealtimeHealthy(true);
        const sensorCb = (payload: unknown) => {
          const p = payload as SensorDataRow;
          if (!mountedRef.current) return;
          setHistory((prev) => {
            const next = [...prev, p as SensorDataRow].slice(-24);
            return next;
          });
          setLatestMap((prev) => {
            const next = new Map(prev);
            next.set(selectedNode.id, p as SensorDataRow);
            return next;
          });
        };
        const alertCb = (payload: unknown) => {
          const a = payload as Alert;
          if (!mountedRef.current) return;
          setAlerts((prev) => [a, ...prev].slice(0, 5));
        };
        (ch as unknown as { listen: (e: string, cb: (p: unknown) => void) => void }).listen(".sensor.updated", sensorCb);
        (ch as unknown as { listen: (e: string, cb: (p: unknown) => void) => void }).listen(".alert.created", alertCb);
        // error handling: if auth fails, pusher triggers subscription_error
        const maybeCh = ch as unknown as { error?: (cb: () => void) => void };
        if (maybeCh.error) {
          maybeCh.error(() => {
            if (mountedRef.current) setRealtimeHealthy(false);
          });
        }
        cleanup = () => {
          try {
            (ch as unknown as { stopListening: (e: string) => void }).stopListening(".sensor.updated");
            (ch as unknown as { stopListening: (e: string) => void }).stopListening(".alert.created");
            if (typeof (ch as { unsubscribe?: () => void }).unsubscribe === "function") (ch as { unsubscribe: () => void }).unsubscribe();
            else if (Echo.leave) Echo.leave(`node.${selectedNode.id}`);
          } catch {}
          if (mountedRef.current) setRealtimeHealthy(false);
        };
      } catch {
        if (mountedRef.current) setRealtimeHealthy(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
      try {
        const Echo = (window as unknown as { Echo?: { leave?: (name: string) => void } }).Echo;
        if (Echo?.leave && selectedNode) Echo.leave(`node.${selectedNode.id}`);
      } catch {}
      if (mountedRef.current) setRealtimeHealthy(false);
    };
  }, [selectedNode]);

  const metrics = latest
    ? {
        ph: latest.ph,
        temp: latest.temp,
        humidity: latest.humidity,
        turbidity: latest.turbidity,
        waterLevel: latest.water_level,
        vibration: latest.vibration,
        aiStatus: latest.ai_status,
      }
    : null;

  // memoize chartData transform once per history
  const chartData = useMemo(() => {
    return history.map((row) => ({
      time: new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      ph: row.ph,
      turbidity: row.turbidity,
      temp: row.temp,
      humidity: row.humidity,
      water_level: row.water_level,
      vibration: row.vibration ? 1 : 0,
    }));
  }, [history]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-white dark:bg-gray-900 border dark:border-gray-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-white dark:bg-gray-900 border dark:border-gray-800 animate-pulse" />
          ))}
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">Memuat data sensor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 text-center">
        <p className="text-sm text-red-700 dark:text-red-300">Gagal memuat data: {error}</p>
        <button onClick={loadAll} className="mt-3 px-4 py-2 rounded-lg bg-red-600 text-white text-sm">Coba lagi</button>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-10 text-center">
        <p className="text-gray-900 dark:text-white font-semibold">Belum ada node</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tambahkan node via API POST /api/nodes atau hubungi admin.</p>
        <button onClick={loadAll} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Refresh</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard Pemantauan Air</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Timer className="w-4 h-4" /> {now}
            {selectedNode && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {selectedNode.kode_node} • {selectedNode.nama_lokasi}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${realtimeHealthy ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>{realtimeHealthy ? "Realtime" : "Polling"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedNode?.id ?? ""}
            onChange={(e) => setSelectedNodeId(Number(e.target.value))}
            className="h-9 rounded-lg border bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-white px-3 text-sm"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.kode_node} - {n.nama_lokasi}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> Auto refresh
          </label>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${metrics?.vibration ? "bg-red-50 text-red-700 border-red-200 animate-pulse dark:bg-red-950 dark:text-red-300" : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"}`}>
            {metrics?.vibration ? "Getaran Terdeteksi!" : "Semua Sistem Normal"}
          </span>
        </div>
      </div>

      {metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard title="pH Air" value={metrics.ph?.toFixed(2) ?? "-"} unit="pH" min={0} max={14} current={metrics.ph ?? undefined} status={getPhStatus(metrics.ph)} icon={<Droplets className="w-4 h-4" />} />
          <MetricCard title="Suhu" value={metrics.temp?.toFixed(1) ?? "-"} unit="°C" min={0} max={50} current={metrics.temp ?? undefined} status={metrics.temp != null && metrics.temp > 28 ? "warning" : "normal"} icon={<Thermometer className="w-4 h-4" />} />
          <MetricCard title="Kelembapan" value={metrics.humidity?.toFixed(1) ?? "-"} unit="%" min={0} max={100} current={metrics.humidity ?? undefined} status="normal" icon={<CloudRain className="w-4 h-4" />} />
          <MetricCard title="Kekeruhan" value={metrics.turbidity?.toFixed(2) ?? "-"} unit="NTU" min={0} max={5} current={metrics.turbidity ?? undefined} status={getTurbidityStatus(metrics.turbidity)} icon={<Wind className="w-4 h-4" />} />
        </div>
      ) : (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-6 text-center text-sm text-gray-500">Belum ada data sensor untuk node ini</div>
      )}

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Level Air (Ultrasonik)</p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold dark:text-white">{metrics.waterLevel?.toFixed(0) ?? "-"}</span>
              <span className="text-sm text-gray-500">cm</span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${getWaterLevelStatus(metrics.waterLevel) === "critical" ? "bg-red-50 text-red-700 border-red-200" : getWaterLevelStatus(metrics.waterLevel) === "warning" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{getWaterLevelStatus(metrics.waterLevel)}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, ((metrics.waterLevel ?? 0) / 200) * 100))}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">Range 0 – 200 cm</p>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5 flex flex-col justify-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Getaran (MPU6050)</p>
            <div className={`flex items-center gap-2 text-sm font-semibold ${metrics.vibration ? "text-red-600" : "text-emerald-600"}`}>
              <Activity className="w-5 h-5" /> {metrics.vibration ? "Terdeteksi" : "Normal"}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">AI Status: <span className={`font-semibold ${metrics.aiStatus === "Bahaya" ? "text-red-600" : metrics.aiStatus === "Anomali" ? "text-amber-600" : "text-emerald-600"}`}>{metrics.aiStatus}</span></p>
            <p className="text-xs text-gray-400 mt-2">Node status: {selectedNode?.is_online ? "Online" : "Offline"} • Last seen: {selectedNode?.last_seen_at ? new Date(selectedNode.last_seen_at).toLocaleString("id-ID") : "-"}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4 overflow-auto">
          {[
            { k: "ph", label: "pH & Kekeruhan" },
            { k: "temp", label: "Suhu & Kelembapan" },
            { k: "level", label: "Level Air & Getaran" },
          ].map((tab) => (
            <button
              key={tab.k}
              onClick={() => setActiveTab(tab.k as typeof activeTab)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${activeTab === tab.k ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"}`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">{history.length} data points</span>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Belum ada data historis</p>
        ) : (
          <div className="h-[300px]">
            {activeTab === "ph" && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" domain={[0, 14]} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="ph" stroke="#3b82f6" dot={false} strokeWidth={2} name="pH" />
                  <Line yAxisId="right" type="monotone" dataKey="turbidity" stroke="#f59e0b" dot={false} strokeWidth={2} name="Turbidity (NTU)" />
                </LineChart>
              </ResponsiveContainer>
            )}
            {activeTab === "temp" && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" domain={[0, 50]} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area yAxisId="left" type="monotone" dataKey="temp" stroke="#ef4444" fill="#fecaca" name="Suhu (°C)" />
                  <Area yAxisId="right" type="monotone" dataKey="humidity" stroke="#06b6d4" fill="#a5f3fc" name="Kelembapan (%)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {activeTab === "level" && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="water_level" fill="#3b82f6" name="Level Air (cm)" />
                  <Bar dataKey="vibration" fill="#ef4444" name="Getaran" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Jaringan Sensor</h2>
        <SensorStatus nodes={nodes} latestDataMap={latestMap} />
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Peringatan Terbaru</h3>
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${a.severity === "critical" ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900" : a.severity === "warning" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900" : "bg-blue-50 border-blue-200 dark:bg-blue-950/30"}`}>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{a.pesan}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.node?.kode_node} • {new Date(a.created_at).toLocaleString("id-ID")}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.is_read ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" : "bg-white dark:bg-gray-900 border"}`}>{a.is_read ? "Dibaca" : "Baru"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
