# Frontend Integration — AquaMonitor + Laravel

## Overview
React SPA terintegrasi ke Laravel sebagai **single app** (Vite + laravel-vite-plugin). UI dipertahankan dari Figma Make `Water_Monitoring_Dashboard (Community)` dengan data source diganti dari mock ke **Laravel REST API** via Sanctum Bearer Token.

- **Entry**: `resources/views/app.blade.php` + `resources/js/app.tsx`
- **Vite input**: `resources/css/app.css`, `resources/js/app.tsx`
- **Routing**: Laravel `GET /{any?}` → `view('app')` (SPA fallback), API di `/api/*` tetap terpisah.
- **Auth**: Sanctum `personal_access_tokens`, token disimpan `localStorage:aqua_token`, header `Authorization: Bearer <token>`.
- **Build**: `npm run build` → `public/build/*` (Reverb key, Tailwind 4, Recharts, React Router v7).

## API Integrated
| Feature | Endpoint | File |
|---|---|---|
| Register | `POST /api/register` `{name,email,password,password_confirmation}` → `201 {user,token}` | `api/auth.ts:register` |
| Login | `POST /api/login` `{email,password}` → `200 {user,token}` | `api/auth.ts:login` |
| Logout | `POST /api/logout` (auth:sanctum) | `api/auth.ts:logout` |
| Me | `GET /api/me` & `/api/user` | `api/auth.ts:me` + `context/AuthContext.tsx:refreshUser` |
| Nodes index | `GET /api/nodes` → `{data: Node[]}` hides `api_token_hash` | `api/nodes.ts:list` |
| Nodes store | `POST /api/nodes` `{kode_node,nama_lokasi}` → `201 {api_token}` hash sha256 | `api/nodes.ts:create` |
| Sensor history | `GET /api/nodes/{id}/sensor-data?from=&to=&per_page=&page=` → `{data,meta}` | `api/nodes.ts:sensorData` |
| Alerts list | `GET /api/alerts?is_read=&per_page=` → paginate `{data,current_page,last_page}` | `api/alerts.ts:list` |
| Alerts read | `PATCH /api/alerts/{id}/read` → `{data}` | `api/alerts.ts:markRead` |
| Ingest (device) | `POST /api/sensor/store` `verify.node.token+throttle:ingest` (tidak dipakai frontend) | — |

Semua request via `api/client.ts` (`fetch` + `Authorization` + auto `401` clear + `aqua:unauthorized` event).

## Frontend Structure
```
resources/js/
├── api/client.ts      # fetch wrapper, token, 401 handling
├── api/auth.ts        # register/login/logout/me
├── api/nodes.ts       # Node + SensorDataRow + paginated
├── api/alerts.ts      # Alert paginated + markRead
├── context/AuthContext.tsx   # Sanctum token, refreshUser, login/logout, isAuthenticated
├── context/LanguageContext.tsx # en/id, localStorage:aqua_language
├── lib/utils.ts       # cn, formatDate
├── components/
│   ├── Layout.tsx     # sidebar desktop + drawer mobile, topbar, avatar, logout, Outlet
│   ├── MetricCard.tsx # gauge conic-gradient, status normal/warning/critical
│   ├── SensorStatus.tsx # grid nodes + latestDataMap, is_online, ai_status
│   └── ui/{button,card,input,badge}.tsx
├── pages/
│   ├── Login.tsx      # email/password, error, redirect if authed, link /signup
│   ├── Signup.tsx     # name/email/password/confirm, validation, redirect
│   ├── Dashboard.tsx  # node selector, 4 MetricCards + 2 physical, 3 chart tabs (Recharts), SensorStatus, recent alerts, clock, polling/Reverb
│   ├── Alerts.tsx     # stats (total/critical/warning/info), filter All/Critical/Warning/Info, search, export CSV, dismiss→markRead, modal detail + Take Action placeholder
│   ├── Reports.tsx    # node + range (today/7/30/3m/1y/custom), Charts/Table toggle, Quick Stats (avgPh/avgTemp/maxTurbidity/vibration), 4 charts (Line/Area/Bar/Pie), table + CSV export
│   ├── Settings.tsx   # tabs General/Thresholds/Data, Language switcher, notifications, timezone/theme/autoRefresh, thresholds (phMin/max etc), retention, Danger Zone, save → localStorage
│   ├── UserGuide.tsx  # kategori → artikel, search, dua bahasa, 2-panel layout
│   └── NotFound.tsx
├── app.tsx            # BrowserRouter + AuthProvider + LanguageProvider, Protected/PublicOnly, Routes
├── echo.js            # laravel-echo + pusher-js, Reverb (window.Echo)
├── env.d.ts
└── vite.config.js     # laravel + tailwindcss + @vitejs/plugin-react, proxy /api → localhost:8000
```

## Auth Flow
1. `Login` → `authApi.login` → `setToken` → `setUser` → navigate `/`.
2. `Signup` → `authApi.register` → sama.
3. `AuthProvider` on mount: `localStorage.aqua_token` → `authApi.me()` → setUser, else clear.
4. `api/client.ts` on `401`: `clearToken()` + dispatch `aqua:unauthorized` → `AuthProvider` setUser null, `Protected` redirect `/login`.
5. `logout` → `POST /api/logout` → `clearToken` → navigate `/login`. Tidak menyimpan password.

