import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Play,
  Download,
  Search,
  AlertCircle,
  BarChart3,
  Settings,
  Bell,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

type Language = 'en' | 'id';

interface GuideArticle {
  id: string;
  title: string;
  content: string;
}

interface GuideCategory {
  id: string;
  title: string;
  icon: typeof Play;
  articles: GuideArticle[];
}

const guideContent = {
  en: {
    pageTitle: 'User Guide',
    pageSubtitle: 'Help & Documentation',
    searchPlaceholder: 'Search articles...',
    downloadManual: 'Download PDF Manual',
    helpful: 'Was this article helpful?',
    helpfulDescription: 'Let us know if you need more information',
    yes: 'Yes',
    no: 'No',
    noArticles: 'No articles found',
    noArticlesDescription: 'Try adjusting your search query',

    categories: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        icon: Play,
        articles: [
          {
            id: '1',
            title: 'System Overview',
            content: `The AquaMonitor Water Monitoring System provides real-time monitoring and analytics for water distribution networks.

Key features include:
• Real-time flow rate and pressure monitoring
• Water quality tracking (pH, temperature, turbidity)
• Automated alert system for anomalies
• Historical data analysis and reporting
• Multi-sensor network management

The dashboard provides an at-a-glance view of your entire water system, with customizable metrics and visualizations to help you make informed decisions.`,
          },
          {
            id: '2',
            title: 'Dashboard Navigation',
            content: `Navigate through the system using the sidebar menu:

• Dashboard: Main overview with real-time metrics and charts
• Alerts: View and manage system notifications
• Reports: Access historical data and export reports
• Settings: Configure system preferences and thresholds
• User Guide: Access this help documentation

The top bar shows your current status, last update time, and quick access to notifications. Click on any metric card to view detailed information.`,
          },
          {
            id: '3',
            title: 'Understanding Metrics',
            content: `The system monitors six key metrics:

1. Flow Rate (L/s): Water flow through the system
   - Normal range: 85-105 L/s
   - Alerts triggered if outside range

2. Pressure (bar): System pressure levels
   - Optimal range: 4.0-5.5 bar
   - Critical below 3.5 or above 6.0 bar

3. pH Level: Water acidity/alkalinity
   - Safe range: 6.5-8.5
   - Ideal: 7.0-7.5

4. Temperature (°C): Water temperature
   - Normal range: 15-25°C
   - Alert if exceeds 28°C

5. Turbidity (NTU): Water clarity
   - Acceptable: <1.0 NTU
   - Action required if >1.5 NTU

6. Daily Usage (m³): Total water consumption
   - Tracked hourly and daily
   - Trends analyzed for optimization`,
          },
        ],
      },
      {
        id: 'alerts',
        title: 'Alerts & Notifications',
        icon: Bell,
        articles: [
          {
            id: '4',
            title: 'Alert Types',
            content: `The system generates four types of alerts:

Critical (Red): Immediate action required
- System failures
- Values far outside safe ranges
- Sensor disconnections
- Emergency situations

Warning (Yellow): Attention needed
- Values approaching thresholds
- Irregular patterns detected
- Performance degradation

Info (Blue): Informational messages
- Scheduled maintenance
- System updates
- Configuration changes

Success (Green): Positive confirmations
- Issues resolved
- Systems normalized
- Maintenance completed

Configure which alerts you receive in Settings > Notifications.`,
          },
          {
            id: '5',
            title: 'Managing Alerts',
            content: `To manage alerts effectively:

1. Click on any alert to view full details
2. Use filters to show specific alert types
3. Search alerts by location or message
4. Click "Dismiss" to remove resolved alerts
5. Click "Take Action" for recommended responses

Export alerts:
- Use the Export button for CSV download
- Includes all alert history with timestamps
- Useful for compliance reporting

Alert notifications can be sent via:
• Email (configurable in Settings)
• In-app notifications (bell icon)
• Daily summary reports`,
          },
        ],
      },
      {
        id: 'reports',
        title: 'Reports & Data',
        icon: BarChart3,
        articles: [
          {
            id: '6',
            title: 'Viewing Reports',
            content: `Access comprehensive reports in the Reports section:

Report Types:
• System Overview: Complete system performance
• Water Consumption: Usage patterns and trends
• Water Quality: pH, temperature, turbidity trends
• System Performance: Efficiency and uptime metrics
• Alert History: Historical alert data

Date Ranges:
- Today: Current day data
- Last 7 Days: Weekly trends
- Last 30 Days: Monthly overview
- Last 3 Months: Quarterly analysis
- Last Year: Annual trends
- Custom Range: Select specific dates

View Modes:
• Charts: Visual graphs and charts
• Table: Detailed data in tabular format`,
          },
          {
            id: '7',
            title: 'Exporting Data',
            content: `Export data in multiple formats:

CSV (Comma-Separated Values):
- Compatible with Excel, Google Sheets
- Best for data analysis
- Includes all visible data points
- Click "CSV" button to download

PDF (Portable Document Format):
- Print-ready reports
- Professional formatting
- Includes charts and graphs
- Ideal for presentations

Excel (Microsoft Excel):
- Pre-formatted spreadsheets
- Advanced formulas included
- Multiple worksheets
- Charts embedded

All exports include:
• Date/time stamps
• All selected metrics
• Sensor locations
• Calculated averages
• Trend indicators`,
          },
        ],
      },
      {
        id: 'settings',
        title: 'System Settings',
        icon: Settings,
        articles: [
          {
            id: '8',
            title: 'Configuring Thresholds',
            content: `Set custom alert thresholds in Settings:

Flow Rate:
- Minimum: Set lower acceptable limit
- Maximum: Set upper acceptable limit
- Alerts trigger when values go outside range

Pressure:
- Min/Max values in bar
- Critical thresholds for safety

pH Level:
- Safe range typically 6.5-8.5
- Optimal range 7.0-7.5

Temperature:
- Maximum safe temperature
- Seasonal adjustments recommended

Turbidity:
- Maximum acceptable clarity level
- Regulatory compliance thresholds

Click "Save Changes" to apply new settings.
Changes take effect immediately.`,
          },
          {
            id: '9',
            title: 'Notification Preferences',
            content: `Customize your notification settings:

Email Notifications:
- Enable/disable email alerts
- Specify email addresses
- Set frequency (immediate/digest)

Alert Types:
✓ Critical Alerts: Always recommended
✓ Warning Alerts: For proactive monitoring
□ Info Alerts: Optional, can be noisy
✓ Daily Reports: Useful for record-keeping

System Preferences:
• Language: Select interface language
• Timezone: Match your location
• Theme: Light, Dark, or Auto
• Auto Refresh: Update frequency
• Refresh Interval: 1-60 seconds

Data Management:
- Set data retention period (30-365 days)
- Export historical data
- Clear old data to save space`,
          },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        icon: AlertCircle,
        articles: [
          {
            id: '10',
            title: 'Common Issues',
            content: `Solutions to common problems:

Sensor Not Responding:
1. Check sensor power supply
2. Verify network connection
3. Check sensor calibration date
4. Contact technical support

Inaccurate Readings:
1. Sensor may need recalibration
2. Check for physical obstructions
3. Verify sensor placement
4. Review maintenance logs

Dashboard Not Updating:
1. Check internet connection
2. Refresh browser (F5)
3. Clear browser cache
4. Verify auto-refresh is enabled

Data Export Failing:
1. Check file permissions
2. Ensure sufficient storage space
3. Try different export format
4. Reduce date range

Login Issues:
1. Verify credentials
2. Check CAPS lock
3. Reset password if needed
4. Clear browser cookies`,
          },
          {
            id: '11',
            title: 'Getting Help',
            content: `Additional support resources:

Technical Support:
📧 Email: support@aquamonitor.com
📞 Phone: 1-800-AQUA-HELP
🕐 Hours: 24/7 availability

Documentation:
• User Manual (PDF): Download from Reports
• Video Tutorials: Available on website
• API Documentation: For integrations
• FAQ: Common questions answered

Training:
- Online webinars (monthly)
- On-site training available
- Certification programs
- Best practices workshops

Community:
• User forums
• Knowledge base
• Case studies
• Feature requests

Emergency Contacts:
For critical system failures:
📞 Emergency Hotline: 1-800-911-AQUA
🚨 Available 24/7/365`,
          },
        ],
      },
    ],
  },

  id: {
    pageTitle: 'Panduan Pengguna',
    pageSubtitle: 'Bantuan & Dokumentasi',
    searchPlaceholder: 'Cari artikel...',
    downloadManual: 'Unduh Manual PDF',
    helpful: 'Apakah artikel ini membantu?',
    helpfulDescription: 'Beri tahu kami jika Anda membutuhkan informasi lebih lanjut',
    yes: 'Ya',
    no: 'Tidak',
    noArticles: 'Artikel tidak ditemukan',
    noArticlesDescription: 'Coba ubah kata pencarian Anda',

    categories: [
      {
        id: 'getting-started',
        title: 'Memulai',
        icon: Play,
        articles: [
          {
            id: '1',
            title: 'Gambaran Umum Sistem',
            content: `Sistem Pemantauan Air AquaMonitor menyediakan pemantauan dan analisis secara real-time untuk jaringan distribusi air.

Fitur utama meliputi:
• Pemantauan laju aliran dan tekanan secara real-time
• Pemantauan kualitas air (pH, suhu, kekeruhan)
• Sistem peringatan otomatis untuk kondisi tidak normal
• Analisis dan pelaporan data historis
• Manajemen jaringan multi-sensor

Dashboard memberikan tampilan menyeluruh mengenai sistem air Anda, dengan metrik dan visualisasi yang dapat disesuaikan untuk membantu Anda mengambil keputusan.`,
          },
          {
            id: '2',
            title: 'Navigasi Dashboard',
            content: `Navigasikan sistem menggunakan menu sidebar:

• Dashboard: Tampilan utama dengan metrik dan grafik secara real-time
• Peringatan: Melihat dan mengelola notifikasi sistem
• Laporan: Mengakses data historis dan mengekspor laporan
• Pengaturan: Mengatur preferensi sistem dan batas ambang
• Panduan Pengguna: Mengakses dokumentasi bantuan ini

Bilah atas menampilkan status saat ini, waktu pembaruan terakhir, dan akses cepat ke notifikasi. Klik kartu metrik untuk melihat informasi lebih rinci.`,
          },
          {
            id: '3',
            title: 'Memahami Metrik',
            content: `Sistem memantau enam metrik utama:

1. Laju Aliran (L/s): Aliran air melalui sistem
   - Rentang normal: 85-105 L/s
   - Peringatan muncul jika berada di luar rentang

2. Tekanan (bar): Tingkat tekanan sistem
   - Rentang optimal: 4.0-5.5 bar
   - Kritis jika di bawah 3.5 atau di atas 6.0 bar

3. Level pH: Tingkat keasaman/kebasaan air
   - Rentang aman: 6.5-8.5
   - Ideal: 7.0-7.5

4. Suhu (°C): Suhu air
   - Rentang normal: 15-25°C
   - Peringatan jika melebihi 28°C

5. Kekeruhan (NTU): Tingkat kejernihan air
   - Dapat diterima: <1.0 NTU
   - Perlu tindakan jika >1.5 NTU

6. Penggunaan Harian (m³): Total konsumsi air
   - Dicatat setiap jam dan setiap hari
   - Tren dianalisis untuk optimalisasi`,
          },
        ],
      },
      {
        id: 'alerts',
        title: 'Peringatan & Notifikasi',
        icon: Bell,
        articles: [
          {
            id: '4',
            title: 'Jenis Peringatan',
            content: `Sistem menghasilkan empat jenis peringatan:

Kritis (Merah): Tindakan segera diperlukan
- Kegagalan sistem
- Nilai jauh di luar rentang aman
- Sensor terputus
- Situasi darurat

Peringatan (Kuning): Perlu perhatian
- Nilai mendekati batas ambang
- Pola tidak teratur terdeteksi
- Penurunan kinerja

Info (Biru): Pesan informasi
- Pemeliharaan terjadwal
- Pembaruan sistem
- Perubahan konfigurasi

Berhasil (Hijau): Konfirmasi positif
- Masalah telah diselesaikan
- Sistem kembali normal
- Pemeliharaan telah selesai

Atur jenis peringatan yang Anda terima melalui Pengaturan > Notifikasi.`,
          },
          {
            id: '5',
            title: 'Mengelola Peringatan',
            content: `Untuk mengelola peringatan secara efektif:

1. Klik peringatan untuk melihat detail lengkap
2. Gunakan filter untuk menampilkan jenis peringatan tertentu
3. Cari peringatan berdasarkan lokasi atau pesan
4. Klik "Abaikan" untuk menghapus peringatan yang sudah terselesaikan
5. Klik "Ambil Tindakan" untuk melihat respons yang direkomendasikan

Ekspor peringatan:
- Gunakan tombol Ekspor untuk mengunduh CSV
- Mencakup seluruh riwayat peringatan beserta waktu
- Berguna untuk pelaporan kepatuhan

Notifikasi peringatan dapat dikirim melalui:
• Email (dapat dikonfigurasi di Pengaturan)
• Notifikasi dalam aplikasi (ikon lonceng)
• Laporan ringkasan harian`,
          },
        ],
      },
      {
        id: 'reports',
        title: 'Laporan & Data',
        icon: BarChart3,
        articles: [
          {
            id: '6',
            title: 'Melihat Laporan',
            content: `Akses laporan lengkap melalui bagian Laporan:

Jenis Laporan:
• Ringkasan Sistem: Kinerja sistem secara keseluruhan
• Konsumsi Air: Pola dan tren penggunaan
• Kualitas Air: Tren pH, suhu, dan kekeruhan
• Kinerja Sistem: Metrik efisiensi dan waktu aktif
• Riwayat Peringatan: Data peringatan historis

Rentang Waktu:
- Hari Ini: Data hari berjalan
- 7 Hari Terakhir: Tren mingguan
- 30 Hari Terakhir: Ringkasan bulanan
- 3 Bulan Terakhir: Analisis triwulanan
- Tahun Terakhir: Tren tahunan
- Rentang Kustom: Pilih tanggal tertentu

Mode Tampilan:
• Grafik: Grafik dan visualisasi data
• Tabel: Data terperinci dalam bentuk tabel`,
          },
          {
            id: '7',
            title: 'Mengekspor Data',
            content: `Ekspor data dalam beberapa format:

CSV (Comma-Separated Values):
- Kompatibel dengan Excel dan Google Sheets
- Cocok untuk analisis data
- Mencakup semua titik data yang terlihat
- Klik tombol "CSV" untuk mengunduh

PDF (Portable Document Format):
- Laporan siap cetak
- Format profesional
- Mencakup grafik dan visualisasi
- Cocok untuk presentasi

Excel (Microsoft Excel):
- Spreadsheet yang telah diformat
- Dilengkapi formula lanjutan
- Memiliki beberapa lembar kerja
- Grafik disertakan

Semua hasil ekspor mencakup:
• Tanggal/waktu
• Semua metrik yang dipilih
• Lokasi sensor
• Nilai rata-rata yang dihitung
• Indikator tren`,
          },
        ],
      },
      {
        id: 'settings',
        title: 'Pengaturan Sistem',
        icon: Settings,
        articles: [
          {
            id: '8',
            title: 'Mengatur Batas Ambang',
            content: `Atur batas ambang peringatan khusus melalui Pengaturan:

Laju Aliran:
- Minimum: Atur batas bawah yang dapat diterima
- Maksimum: Atur batas atas yang dapat diterima
- Peringatan muncul ketika nilai berada di luar rentang

Tekanan:
- Nilai Min/Maks dalam bar
- Batas kritis untuk keamanan

Level pH:
- Rentang aman umumnya 6.5-8.5
- Rentang optimal 7.0-7.5

Suhu:
- Suhu maksimum yang aman
- Penyesuaian musiman direkomendasikan

Kekeruhan:
- Batas maksimum tingkat kejernihan yang dapat diterima
- Batas untuk kepatuhan terhadap regulasi

Klik "Simpan Perubahan" untuk menerapkan pengaturan baru.
Perubahan berlaku segera.`,
          },
          {
            id: '9',
            title: 'Preferensi Notifikasi',
            content: `Sesuaikan pengaturan notifikasi Anda:

Notifikasi Email:
- Aktifkan/nonaktifkan peringatan email
- Tentukan alamat email
- Atur frekuensi (langsung/ringkasan)

Jenis Peringatan:
✓ Peringatan Kritis: Selalu direkomendasikan
✓ Peringatan Sedang: Untuk pemantauan proaktif
□ Peringatan Info: Opsional, dapat menghasilkan banyak notifikasi
✓ Laporan Harian: Berguna untuk pencatatan

Preferensi Sistem:
• Bahasa: Pilih bahasa antarmuka
• Zona Waktu: Sesuaikan dengan lokasi Anda
• Tema: Terang, Gelap, atau Otomatis
• Perbarui Otomatis: Frekuensi pembaruan
• Interval Pembaruan: 1-60 detik

Manajemen Data:
- Atur periode penyimpanan data (30-365 hari)
- Ekspor data historis
- Hapus data lama untuk menghemat ruang`,
          },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Pemecahan Masalah',
        icon: AlertCircle,
        articles: [
          {
            id: '10',
            title: 'Masalah Umum',
            content: `Solusi untuk masalah yang umum terjadi:

Sensor Tidak Merespons:
1. Periksa catu daya sensor
2. Pastikan koneksi jaringan
3. Periksa tanggal kalibrasi sensor
4. Hubungi dukungan teknis

Hasil Pembacaan Tidak Akurat:
1. Sensor mungkin perlu dikalibrasi ulang
2. Periksa adanya penghalang fisik
3. Pastikan posisi sensor sudah benar
4. Periksa catatan pemeliharaan

Dashboard Tidak Diperbarui:
1. Periksa koneksi internet
2. Segarkan browser (F5)
3. Hapus cache browser
4. Pastikan fitur pembaruan otomatis aktif

Ekspor Data Gagal:
1. Periksa izin file
2. Pastikan ruang penyimpanan mencukupi
3. Coba format ekspor lain
4. Kurangi rentang tanggal

Masalah Login:
1. Pastikan kredensial benar
2. Periksa CAPS Lock
3. Atur ulang kata sandi jika diperlukan
4. Hapus cookie browser`,
          },
          {
            id: '11',
            title: 'Mendapatkan Bantuan',
            content: `Sumber bantuan tambahan:

Dukungan Teknis:
📧 Email: support@aquamonitor.com
📞 Telepon: 1-800-AQUA-HELP
🕐 Jam Layanan: Tersedia 24/7

Dokumentasi:
• Manual Pengguna (PDF): Unduh dari Laporan
• Tutorial Video: Tersedia di website
• Dokumentasi API: Untuk integrasi
• FAQ: Jawaban untuk pertanyaan umum

Pelatihan:
- Webinar online (bulanan)
- Pelatihan di lokasi tersedia
- Program sertifikasi
- Workshop praktik terbaik

Komunitas:
• Forum pengguna
• Basis pengetahuan
• Studi kasus
• Permintaan fitur

Kontak Darurat:
Untuk kegagalan sistem kritis:
📞 Hotline Darurat: 1-800-911-AQUA
🚨 Tersedia 24/7/365`,
          },
        ],
      },
    ],
  },
} as const;

