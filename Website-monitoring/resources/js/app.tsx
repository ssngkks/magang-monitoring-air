import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { Layout } from "./components/Layout";

const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Signup = lazy(() => import("./pages/Signup").then((m) => ({ default: m.Signup })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Alerts = lazy(() => import("./pages/Alerts").then((m) => ({ default: m.Alerts })));
const Reports = lazy(() => import("./pages/Reports").then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const UserGuide = lazy(() => import("./pages/UserGuide").then((m) => ({ default: m.UserGuide })));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

function PageFallback() {
  return <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">Memuat...</div>;
}


function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Memuat...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Memuat...</div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><Suspense fallback={<PageFallback />}><Login /></Suspense></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><Suspense fallback={<PageFallback />}><Signup /></Suspense></PublicOnly>} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
          <Route path="alerts" element={<Suspense fallback={<PageFallback />}><Alerts /></Suspense>} />
          <Route path="reports" element={<Suspense fallback={<PageFallback />}><Reports /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
          <Route path="guide" element={<Suspense fallback={<PageFallback />}><UserGuide /></Suspense>} />
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

const el = document.getElementById("app");
if (el) {
  createRoot(el).render(<App />);
}