## Dashboard — Real Data
- **Source**: `GET /api/nodes` → node list milik user, `GET /api/nodes/{id}/sensor-data?per_page=24` (24 point terakhir) → sort asc untuk chart, `GET /api/alerts?per_page=5` recent.
- **MetricCard**: pH 0-14, suhu 0-50°C, humid 0-100%, turbidity 0-5 NTU, gauge + progress bar + status (warning/critical thresholds sesuai spec).
- **Physical**: Level 0-200cm progress, vibration boolean → badge + pulse jika terdeteksi, AI status (Normal/Anomali/Bahaya).
- **Charts**: 3 tab `recharts` — pH&Turbidity (Line 2 Y), Temp&Humidity (Area 2 Y), Level&Vibration (Bar). Data dari `history` (sorted, max 24). `per_page` tidak request jutaan row.
- **Node selector**: `<select>` dari `nodes`, `latestMap` per node (`per_page=1` per node untuk SensorStatus).
- **Polling**: interval dari `localStorage:aqua_refresh_interval` (default 10000ms, min 5000ms), `setInterval` → `fetchHistory` + `fetchAlerts` + `fetchNodes`, cleanup `clearInterval` on unmount / autoRefresh off / node change.
- **Realtime**: dynamic `import("../echo.js")` → `window.Echo.channel('node.{id}').listen('.sensor.updated')` & `'.alert.created'` update `history/latestMap/alerts` optimistically, `stopListening` cleanup. Fallback polling ensures data even if Reverb down.
- **States**: `loading` skeleton, `error` retry, `empty` (no nodes / no sensor), vibration badge animate.

## Alerts — Real Data
- **List**: `GET /api/alerts?per_page=100`, paginator `data`.
- **Filter**: client filter by `severity` (all/critical/warning/info) + search pesan/kode_node.
- **Stats**: total/critical/warning/info dari `alerts`.
- **Export CSV**: Blob + `URL.createObjectURL` dari `filtered`.
- **Dismiss**: `PATCH /api/alerts/{id}/read` → update `is_read` optimistically, modal close. Take Action → `alert("belum tersedia")` honest placeholder.
- **Polling** 10s + cleanup.

## Reports — Real Data
- **Params**: `from/to` dari `range` (today/7days/30days/3months/1year/custom) → `GET /api/nodes/{id}/sensor-data?from=&to=&per_page=100`.
- **Stats**: avgPh/avgTemp/maxTurbidity/vibrationCount dari `history`.
- **Charts** 4 (ph Line, turbidity+level Line 2Y, temp+humid Bar 2Y, AI Pie) via `recharts`, data `history` sorted.
- **Table** 50 rows pertama + footer + CSV export. PDF/Excel → placeholder alert.
- **No full DB fetch**: max 100 `per_page`, pagination bisa ditambah bila perlu.

## Settings
- **UI-only vs persistent**: semua field `useState` + `localStorage:aqua_settings` (termasuk `refreshInterval` → `aqua_refresh_interval` untuk Dashboard polling).
- **Language**: `ID/EN` via `LanguageContext` → `localStorage:aqua_language`, semua page yang relevan pakai `t`.
- **Save**: `handleSave` → `localStorage.setItem` + toast 3s (`setTimeout` cleanup on unmount → clearTimeout).
- **Gap**: persistence server belum ada (butuh `POST /api/settings` endpoint), export/clear → placeholder honest.

## Error Handling
- `loading`, `empty`, `error`, `unauthorized` di Dashboard/Alerts/Reports (retry button, "Belum ada data", "Session expired" via 401 auto logout).
- `try/catch` semua fetch, `ApiError` {message,status,errors} dari `api/client.ts`, `validationErrors` ditampilkan di Login/Signup.

## Performance & Security
- `setInterval` / `Echo` / `eventListener` semua `clearInterval` / `stopListening` / `removeEventListener` on unmount.
- Tidak polling agresif (min 5s, default 10s), tidak request duplikat, tidak render berlebihan, memoize `chartData/stats`.
- Tidak expose `api_token_hash/password` (backend hidden, broadcast payload safe), tidak hardcode secret, hanya `VITE_REVERB_*` & `VITE_API_BASE_URL` di client.

## Responsive
- Tailwind `sm/lg/xl` — sidebar desktop 64, drawer mobile overlay, chart `ResponsiveContainer width 100%`, table `overflow-auto`, modal usable, no horizontal overflow.

## Run
```bash
# backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed   # 1 admin@watermonitoring.test / password, 3 nodes, 159 sensor, 12 alerts
php artisan serve            # :8000
php artisan queue:work --tries=3 --backoff=10
php artisan reverb:start --host=0.0.0.0 --port=8080
php artisan schedule:work    # aggregate-hourly + prune

# frontend
npm install --legacy-peer-deps
npm run dev    # vite :5173 proxy /api → :8000, HMR
npm run build  # → public/build/*, manifest 1.7k, app 704k gzip 194k
```

## Tests
- `php artisan test` → 23 passed 131 assertions (Phase4 9 + Phase5 12)
- `npm run build` → success (2194 modules, 16.9s)
- `npx tsc --noEmit` → no errors

## Remaining Gaps / TODO
- **Settings persistence server**: butuh `POST /api/settings` + model, saat ini localStorage.
- **Reports PDF/Excel**: placeholder CSV only.
- **Alerts Take Action**: placeholder.
- **Channel auth**: `Channel('node.{id}')` public — jika butuh private, ganti `PrivateChannel` + `routes/channels.php` `Broadcast::channel('node.{id}', fn($user,$id)=> $user->nodes()->where('id',$id)->exists())`.
- **Chunks**: `app-B_EysdrQ.js` 704k >500k warning — bisa `dynamic import` per route (lazy) untuk code-split.
- **SimulateNodeData**: command `node:simulate` tidak dimigrasi (Phase 2 V2 fokus core).