export function UserGuide() {
  const { language } = useLanguage();

  const content = guideContent[language as Language];

  const guideCategories = useMemo(
    () => content.categories as unknown as GuideCategory[],
    [content]
  );

  const [selectedCategoryId, setSelectedCategoryId] =
    useState<string>('getting-started');

  const [selectedArticleId, setSelectedArticleId] =
    useState<string>('1');

  const [searchQuery, setSearchQuery] = useState('');

  const selectedCategory =
    guideCategories.find((category) => category.id === selectedCategoryId) ??
    guideCategories[0];

  const selectedArticle =
    selectedCategory?.articles.find(
      (article) => article.id === selectedArticleId
    ) ?? selectedCategory?.articles[0];

  const downloadManual = () => {
    alert(
      language === 'id'
        ? 'Unduhan manual PDF lengkap akan dimulai di sini'
        : 'Full PDF manual download would start here'
    );
  };

  const filteredCategories = guideCategories.map((category) => ({
    ...category,
    articles: category.articles.filter(
      (article) =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  }));

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 dark:border-gray-800">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-950">
              <BookOpen className="h-6 w-6 text-blue-600" />
            </div>

            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                {content.pageTitle}
              </h1>
              <p className="text-xs text-gray-500">
                {content.pageSubtitle}
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="text"
              placeholder={content.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <button
            onClick={downloadManual}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Download className="h-4 w-4" />
            {content.downloadManual}
          </button>
        </div>

        {/* Categories */}
        <div
          className="overflow-y-auto p-4"
          style={{ height: 'calc(100% - 220px)' }}
        >
          <nav className="space-y-1">
            {filteredCategories.map((category) => {
              if (category.articles.length === 0 && searchQuery) return null;

              const Icon = category.icon;

              return (
                <div key={category.id}>
                  <button
                    onClick={() => {
                      setSelectedCategoryId(category.id);

                      if (category.articles.length > 0) {
                        setSelectedArticleId(category.articles[0].id);
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedCategory.id === category.id
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />

                    <span className="flex-1 font-medium">
                      {category.title}
                    </span>

                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${
                        selectedCategory.id === category.id
                          ? 'rotate-90'
                          : ''
                      }`}
                    />
                  </button>

                  {selectedCategory.id === category.id && (
                    <div className="ml-8 mt-1 space-y-1">
                      {category.articles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => setSelectedArticleId(article.id)}
                          className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            selectedArticle?.id === article.id
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                          }`}
                        >
                          {article.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-4xl p-8">
          {selectedArticle ? (
            <>
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
                  <span>{selectedCategory.title}</span>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-gray-900 dark:text-white">
                    {selectedArticle.title}
                  </span>
                </div>

                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {selectedArticle.title}
                </h2>
              </div>

              <div className="prose prose-blue max-w-none rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900 dark:prose-invert">
                <div className="whitespace-pre-line text-gray-700 dark:text-gray-300">
                  {selectedArticle.content}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-lg border border-gray-200 bg-blue-50 p-4 dark:border-gray-800 dark:bg-blue-950">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />

                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-200">
                      {content.helpful}
                    </p>

                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      {content.helpfulDescription}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                    {content.yes}
                  </button>

                  <button className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300">
                    {content.no}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <BookOpen className="mx-auto h-12 w-12 text-gray-400" />

                <p className="mt-4 font-medium text-gray-600 dark:text-gray-400">
                  {content.noArticles}
                </p>

                <p className="text-sm text-gray-500">
                  {content.noArticlesDescription}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
