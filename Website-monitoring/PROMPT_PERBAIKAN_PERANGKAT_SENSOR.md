# KONTEKS PROYEK

Aplikasi web **Water Monitoring IoT** berbasis ESP32 dengan integrasi website ↔ database ↔ perangkat ESP32.

- Backend: Laravel (koneksi MySQL, database `water_monitoring`, dikelola lewat phpMyAdmin lokal)
- Frontend: web dashboard (menu sidebar "Perangkat Sensor" / "Manajemen Perangkat Sensor IoT")
- **Riwayat penting:** proyek baru saja **migrasi dari Firebase ke MySQL lokal**. Banyak fitur yang berhubungan dengan database sekarang error atau tidak sinkron karena sisa kode/logika Firebase.

# TUJUAN

Perbaiki bug dan optimalkan menu Manajemen Perangkat Sensor IoT beserta semua fitur yang bergantung pada database (dashboard, OTA, analisis AI), sehingga semuanya membaca dan menulis ke MySQL dengan benar.

# CARA KERJA

1. Baca struktur proyek dulu (routes, controller, model, migration, view/komponen frontend) sebelum mengubah kode.
2. Cari semua sisa referensi Firebase (SDK, config, listener realtime, helper) dan ganti dengan implementasi MySQL, atau hapus jika tidak terpakai.
3. Kerjakan per bagian di bawah dan jangan merusak fitur yang sudah berjalan.
4. Setelah selesai, jelaskan ringkas file apa saja yang diubah dan cara mengujinya.

---

# TUGAS 1 — Perubahan Layout Tombol (UI)

## 1a. Pindahkan tombol "Tambah Perangkat"

- Di bagian **Katalog Jenis Perangkat** saat ini ada 2 tombol: `Tambah Jenis Perangkat` dan `Tambah Perangkat`.
- Pindahkan `Tambah Perangkat` ke menu/tab **Perangkat ESP32**, dengan **layout, gaya, dan posisi tombol persis seperti sebelumnya**.

## 1b. Geser tombol "Tambah Jenis Perangkat"

- Pindahkan `Tambah Jenis Perangkat` ke posisi bekas tombol `Tambah Perangkat` di Katalog Jenis Perangkat.
- Hasil akhir: setiap tab (**Perangkat ESP32 · Jenis Perangkat · Lokasi Sektor · Firmware Repository**) punya tombol aksi yang sesuai dan letaknya konsisten.

## 1c. Sisakan tombol "Sinkron"

- Di bagian dengan tab *Jenis Perangkat, Lokasi Sektor, Firmware Repository* ada beberapa tombol, dan satu tombol `Sinkron` di sisi kiri.
- **Hapus tombol lain, sisakan hanya `Sinkron`.**
- Sesuaikan layout dan posisinya supaya rapi dan seimbang setelah tombol lain dihapus.

---

# TUGAS 2 — Bug Database & Backend

## 2a. Error duplicate entry saat menambah perangkat

```
SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry 'ESP32-WATER-01'
for key 'nodes_kode_node_unique'
(Connection: mysql, Host: 127.0.0.1, Port: 3306, Database: water_monitoring,
SQL: insert into `nodes` (`user_id`, `location_id`, `kode_node`, `device_name`,
`nama_lokasi`, `model_type`, `api_token_hash`, `status`, `firmware_version`,
`last_seen_at`, `updated_at`, `created_at`)
values (10, ?, ESP32-WATER-01, ESP32 Water Monitoring, Titik Pantau Sensor Utama,
ESP32, <hash>, active, 1.0.0, ?, 2026-09-21 14:36:41, 2026-09-21 14:36:41))
```

- Tambahkan validasi `unique` di sisi server (Form Request/validator) **sebelum insert**, dengan pesan error yang jelas di UI, bukan error SQL mentah.
- Selidiki penyebabnya: kemungkinan data sisa migrasi/seeder, insert ganda karena double-submit, atau `kode_node` ter-generate sama. Perbaiki akar masalahnya.
- Nilai `location_id` dan `last_seen_at` terkirim sebagai `?` (kosong/null). Cek apakah kolom nullable dan apakah data dari form terkirim dengan benar.
- Cegah double-submit (disable tombol simpan saat request berjalan).

## 2b. Firmware Repository & status OTA

- Status OTA di Firmware Repository masih bug dan **belum terintegrasi dengan database MySQL**.
- Sambungkan status OTA (versi, progres, sukses/gagal, waktu update) ke tabel yang sesuai di MySQL dan pastikan endpoint yang dipanggil ESP32 ikut memperbarui status ini.
- Verifikasi bahwa firmware yang diisi/diunggah dari laptop atau perangkat lain tersimpan di database dan storage server (bukan hanya localStorage/file lokal), sehingga tampil konsisten di semua perangkat.

## 2c. Audit menyeluruh pasca-migrasi Firebase → MySQL

- Periksa dashboard dan semua fitur yang berhubungan dengan database: query, relasi model, nama kolom, dan format data yang masih mengikuti struktur Firebase.
- Perbaiki semua yang error atau tidak sinkron.

## 2d. Dashboard, "Update Menghubungkan", dan Analisis AI

- Bagian ini terus menampilkan status **"Menghubungkan"** dan tidak sinkron dengan database.
- Cari penyebabnya (endpoint gagal, polling/listener Firebase lama, query salah, error yang tertelan) dan perbaiki sampai data tampil realtime/berkala dari MySQL.
- Tambahkan state yang jelas: loading, berhasil, dan gagal (dengan pesan error dan opsi coba lagi), jangan hanya "Menghubungkan" tanpa akhir.

---

# TUGAS 3 — Perbaikan UX Form & Modal

## 3a. Input tidak boleh hilang saat pindah tab / proses berjalan

- Saat user sedang mengisi form lalu berpindah tab, atau saat proses berjalan di latar belakang, data input **harus tetap tersimpan** dan tidak reset.
- Pertahankan state form (state global/store, atau simpan draft sementara) sampai user menyimpan atau membatalkan.

## 3b. Semua form/modal wajib punya jalan keluar

- Ada form/modal (misalnya isi data ESP32 dan form lain) yang tidak punya tombol kembali atau tutup, sehingga UI macet.
- Aturan penempatannya:
  - **Modal/popup kecil → tombol silang (X)** di pojok
  - **Halaman/form besar → tombol "Kembali"**
- Terapkan ke **semua** modal dan form di modul Perangkat Sensor, dan tambahkan juga penutupan lewat tombol `Esc` serta klik di luar modal (jika sesuai).
- Konfirmasi dulu jika ada perubahan yang belum disimpan sebelum menutup.

---

# KRITERIA SELESAI

- [ ] Tombol `Tambah Perangkat` ada di tab Perangkat ESP32, `Tambah Jenis Perangkat` di posisi barunya, tombol `Sinkron` rapi sebagai satu-satunya tombol yang tersisa
- [ ] Menambah perangkat tidak lagi memunculkan error SQL 1062 mentah; duplikat ditangani dengan pesan yang jelas
- [ ] Status OTA dan Firmware Repository terbaca dan tersimpan di MySQL
- [ ] Dashboard dan Analisis AI tidak macet di "Menghubungkan" dan datanya sinkron dengan database
- [ ] Tidak ada sisa dependensi Firebase yang masih dipakai
- [ ] Input form tidak hilang saat pindah tab
- [ ] Semua modal/form punya tombol X atau Kembali
- [ ] Ringkasan perubahan dan cara pengujian diberikan di akhir
