# AquaMonitor — Frontend + Backend Terintegrasi

Folder ini adalah satu project Laravel yang mempertahankan source frontend React dan backend Laravel dari dua project asal.

## Struktur
- `app/`, `routes/`, `database/`, `config/`, `public/` → backend Laravel
- `frontend/src/` → frontend React/Vite asli
- `frontend/package.json` → package manifest frontend asli (dipertahankan)
- `package.json` → package manifest utama untuk build frontend dari root
- `vite.config.js` → build React ke `public/build`

## Menjalankan di Windows
Pastikan PHP 8.4+, Composer, Node.js 20+ dan MySQL 8.x tersedia.

### 1. Backend
```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
```

Edit `.env` untuk database `water_monitoring`, lalu:
```powershell
php artisan migrate:fresh --seed
```

### 2. Frontend
Dari folder root project:
```powershell
npm install
npm run build
```

Untuk development frontend:
```powershell
npm run dev
```

Dan di terminal lain:
```powershell
php artisan serve
```

Aplikasi Laravel: `http://127.0.0.1:8000`

### 3. Login demo hasil seeder
- Email: `admin@watermonitoring.test`
- Password: `password`

## Integrasi yang sudah dilakukan
- Login React sekarang memakai `POST /api/login` Laravel Sanctum.
- Signup React memakai `POST /api/register`.
- Token Sanctum disimpan di `localStorage` dan otomatis dipakai untuk request API.
- Session frontend divalidasi ulang melalui `GET /api/me` saat aplikasi dibuka kembali.
- Logout memanggil `POST /api/logout`.
- Dashboard mengambil data sensor terbaru dari endpoint node/sensor-data dan memperbaruinya setiap 30 detik.
- Halaman Alerts mengambil data dari `GET /api/alerts` dan tombol dismiss menandai alert sebagai read melalui API.
- Semua route React (`/`, `/alerts`, `/reports`, `/settings`, `/guide`, `/login`, `/signup`) dilayani oleh fallback Laravel, sedangkan `/api/*` tetap ditangani route API Laravel.
- Build Vite menghasilkan asset di `public/build` sehingga frontend dan backend berjalan dari satu origin.

## Catatan
Build belum menyertakan `node_modules`; jalankan `npm install` di root project. Source frontend asli di dalam `frontend/` sengaja dipertahankan agar struktur dan komponen tidak dihilangkan.
