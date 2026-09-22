import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { authApi, User } from "../api/auth";
import { setToken, clearToken } from "../api/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, password_confirmation: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("aqua_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authApi.me();
      setUser(res.data);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const onUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener("aqua:unauthorized", onUnauthorized);
    return () => window.removeEventListener("aqua:unauthorized", onUnauthorized);
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setToken(res.data.token);
    setUser(res.data.user);
    (window as unknown as { refreshEchoAuth?: () => void }).refreshEchoAuth?.();
  };

  const register = async (name: string, email: string, password: string, password_confirmation: string) => {
    const res = await authApi.register({ name, email, password, password_confirmation });
    setToken(res.data.token);
    setUser(res.data.user);
    (window as unknown as { refreshEchoAuth?: () => void }).refreshEchoAuth?.();
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      clearToken();
      setUser(null);
      (window as unknown as { refreshEchoAuth?: () => void }).refreshEchoAuth?.();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
