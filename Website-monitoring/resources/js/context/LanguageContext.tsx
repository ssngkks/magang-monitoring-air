import React, { createContext, useContext, useEffect, useState } from "react";

type Language = "en" | "id";

type Translations = {
  nav: {
    dashboard: string;
    alerts: string;
    reports: string;
    settings: string;
    guide: string;
  };
  header: string;
  logout: string;
  settings: {
    title: string;
    subtitle: string;
    language: { title: string; description: string };
    notifications: { title: string; description: string; email: string; critical: string; warning: string; info: string; daily: string };
    systemPreferences: { title: string; timezone: string; theme: string; autoRefresh: string; refreshInterval: string };
    thresholds: { title: string; description: string; phMin: string; phMax: string; tempMax: string; turbidityMax: string; waterMin: string; waterMax: string };
    dataManagement: { title: string; retention: string; export: string; dangerZone: string; clear: string };
    save: string;
    saving: string;
    saved: string;
  };
};

const translations: Record<Language, Translations> = {
  en: {
    nav: {
      dashboard: "Dashboard",
      alerts: "Alerts & Notifications",
      reports: "Reports & Data",
      settings: "Settings",
      guide: "User Guide",
    },
    header: "Water Monitoring System",
    logout: "Logout",
    settings: {
      title: "Settings",
      subtitle: "Manage system preferences and configurations",
      language: { title: "Language", description: "Choose your preferred language" },
      notifications: {
        title: "Notification Settings",
        description: "Configure how you receive alerts",
        email: "Email Notifications",
        critical: "Critical Alerts",
        warning: "Warning Alerts",
        info: "Info Alerts",
        daily: "Daily Reports",
      },
      systemPreferences: {
        title: "System Preferences",
        timezone: "Timezone",
        theme: "Theme",
        autoRefresh: "Auto Refresh",
        refreshInterval: "Refresh Interval (seconds)",
      },
      thresholds: {
        title: "Alert Thresholds",
        description: "Set values that trigger alerts",
        phMin: "pH Minimum",
        phMax: "pH Maximum",
        tempMax: "Temperature Max (°C)",
        turbidityMax: "Turbidity Max (NTU)",
        waterMin: "Water Level Min (cm)",
        waterMax: "Water Level Max (cm)",
      },
      dataManagement: {
        title: "Data Management",
        retention: "Data Retention (days)",
        export: "Export All Data",
        dangerZone: "Danger Zone",
        clear: "Clear Old Data",
      },
      save: "Save Changes",
      saving: "Saving...",
      saved: "Settings saved",
    },
  },
  id: {
    nav: {
      dashboard: "Dasbor",
      alerts: "Peringatan & Notifikasi",
      reports: "Laporan & Data",
      settings: "Pengaturan",
      guide: "Panduan Pengguna",
    },
    header: "Sistem Pemantauan Air",
    logout: "Keluar",
    settings: {
      title: "Pengaturan",
      subtitle: "Kelola preferensi dan konfigurasi sistem",
      language: { title: "Bahasa", description: "Pilih bahasa yang Anda inginkan" },
      notifications: {
        title: "Pengaturan Notifikasi",
        description: "Atur cara Anda menerima peringatan",
        email: "Notifikasi Email",
        critical: "Peringatan Kritis",
        warning: "Peringatan Peringatan",
        info: "Peringatan Info",
        daily: "Laporan Harian",
      },
      systemPreferences: {
        title: "Preferensi Sistem",
        timezone: "Zona Waktu",
        theme: "Tema",
        autoRefresh: "Refresh Otomatis",
        refreshInterval: "Interval Refresh (detik)",
      },
      thresholds: {
        title: "Ambang Batas Peringatan",
        description: "Atur nilai yang memicu peringatan",
        phMin: "pH Minimum",
        phMax: "pH Maksimum",
        tempMax: "Suhu Maks (°C)",
        turbidityMax: "Kekeruhan Maks (NTU)",
        waterMin: "Level Air Min (cm)",
        waterMax: "Level Air Maks (cm)",
      },
      dataManagement: {
        title: "Manajemen Data",
        retention: "Retensi Data (hari)",
        export: "Ekspor Semua Data",
        dangerZone: "Zona Bahaya",
        clear: "Hapus Data Lama",
      },
      save: "Simpan Perubahan",
      saving: "Menyimpan...",
      saved: "Pengaturan tersimpan",
    },
  },
};

type LanguageContextValue = {
  language: Language;
  setLanguage: (l: Language) => void;
  t: Translations;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("aqua_language") as Language | null;
    return saved === "en" || saved === "id" ? saved : "id";
  });

  useEffect(() => {
    localStorage.setItem("aqua_language", language);
  }, [language]);

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t: translations[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
