import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { NodeProvider } from '../context/NodeContext';
import {
  LayoutDashboard,
  Activity,
  Brain,
  Bell,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Camera,
  Cpu,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { DefaultAvatarIcon } from './DefaultAvatarIcon';

interface ProfileData {
  name: string;
  avatar: string;
}

export function Layout() {
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const location = useLocation();
  const isDashboardSectionActive = ['/', '/water-quality', '/environment', '/physical'].includes(location.pathname);

  const dashboardSubItems = [
    { path: '/water-quality', label: 'Kualitas Air' },
    { path: '/environment', label: 'Lingkungan' },
    { path: '/physical', label: 'Fisik Tandon' },
  ];

  /* =========================
     PROFILE — tersimpan ke Firebase (Firestore users),
     localStorage hanya sebagai cache agar tetap tampil saat offline.
     Alur: Upload -> kompres client -> PUT /api/me/profile
     -> Firestore users.{uid}.avatar -> api.me() saat refresh/login.
  ========================= */
  const [profile, setProfile] = useState<ProfileData>({
    name: user?.name || 'Administrator',
    avatar: user?.avatar || '',
  });

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [editName, setEditName] = useState(
    user?.name || 'Administrator'
  );

  const [editAvatar, setEditAvatar] = useState(user?.avatar || '');

  /* =========================
     AUTH CHECK
  ========================= */
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  /* =========================
     LOAD PROFILE — Firebase dulu, fallback cache lokal
  ========================= */
  useEffect(() => {
    let cancelled = false;

    const loadFromFirebase = async () => {
      try {
        const { data } = await api.me();
        if (cancelled || !data) return;
        const firebaseAvatar = (data as any).avatar || (data as any).photo_url || '';
        const firebaseName = data.name || '';
        if (firebaseAvatar || firebaseName) {
          const next: ProfileData = {
            name: firebaseName || profile.name,
            avatar: firebaseAvatar || profile.avatar,
          };
          setProfile(next);
          setEditName(next.name);
          setEditAvatar(next.avatar);
          localStorage.setItem('aqua_profile', JSON.stringify(next));
          return;
        }
      } catch {
        // Abaikan — gunakan cache lokal di bawah
      }

      try {
        const savedProfile = localStorage.getItem('aqua_profile');
        if (savedProfile && !cancelled) {
          const parsedProfile: ProfileData = JSON.parse(savedProfile);
          setProfile(parsedProfile);
          setEditName(parsedProfile.name);
          setEditAvatar(parsedProfile.avatar);
        }
      } catch (error) {
        console.error('Gagal membaca data profil:', error);
      }
    };

    if (isAuthenticated) loadFromFirebase();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Sinkronkan nama/avatar dari AuthContext (hasil login) ke header
  useEffect(() => {
    if (user?.name) setProfile((p) => ({ ...p, name: user.name as string }));
    if (user?.avatar) setProfile((p) => ({ ...p, avatar: user.avatar as string }));
  }, [user?.name, user?.avatar]);

  /* =========================
     NOTIFICATIONS UNREAD STATE
  ========================= */
  const [unreadAlertCount, setUnreadAlertCount] = useState<number>(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;

    const checkUnreadAlerts = async () => {
      try {
        const response = await api.alerts('is_read=0&per_page=1');
        if (isMounted) {
          const count = response?.meta?.total ?? (response?.data ? response.data.length : 0);
          setUnreadAlertCount(count);
        }
      } catch (error) {
        // Silently ignore poll errors
      }
    };

    checkUnreadAlerts();
    const interval = setInterval(checkUnreadAlerts, 15000);

    const handleAlertsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ unreadCount?: number }>;
      if (typeof customEvent.detail?.unreadCount === 'number') {
        setUnreadAlertCount(customEvent.detail.unreadCount);
      } else {
        checkUnreadAlerts();
      }
    };

    window.addEventListener('alerts-updated', handleAlertsUpdated);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('alerts-updated', handleAlertsUpdated);
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <span className="text-xs font-medium text-gray-500">{t.common.loading}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  /* =========================
     LOGOUT (UNCHANGED)
  ========================= */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /* =========================
     OPEN EDIT PROFILE (UNCHANGED)
  ========================= */
  const handleOpenEditProfile = () => {
    setEditName(profile.name);
    setEditAvatar(profile.avatar);
    setEditProfileOpen(true);
  };

  /* =========================
     IMAGE UPLOAD — kompres client agar aman disimpan di Firestore (<700KB)
  ========================= */
  const handleAvatarChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Silakan pilih file gambar.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran foto maksimal 5 MB.');
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setEditAvatar(compressed);
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') setEditAvatar(reader.result);
        };
        reader.readAsDataURL(file);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setEditAvatar(reader.result);
      };
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  };

  /* =========================
     SAVE PROFILE — ke Firebase, fallback cache lokal
  ========================= */
  const handleSaveProfile = async () => {
    const trimmedName = editName.trim();

    if (!trimmedName) {
      alert('Nama tidak boleh kosong.');
      return;
    }

    const newProfile: ProfileData = {
      name: trimmedName,
      avatar: editAvatar,
    };

    setIsSavingProfile(true);
    try {
      const { data } = await api.updateProfile({ name: trimmedName, avatar: editAvatar || null });
      const saved: ProfileData = {
        name: (data as any)?.name || trimmedName,
        avatar: (data as any)?.avatar || (data as any)?.photo_url || editAvatar,
      };
      setProfile(saved);
      localStorage.setItem('aqua_profile', JSON.stringify(saved));
    } catch (error) {
      // Fallback: backend/Firebase belum siap — simpan sebagai cache lokal
      console.warn('Gagal menyimpan ke Firebase, gunakan cache lokal:', error);
      setProfile(newProfile);
      localStorage.setItem('aqua_profile', JSON.stringify(newProfile));
    } finally {
      setIsSavingProfile(false);
      setEditProfileOpen(false);
    }
  };

  /* =========================
     MENU — tepat 6 menu utama.
     Kualitas Air & Kondisi Lingkungan tetap ada via Dashboard,
     tidak menjadi item sidebar (sesuai revisi).
  ========================= */
  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/nodes', icon: Activity, label: 'Monitoring Nodes' },
    { path: '/ai-analytics', icon: Brain, label: t.nav.aiAnalytics },
    { path: '/devices', icon: Cpu, label: 'Perangkat & Sensor' },
    { path: '/alerts', icon: Bell, label: t.nav.alerts },
    { path: '/reports', icon: FileText, label: t.nav.reports },
    { path: '/settings', icon: Settings, label: t.nav.settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* =========================================
          SIDEBAR (DESKTOP)
      ========================================= */}
      <aside
        id="app-sidebar"
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } hidden transition-all duration-300 lg:flex lg:flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900`}
      >

        {/* Logo + Toggle Button */}
        <div
          className={`flex h-16 items-center border-b border-gray-200 dark:border-gray-800 ${
            sidebarOpen ? 'justify-between px-4' : 'justify-center px-2'
          }`}
        >
          {sidebarOpen && (
            <div className="flex items-center px-3">
              <span className="text-lg font-bold text-gray-900 dark:text-white select-none cursor-default leading-none">
                AquaMonitor
              </span>
            </div>
          )}

          {/* Redesigned toggle button — Part 5 spec */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            className="flex h-8 w-9 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:bg-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:active:bg-gray-700"
          >
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-current opacity-30" />
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* Navigation — 6 menu utama, Dashboard punya submenu teks */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {/* Item Dashboard + chevron submenu (submenu hanya saat sidebar terbuka) */}
          <div>
            <div
              className={`flex items-center gap-1 rounded-lg pr-1 transition-all ${
                isDashboardSectionActive
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <NavLink
                to="/"
                end
                className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <LayoutDashboard
                  className={`h-5 w-5 flex-shrink-0 ${
                    isDashboardSectionActive ? 'text-blue-600 dark:text-blue-400' : ''
                  }`}
                />
                {sidebarOpen && (
                  <span className="font-medium">Dashboard</span>
                )}
              </NavLink>
              {sidebarOpen && (
                <button
                  type="button"
                  onClick={() => setDashboardExpanded((prev) => !prev)}
                  aria-label={dashboardExpanded ? 'Sembunyikan submenu Dashboard' : 'Tampilkan submenu Dashboard'}
                  aria-expanded={dashboardExpanded}
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${dashboardExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>
            {sidebarOpen && dashboardExpanded && (
              <div className="ml-2 mt-1 space-y-1">
                {dashboardSubItems.map((sub) => (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg py-2 pl-11 pr-3 text-sm transition-all ${
                        isActive
                          ? 'bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`
                    }
                  >
                    <span>{sub.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {menuItems
            .filter((item) => item.path !== '/')
            .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`h-5 w-5 flex-shrink-0 ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : ''
                    }`}
                  />
                  {sidebarOpen && (
                    <span className="font-medium">{item.label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* =========================================
            SIDEBAR BOTTOM — LOGOUT ONLY
            (Avatar/nama/role dan Edit Profil DIHAPUS dari sini — Part 6 & 8)
        ========================================= */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          {sidebarOpen ? (
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-medium">{t.logout}</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="flex w-full items-center justify-center rounded-lg bg-red-50 p-2 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          )}
        </div>

      </aside>

      {/* =========================================
          MOBILE MENU
      ========================================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">

          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />

          <aside className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl dark:bg-gray-900">

            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
              <div className="flex items-center px-3">
                <span className="text-lg font-bold text-gray-900 dark:text-white select-none cursor-default leading-none">
                  AquaMonitor
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="space-y-1 overflow-y-auto p-4">
              {/* Dashboard + submenu (drawer selalu penuh) */}
              <div>
                <div
                  className={`flex items-center gap-1 rounded-lg pr-1 transition-all ${
                    isDashboardSectionActive
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <NavLink
                    to="/"
                    end
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5"
                  >
                    <LayoutDashboard
                      className={`h-5 w-5 flex-shrink-0 ${
                        isDashboardSectionActive ? 'text-blue-600 dark:text-blue-400' : ''
                      }`}
                    />
                    <span className="font-medium">Dashboard</span>
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => setDashboardExpanded((prev) => !prev)}
                    aria-label={dashboardExpanded ? 'Sembunyikan submenu Dashboard' : 'Tampilkan submenu Dashboard'}
                    aria-expanded={dashboardExpanded}
                    className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${dashboardExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
                {dashboardExpanded && (
                  <div className="ml-2 mt-1 space-y-1">
                    {dashboardSubItems.map((sub) => (
                      <NavLink
                        key={sub.path}
                        to={sub.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center rounded-lg py-2 pl-11 pr-3 text-sm transition-all ${
                            isActive
                              ? 'bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                          }`
                        }
                      >
                        <span>{sub.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>

              {menuItems
                .filter((item) => item.path !== '/')
                .map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Mobile bottom — LOGOUT ONLY (avatar/nama-role + Edit Profil dihapus) */}
            <div className="absolute bottom-0 w-full border-t border-gray-200 p-4 dark:border-gray-800">
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Logout"
                className="flex w-full items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
              >
                <LogOut className="h-4 w-4" />
                <span className="font-medium">{t.logout}</span>
              </button>
            </div>

          </aside>

        </div>
      )}

      {/* =========================================
          MAIN CONTENT
      ========================================= */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 dark:border-gray-800 dark:bg-gray-900 lg:px-8 shrink-0">

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="hidden lg:block">
            <h2 className="text-xl font-semibold">{t.header.title}</h2>
          </div>

          {/* Header Right: Notification + Profile (Part 6 & 7) */}
          <div className="flex items-center gap-4">

            <NavLink
              to="/alerts"
              aria-label="Notifications"
              className="relative rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Bell className="h-5 w-5" />
            </NavLink>

            {/* Profile Icon + Dropdown — tampil di SEMUA breakpoint */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Buka menu profil untuk ${profile.name}`}
                  className="flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 select-none"
                >
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.name}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                      <DefaultAvatarIcon className="h-5 w-5" />
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-56 rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900"
              >
                <DropdownMenuLabel className="px-2 py-1.5">
                  <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                    {profile.name}
                  </span>
                  <span className="block truncate text-xs font-normal text-gray-500 dark:text-gray-400">
                    {user?.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1 h-px bg-gray-200 dark:bg-gray-800" />
                <DropdownMenuItem
                  onSelect={handleOpenEditProfile}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-gray-700 outline-none hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:bg-gray-800"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Profil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-gray-950 min-w-0">
          <NodeProvider>
            <Outlet />
          </NodeProvider>
        </main>

      </div>

      {/* =========================================
          EDIT PROFILE MODAL (UNCHANGED)
      ========================================= */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">

            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Edit Profil
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Ubah nama dan foto profil kamu
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditProfileOpen(false)}
                aria-label="Tutup"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6 flex flex-col items-center">
              <div className="relative">
                {editAvatar ? (
                  <img
                    src={editAvatar}
                    alt="Preview profil"
                    className="h-28 w-28 rounded-full border-4 border-gray-100 object-cover shadow-sm dark:border-gray-800"
                  />
                ) : (
                  <span className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-gray-100 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-500">
                    <DefaultAvatarIcon className="h-16 w-16" />
                  </span>
                )}
                <label
                  htmlFor="profile-photo"
                  className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition-colors hover:bg-blue-700"
                >
                  <Camera className="h-4 w-4" />
                  <input
                    id="profile-photo"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Klik ikon kamera untuk mengganti foto
              </p>
              <p className="text-xs text-gray-400">
                Foto tersimpan ke Firebase, tetap tampil setelah refresh/login
              </p>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Nama
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Masukkan nama"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditProfileOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {isSavingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}