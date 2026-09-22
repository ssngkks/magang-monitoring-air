import { api } from "./client";

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  email_verified_at?: string | null;
};

export type AuthResponse = {
  message: string;
  data: { user: User; token: string };
};

export type MeResponse = {
  data: User;
};

export const authApi = {
  register: (payload: { name: string; email: string; password: string; password_confirmation: string }) =>
    api.post<AuthResponse>("/api/register", payload),
  login: (payload: { email: string; password: string }) =>
    api.post<AuthResponse>("/api/login", payload),
  logout: () => api.post<{ message: string }>("/api/logout"),
  me: () => api.get<MeResponse>("/api/me"),
};
