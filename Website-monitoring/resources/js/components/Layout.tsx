import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  LayoutDashboard,
  Bell,
  FileText,
  Settings,
  BookOpen,
  LogOut,
  Droplets,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";

const navItems = (t: ReturnType<typeof useLanguage>["t"]) => [
  { path: "/", label: t.nav.dashboard, icon: LayoutDashboard },
  { path: "/alerts", label: t.nav.alerts, icon: Bell },
  { path: "/reports", label: t.nav.reports, icon: FileText },
  { path: "/settings", label: t.nav.settings, icon: Settings },
  { path: "/guide", label: t.nav.guide, icon: BookOpen },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("aqua_sidebar_collapsed") === "1");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [profileOverride, setProfileOverride] = useState<{ name?: string; photo?: string } | null>(() => {
    try {
      const raw = localStorage.getItem("aqua_profile");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("aqua_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (user) setEditName(profileOverride?.name ?? user.name);
    if (profileOverride?.photo) setEditPhoto(profileOverride.photo);
  }, [user, profileOverride]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = (profileOverride?.name ?? user?.name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const dicebearUrl = user?.email ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email)}` : null;
  const avatarSrc = profileOverride?.photo || dicebearUrl || null;

  const handleSaveProfile = () => {
    const data = { name: editName.trim() || user?.name || "", photo: editPhoto || profileOverride?.photo || "" };
    localStorage.setItem("aqua_profile", JSON.stringify(data));
    setProfileOverride(data);
    setEditOpen(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("File harus berupa gambar");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      window.alert("Maksimal 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0b1220] flex">
      {/* Desktop sidebar — collapsible */}
      <aside className={`hidden lg:flex shrink-0 flex-col border-r bg-white dark:bg-gray-900 dark:border-gray-800 transition-all duration-200 ${collapsed ? "w-[72px]" : "w-64"}`}>
        <div className="h-16 flex items-center gap-2 px-3 border-b dark:border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-none text-gray-900 dark:text-white">AquaMonitor</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Water Monitoring</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems(t).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t dark:border-gray-800">
          <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? "justify-center" : ""}`}>
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-8 h-8 rounded-full object-cover bg-white border dark:border-gray-700" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{profileOverride?.name ?? user?.name}</p>
                <p className="text-xs truncate text-gray-500 dark:text-gray-400">{user?.email}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 capitalize">{user?.role}</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={() => setEditOpen(true)}
              className="mt-1 w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 border dark:border-gray-700"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Profil
            </button>
          )}
          <button
            onClick={handleLogout}
            className={`mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? t.logout : undefined}
          >
            <LogOut className="w-4 h-4" /> {!collapsed && t.logout}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 w-64 h-full bg-white dark:bg-gray-900 flex flex-col">
            <div className="h-16 flex items-center justify-between px-5 border-b dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <Droplets className="w-5 h-5" />
                </div>
                <span className="font-bold text-gray-900 dark:text-white">AquaMonitor</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems(t).map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                      active ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <item.icon className="w-[18px] h-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t dark:border-gray-800">
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                <LogOut className="w-4 h-4" /> {t.logout}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 flex items-center justify-between px-4 lg:px-6 border-b bg-white dark:bg-gray-900 dark:border-gray-800 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white hidden sm:block">{t.header}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/alerts" className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </Link>

            <div className="relative">
              <button onClick={() => setProfileOpen(!profileOpen)} className="w-8 h-8 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                {avatarSrc ? <img src={avatarSrc} alt="avatar" className="w-8 h-8 object-cover" /> : initials}
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 shadow-lg p-3">
                  <div className="flex items-center gap-3">
                    {avatarSrc ? <img src={avatarSrc} alt="avatar" className="w-8 h-8 rounded-full object-cover border dark:border-gray-700" /> : <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{initials}</div>}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{profileOverride?.name ?? user?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t dark:border-gray-800 space-y-1">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        setEditOpen(true);
                      }}
                      className="w-full text-left text-sm flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Pencil className="w-4 h-4" /> Edit Profil
                    </button>
                    <button onClick={handleLogout} className="w-full text-left text-sm flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      <LogOut className="w-4 h-4" /> {t.logout}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 bg-[#f8fafc] dark:bg-[#0b1220] overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Edit Profil Modal — preserved from original (localStorage aqua_profile, 2MB, image type) */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-lg border dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white">Edit Profil</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ubah nama & foto (max 2MB, disimpan lokal).</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                {editPhoto ? (
                  <img src={editPhoto} alt="preview" className="w-12 h-12 rounded-full object-cover border dark:border-gray-700" />
                ) : avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="w-12 h-12 rounded-full object-cover border dark:border-gray-700" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{initials}</div>
                )}
                <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg border dark:border-gray-700 text-xs">
                  Pilih Foto
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Nama</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white" placeholder="Nama" />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={handleSaveProfile} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Simpan</button>
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg border dark:border-gray-700 text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
