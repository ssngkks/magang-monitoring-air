import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../context/LanguageContext";

type SettingsState = {
  emailNotifications: boolean;
  criticalAlerts: boolean;
  warningAlerts: boolean;
  infoAlerts: boolean;
  dailyReports: boolean;
  timezone: string;
  theme: string;
  autoRefresh: boolean;
  refreshInterval: number;
  phMin: number;
  phMax: number;
  tempMax: number;
  turbidityMax: number;
  waterMin: number;
  waterMax: number;
  dataRetention: number;
};

const defaults: SettingsState = {
  emailNotifications: true,
  criticalAlerts: true,
  warningAlerts: true,
  infoAlerts: false,
  dailyReports: false,
  timezone: "WIB",
  theme: "light",
  autoRefresh: true,
  refreshInterval: 10,
  phMin: 6.5,
  phMax: 8.5,
  tempMax: 28,
  turbidityMax: 1.5,
  waterMin: 80,
  waterMax: 130,
  dataRetention: 90,
};

export function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const [s, setS] = useState<SettingsState>(() => {
    const saved = localStorage.getItem("aqua_settings");
    if (saved) try { return { ...defaults, ...JSON.parse(saved) }; } catch {}
    return defaults;
  });
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem("aqua_refresh_interval", String(s.refreshInterval * 1000));
  }, [s.refreshInterval]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSave = () => {
    localStorage.setItem("aqua_settings", JSON.stringify(s));
    setSaved(true);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t.settings.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t.settings.subtitle}</p>
      </div>

      {/* Language — preserved as first section per original */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="font-semibold dark:text-white">{t.settings.language.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t.settings.language.description}</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setLanguage("id")} className={`px-4 py-2 rounded-lg border text-sm ${language === "id" ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-800 dark:border-gray-700"}`}>
            Indonesia 🇮🇩
          </button>
          <button onClick={() => setLanguage("en")} className={`px-4 py-2 rounded-lg border text-sm ${language === "en" ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-800 dark:border-gray-700"}`}>
            English 🇬🇧
          </button>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="font-semibold dark:text-white">{t.settings.notifications.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t.settings.notifications.description}</p>
        <div className="mt-3 space-y-2">
          {[
            { k: "emailNotifications", label: t.settings.notifications.email },
            { k: "criticalAlerts", label: t.settings.notifications.critical },
            { k: "warningAlerts", label: t.settings.notifications.warning },
            { k: "infoAlerts", label: t.settings.notifications.info },
            { k: "dailyReports", label: t.settings.notifications.daily },
          ].map((item) => (
            <label key={item.k} className="flex items-center gap-2 text-sm dark:text-gray-300">
              <input type="checkbox" checked={s[item.k as keyof SettingsState] as boolean} onChange={(e) => setS({ ...s, [item.k]: e.target.checked })} /> {item.label}
            </label>
          ))}
        </div>
      </div>

      {/* System Preferences */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="font-semibold dark:text-white">{t.settings.systemPreferences.title}</h3>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">{t.settings.systemPreferences.timezone}</label>
            <select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700">
              <option>WIB</option>
              <option>WITA</option>
              <option>WIT</option>
              <option>UTC</option>
            </select>
          </div>
          <div>
            <label className="text-sm">{t.settings.systemPreferences.theme}</label>
            <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.autoRefresh} onChange={(e) => setS({ ...s, autoRefresh: e.target.checked })} /> {t.settings.systemPreferences.autoRefresh}
          </label>
          {s.autoRefresh && (
            <div>
              <label className="text-sm">{t.settings.systemPreferences.refreshInterval}</label>
              <input type="number" min={5} max={60} value={s.refreshInterval} onChange={(e) => setS({ ...s, refreshInterval: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
            </div>
          )}
        </div>
      </div>

      {/* Alert Thresholds */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="font-semibold dark:text-white">{t.settings.thresholds.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t.settings.thresholds.description}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">{t.settings.thresholds.phMin}</label>
            <input type="number" step={0.1} value={s.phMin} onChange={(e) => setS({ ...s, phMin: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div>
            <label className="text-sm">{t.settings.thresholds.phMax}</label>
            <input type="number" step={0.1} value={s.phMax} onChange={(e) => setS({ ...s, phMax: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div>
            <label className="text-sm">{t.settings.thresholds.tempMax}</label>
            <input type="number" value={s.tempMax} onChange={(e) => setS({ ...s, tempMax: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div>
            <label className="text-sm">{t.settings.thresholds.turbidityMax}</label>
            <input type="number" step={0.1} value={s.turbidityMax} onChange={(e) => setS({ ...s, turbidityMax: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div>
            <label className="text-sm">{t.settings.thresholds.waterMin}</label>
            <input type="number" value={s.waterMin} onChange={(e) => setS({ ...s, waterMin: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div>
            <label className="text-sm">{t.settings.thresholds.waterMax}</label>
            <input type="number" value={s.waterMax} onChange={(e) => setS({ ...s, waterMax: Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="font-semibold dark:text-white">{t.settings.dataManagement.title}</h3>
        <div className="mt-3">
          <label className="text-sm">{t.settings.dataManagement.retention}</label>
          <input type="number" value={s.dataRetention} onChange={(e) => setS({ ...s, dataRetention: Number(e.target.value) })} className="mt-1 w-full max-w-xs h-9 rounded-lg border px-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => window.alert("Export semua data belum tersedia di backend. Gunakan export per node di Reports.")} className="px-4 py-2 rounded-lg border dark:border-gray-700 text-sm">
            {t.settings.dataManagement.export}
          </button>
        </div>
        <div className="mt-6 pt-4 border-t dark:border-gray-800">
          <h4 className="text-sm font-semibold text-red-600">{t.settings.dataManagement.dangerZone}</h4>
          <button onClick={() => window.alert("Clear Old Data dijalankan otomatis via scheduler backend (sensor-data:prune).")} className="mt-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm">
            {t.settings.dataManagement.clear}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
          {t.settings.save}
        </button>
        {saved && <span className="text-sm text-emerald-600">{t.settings.saved}</span>}
      </div>

      <p className="text-xs text-gray-400">Settings disimpan lokal di browser (localStorage). Untuk persistensi server, backend perlu endpoint tambahan.</p>
    </div>
  );
}
