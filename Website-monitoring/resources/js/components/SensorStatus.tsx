import { memo } from "react";
import { Node } from "../api/nodes";
import { SensorDataRow } from "../api/nodes";

type Props = {
  nodes: Node[];
  latestDataMap: Map<number, SensorDataRow>;
};

export const SensorStatus = memo(function SensorStatus({ nodes, latestDataMap }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Belum ada node. Tambahkan node untuk mulai monitoring.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {nodes.map((node) => {
        const latest = latestDataMap.get(node.id);
        const isOnline = node.is_online;
        return (
          <div
            key={node.id}
            className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{node.kode_node}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{node.nama_lokasi}</p>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  isOnline
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>

            {latest ? (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-gray-500 dark:text-gray-400">pH</p>
                  <p className="font-bold text-gray-900 dark:text-white">{latest.ph ?? "-"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-gray-500 dark:text-gray-400">Suhu</p>
                  <p className="font-bold text-gray-900 dark:text-white">{latest.temp != null ? `${latest.temp}°C` : "-"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-gray-500 dark:text-gray-400">Turbidity</p>
                  <p className="font-bold text-gray-900 dark:text-white">{latest.turbidity ?? "-"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-gray-500 dark:text-gray-400">Level</p>
                  <p className="font-bold text-gray-900 dark:text-white">{latest.water_level ?? "-"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-gray-500 dark:text-gray-400">Kelembapan</p>
                  <p className="font-bold text-gray-900 dark:text-white">{latest.humidity != null ? `${latest.humidity}%` : "-"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-gray-500 dark:text-gray-400">Getaran</p>
                  <p className={`font-bold ${latest.vibration ? "text-red-600" : "text-emerald-600"}`}>
                    {latest.vibration ? "Terdeteksi" : "Normal"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">Belum ada data sensor</p>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
              Last seen: {node.last_seen_at ? new Date(node.last_seen_at).toLocaleString("id-ID") : "Belum pernah"}
            </p>

            {latest && (
              <div className={`mt-2 text-xs px-2 py-1 rounded-md text-center font-medium border ${
                latest.ai_status === "Bahaya"
                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                  : latest.ai_status === "Anomali"
                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
              }`}>
                AI: {latest.ai_status}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
