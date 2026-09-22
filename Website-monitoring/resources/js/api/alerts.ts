import { api } from "./client";

export type Alert = {
  id: number;
  node_id: number;
  pesan: string;
  severity: "warning" | "critical" | string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  node?: { id: number; kode_node: string; nama_lokasi: string };
};

export type AlertPaginated = {
  data: Alert[];
  current_page: number;
  last_page: number;
  total?: number;
  per_page?: number;
};

export const alertApi = {
  list: (params?: { is_read?: boolean; per_page?: number; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.is_read !== undefined) q.set("is_read", params.is_read ? "1" : "0");
    if (params?.per_page) q.set("per_page", String(params.per_page));
    if (params?.page) q.set("page", String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : "";
    return api.get<AlertPaginated>(`/api/alerts${qs}`);
  },
  markRead: (id: number) => api.patch<{ data: Alert }>(`/api/alerts/${id}/read`),
};
