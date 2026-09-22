const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type ApiError = {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
};

function getToken(): string | null {
  return localStorage.getItem("aqua_token");
}

export function setToken(token: string) {
  localStorage.setItem("aqua_token", token);
}

export function clearToken() {
  localStorage.removeItem("aqua_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  // handle empty response (logout 200 with message)
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const errBody = body as Record<string, unknown> | null;
    const message =
      (errBody?.message as string) ||
      (errBody?.error as string) ||
      `Request failed (${res.status})`;
    const apiErr: ApiError = {
      message,
      status: res.status,
      errors: (errBody?.errors as Record<string, string[]>) || undefined,
    };
    // auto logout on 401
    if (res.status === 401) {
      clearToken();
      // only redirect if not already on login
      if (!window.location.pathname.includes("/login")) {
        // defer to allow caller to handle, but also dispatch event
        window.dispatchEvent(new CustomEvent("aqua:unauthorized"));
      }
    }
    throw apiErr;
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
