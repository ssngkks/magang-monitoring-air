import { useState, useMemo } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Search, BookOpen } from "lucide-react";

type Article = { id: string; title: string; content: string };

const guides: Record<string, { category: string; articles: Article[] }[]> = {
  id: [
    {
      category: "Memulai",
      articles: [
        { id: "overview", title: "Ringkasan Sistem", content: "AquaMonitor adalah dashboard pemantauan kualitas air yang menampilkan pH, suhu, kelembapan, kekeruhan, level air, dan getaran dari node sensor. Data dikirim via Gateway LoRa ke backend Laravel (POST /api/sensor/store) kemudian ditampilkan real-time." },
        { id: "nav", title: "Navigasi Dasbor", content: "Gunakan sidebar untuk berpindah antara Dashboard, Peringatan, Laporan, Pengaturan, dan Panduan. Di Dashboard pilih node untuk melihat metric terbaru. Header menampilkan jam dan status vibration." },
        { id: "metrics", title: "Memahami Metrik", content: "pH ideal 6.5–8.5, turbidity warning >1.5 NTU critical >4 NTU, level air warning 80–130cm critical <60 atau >150cm, suhu maks 28°C. Warna hijau normal, kuning warning, merah critical." },
      ],
    },
    {
      category: "Peringatan & Notifikasi",
      articles: [
        { id: "types", title: "Jenis Peringatan", content: "Alert dibuat otomatis saat ai_status = Bahaya (critical) atau Anomali (warning) oleh SensorIngestService. Notifikasi dikirim via queue Telegram. Filter di halaman Alerts: All/Critical/Warning/Info dan pencarian pesan." },
        { id: "manage", title: "Mengelola Peringatan", content: "Klik Detail untuk melihat node dan pesan, lalu Tandai Dibaca (PATCH /api/alerts/{id}/read). Export CSV untuk analisis lanjutan. Tombol Take Action saat ini placeholder." },
      ],
    },
    {
      category: "Laporan & Data",
      articles: [
        { id: "view", title: "Melihat Laporan", content: "Pilih node dan rentang waktu (hari ini, 7/30 hari, 3 bulan, setahun, kustom). Data diambil dari GET /api/nodes/{id}/sensor-data dengan pagination. Gunakan aggregation hourly untuk histori panjang agar performa tetap cepat." },
        { id: "export", title: "Ekspor Data", content: "CSV fungsional di Reports & Alerts. PDF/Excel masih placeholder dan akan diimplementasikan sesuai kebutuhan. Jangan request jutaan row sekaligus, gunakan from/to." },
      ],
    },
    {
      category: "Pengaturan Sistem",
      articles: [
        { id: "thresholds", title: "Mengatur Ambang Batas", content: "Di Settings → Thresholds atur pH min/max, temp max, turbidity, level air. Saat ini disimpan di localStorage; untuk persistensi server butuh endpoint backend tambahan." },
        { id: "notif", title: "Preferensi Notifikasi", content: "Atur email, critical/warning/info, laporan harian, timezone, theme, auto refresh. Perubahan disimpan lokal dan langsung berlaku." },
      ],
    },
    {
      category: "Pemecahan Masalah",
      articles: [
        { id: "common", title: "Masalah Umum", content: "401 Unauthorized: token expired, login ulang. 403 Forbidden: node bukan milik user. Offline: cek last_seen_at dan koneksi gateway. Data kosong: cek retensi dan apakah node aktif." },
        { id: "help", title: "Mendapatkan Bantuan", content: "Hubungi admin, cek log Laravel (storage/logs), jalankan queue worker (php artisan queue:work) dan Reverb (php artisan reverb:start) untuk notifikasi & realtime." },
      ],
    },
  ],
  en: [
    {
      category: "Getting Started",
      articles: [
        { id: "overview", title: "System Overview", content: "AquaMonitor monitors pH, temperature, humidity, turbidity, water level, vibration from sensor nodes via LoRa Gateway to Laravel backend." },
        { id: "nav", title: "Dashboard Navigation", content: "Use sidebar to navigate. Select node to view latest metrics. Header shows time and vibration status." },
        { id: "metrics", title: "Understanding Metrics", content: "pH 6.5-8.5 normal, turbidity warning >1.5 critical >4, level warning 80-130 critical <60/>150, temp max 28°C." },
      ],
    },
    {
      category: "Alerts & Notifications",
      articles: [
        { id: "types", title: "Alert Types", content: "Alerts auto-created when ai_status=Bahaya (critical) or Anomali (warning). Telegram via queue." },
        { id: "manage", title: "Managing Alerts", content: "Detail view, mark read via PATCH /api/alerts/{id}/read, export CSV." },
      ],
    },
    {
      category: "Reports & Data",
      articles: [
        { id: "view", title: "Viewing Reports", content: "Select node and range, paginated API, hourly aggregation for long history." },
        { id: "export", title: "Exporting Data", content: "CSV works, PDF/Excel placeholder." },
      ],
    },
    {
      category: "System Settings",
      articles: [
        { id: "thresholds", title: "Configuring Thresholds", content: "Settings → Thresholds, stored locally for now." },
        { id: "notif", title: "Notification Preferences", content: "Configure email/critical/warning etc." },
      ],
    },
    {
      category: "Troubleshooting",
      articles: [
        { id: "common", title: "Common Issues", content: "401 re-login, 403 ownership, offline check last_seen_at, empty check retention." },
        { id: "help", title: "Getting Help", content: "Contact admin, check logs, ensure queue & reverb running." },
      ],
    },
  ],
};

export function UserGuide() {
  const { language } = useLanguage();
  const [activeId, setActiveId] = useState("overview");
  const [q, setQ] = useState("");

  const allArticles = useMemo(() => guides[language].flatMap((c) => c.articles.map((a) => ({ ...a, category: c.category }))), [language]);
  const filtered = useMemo(() => {
    if (!q) return guides[language];
    const low = q.toLowerCase();
    return guides[language]
      .map((cat) => ({ ...cat, articles: cat.articles.filter((a) => a.title.toLowerCase().includes(low) || a.content.toLowerCase().includes(low)) }))
      .filter((c) => c.articles.length > 0);
  }, [q, language]);

  const active = allArticles.find((a) => a.id === activeId) || allArticles[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 h-fit">
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari artikel..." className="w-full h-9 pl-8 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm" />
        </div>
        <div className="space-y-4">
          {filtered.map((cat) => (
            <div key={cat.category}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{cat.category}</p>
              <div className="space-y-1">
                {cat.articles.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setActiveId(a.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${activeId === a.id ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"}`}
                  >
                    <BookOpen className="w-4 h-4 shrink-0" /> {a.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-6">
        {active ? (
          <>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">{active.category}</p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{active.title}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 leading-relaxed whitespace-pre-wrap">{active.content}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">Tidak ada artikel</p>
        )}
      </div>
    </div>
  );
}
