import { api } from "./client";

export type Node = {
  id: number;
  kode_node: string;
  nama_lokasi: string;
  status: string;
  is_online: boolean;
  last_seen_at: string | null;
};

export type NodesResponse = { data: Node[] };

export type SensorDataRow = {
  id: number;
  node: string;
  ph: number | null;
  temp: number | null;
  humidity: number | null;
  turbidity: number | null;
  water_level: number | null;
  vibration: boolean;
  ai_status: string;
  created_at: string;
};

export type SensorDataPaginated = {
  data: SensorDataRow[];
  meta: { current_page: number; last_page: number };
};

export const nodeApi = {
  list: () => api.get<NodesResponse>("/api/nodes"),
  create: (payload: { kode_node: string; nama_lokasi: string }) =>
    api.post<{ message: string; data: { id: number; kode_node: string; nama_lokasi: string; api_token: string } }>(
      "/api/nodes",
      payload,
    ),
  sensorData: (nodeId: number, params?: { from?: string; to?: string; per_page?: number; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.per_page) q.set("per_page", String(params.per_page));
    if (params?.page) q.set("page", String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : "";
    return api.get<SensorDataPaginated>(`/api/nodes/${nodeId}/sensor-data${qs}`);
  },
};
