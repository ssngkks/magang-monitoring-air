import { useState } from 'react';
import { Save } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export function Settings() {
  const { t } = useLanguage();
  const s = t.settings;

  const [settings, setSettings] = useState({
    phMin: 6.5,
    phMax: 8.5,
    temperatureMax: 28,
    turbidityMax: 1.5,
    waterLevelMin: 80,
    waterLevelMax: 130,
    dataRetention: 90,
    autoRefresh: true,
    refreshInterval: 5,
    timezone: 'WIB',
    theme: 'light',
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleChange = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800';

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">{s.title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{s.subtitle}</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer"
        >
          <Save className="h-5 w-5" />
          {s.save}
        </button>
      </div>

      {saved && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          {s.saved}
        </div>
      )}

      <div className="grid gap-6">
        {/* System Preferences */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.preferences.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{s.preferences.subtitle}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="timezone" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {s.preferences.timezone}
              </label>
              <select
                id="timezone"
                value={settings.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className={inputClass}
              >
                <option value="WIB">WIB (UTC+7)</option>
                <option value="WITA">WITA (UTC+8)</option>
                <option value="WIT">WIT (UTC+9)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label htmlFor="autoRefresh" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {s.preferences.autoRefresh}
              </label>
              <input
                id="autoRefresh"
                type="checkbox"
                checked={settings.autoRefresh}
                onChange={(e) => handleChange('autoRefresh', e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {settings.autoRefresh && (
              <div>
                <label htmlFor="refreshInterval" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.preferences.refreshInterval}
                </label>
                <input
                  id="refreshInterval"
                  type="number"
                  value={settings.refreshInterval}
                  onChange={(e) => handleChange('refreshInterval', parseInt(e.target.value))}
                  min="1"
                  max="60"
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.thresholds.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{s.thresholds.subtitle}</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phMin" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.thresholds.phMin}
                </label>
                <input
                  id="phMin"
                  type="number"
                  value={settings.phMin}
                  onChange={(e) => handleChange('phMin', parseFloat(e.target.value))}
                  step="0.1"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="phMax" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.thresholds.phMax}
                </label>
                <input
                  id="phMax"
                  type="number"
                  value={settings.phMax}
                  onChange={(e) => handleChange('phMax', parseFloat(e.target.value))}
                  step="0.1"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="temperatureMax" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.thresholds.temperatureMax}
                </label>
                <input
                  id="temperatureMax"
                  type="number"
                  value={settings.temperatureMax}
                  onChange={(e) => handleChange('temperatureMax', parseFloat(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="turbidityMax" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.thresholds.turbidityMax}
                </label>
                <input
                  id="turbidityMax"
                  type="number"
                  value={settings.turbidityMax}
                  onChange={(e) => handleChange('turbidityMax', parseFloat(e.target.value))}
                  step="0.1"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="waterLevelMin" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.thresholds.waterLevelMin}
                </label>
                <input
                  id="waterLevelMin"
                  type="number"
                  value={settings.waterLevelMin}
                  onChange={(e) => handleChange('waterLevelMin', parseFloat(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="waterLevelMax" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.thresholds.waterLevelMax}
                </label>
                <input
                  id="waterLevelMax"
                  type="number"
                  value={settings.waterLevelMax}
                  onChange={(e) => handleChange('waterLevelMax', parseFloat(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
