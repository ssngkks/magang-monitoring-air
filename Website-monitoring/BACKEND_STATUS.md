# BACKEND_STATUS — Water Monitoring Backend (Laravel 13)

## 1. Project Overview
Backend untuk sistem monitoring air: ingest data sensor node (ESP32/Lora), manajemen node, alert, notifikasi Telegram via queue, realtime via Reverb, retensi & agregasi data. Frontend terpisah (mock React sebelumnya). Source of truth: `temp-laravel` (Laravel 13.30.1, PHP 8.4.22) hasil migrasi Phase 1–5 dari `water-monitoring-backend.zip` reference.

## 2. Stack / Version
- **PHP** 8.4.22 (cli, ZTS)
- **Laravel** 13.30.1
- **Composer** 2.10.3
- **DB** MySQL 8.x target (`water_monitoring`), SQLite `:memory:` untuk `phpunit`
- **Auth** Laravel Sanctum 4.3.3 (`HasApiTokens`, `personal_access_tokens`)
- **Realtime** Laravel Reverb 1.11.0 (`BROADCAST_CONNECTION=reverb`, `ShouldBroadcastNow`)
- **Queue** `database` (`jobs`, `failed_jobs`, `job_batches`)
- **Cache/Session** `database`
- **HTTP** Guzzle 7.15.5 / psr7 2.13.1
- **Test** PHPUnit 12.5.34, 23 tests 131 assertions

## 3. Setup Local (fresh)
```bash
composer install
cp .env.example .env
php artisan key:generate
# Edit .env: DB_*, REVERB_*, TELEGRAM_*, VIBRATION_*, RETENTION_*
php artisan migrate --seed   # atau migrate:fresh --seed
php artisan storage:link   # jika pakai storage
```

## 4. Environment Variables (wajib)
```env
APP_NAME="Water Monitoring"
APP_ENV=local
APP_KEY=base64:...
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=water_monitoring
DB_USERNAME=root
DB_PASSWORD=

QUEUE_CONNECTION=database
BROADCAST_CONNECTION=reverb
CACHE_STORE=database
SESSION_DRIVER=database

REVERB_APP_ID=water-monitoring
REVERB_APP_KEY=water-monitoring-key
REVERB_APP_SECRET=water-monitoring-secret
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST="${REVERB_HOST}"
VITE_REVERB_PORT="${REVERB_PORT}"
VITE_REVERB_SCHEME="${REVERB_SCHEME}"

SANCTUM_STATEFUL_DOMAINS=localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1

TELEGRAM_BOT_TOKEN=   # kosong = notifikasi di-skip (log info)
TELEGRAM_CHAT_ID=

VIBRATION_RMS_THRESHOLD=0.30
SENSOR_DATA_RAW_RETENTION_MONTHS=3
NODE_ONLINE_THRESHOLD_MINUTES=10
```
`.env.example` sudah MySQL target + Reverb placeholder, tidak ada secret real. `.env` tidak masuk repo (`.gitignore:3`).

## 5. Database Setup
- **Migrations** 9: `users`, `cache`, `jobs`, `add_role`, `nodes`, `sensor_data`, `alerts`, `sensor_data_hourly`, `personal_access_tokens`. FK cascade, enum, decimal, index, unique `kode_node` & `[node_id,hour]`.
- **Seeder** `DatabaseSeeder`: 1 admin `admin@watermonitoring.test`/`password` (role admin), 3 nodes `LORA-NODE-*`, tiap node 50 normal +3 anomali sensor_data +4 alerts = 159 sensor, 12 alerts, hourly 0.
- **MySQL verified** `migrate:fresh --seed` (1s per table) `users 1 nodes 3 sensor 159 alerts 12` OK, enum/decimal/datetime & FK OK.

## 6. Migration / Seeding
```bash
php artisan migrate:status   # 9 Ran
php artisan migrate:fresh --seed
php artisan tinker --execute "App\Models\User::first()->isAdmin()"
```

## 7. Run API
```bash
php artisan serve          # http://localhost:8000
php artisan about         # Laravel 13.30.1, PHP 8.4, Queue database, Broadcast reverb
php artisan route:list    # 17 routes (10 api + broadcasting/auth + sanctum + storage + up)
php artisan config:clear
```
Health: `GET /up` 200.

## 8. Run Queue Worker
```bash
php artisan queue:work --tries=3 --backoff=10
php artisan queue:work --stop-when-empty --timeout=10  # test integration
php artisan queue:failed              # 0
php artisan queue:failed --all  # retry/forget
php artisan queue:clear
```
Verified real: `KirimNotifikasiAlert::dispatch` → `jobs` count 1 → `queue:work` RUNNING 132ms DONE → `jobs 0 failed 0`. Missing Telegram config → log info skip, 500 → `RequestException` throw → retry 3×10s (tested via `Http::fake`).

## 9. Run Scheduler
```bash
php artisan schedule:list
# 0 * * * * sensor-data:aggregate-hourly (hourly)
# 0 2 * * * sensor-data:prune --force (daily 02:00)
php artisan schedule:run
php artisan sensor-data:aggregate-hourly  # manual
php artisan sensor-data:prune --force     # non-interactive, deletes <3mo where created_at
```
No duplicate, no interactive prompt.

## 10. Run Reverb
```bash
php artisan reverb:start --host=0.0.0.0 --port=8080 --debug
# atau: php artisan reverb:start
```
Config: `config/broadcasting.php` default reverb, `config/reverb.php` apps `water-monitoring`. `.env.example` `REVERB_*` + `VITE_REVERB_*`. Events: `SensorDataReceived` (`sensor.updated` `Channel node.{id}`) + `AlertCreated` (`alert.created`) payload safe (no `api_token_hash`/`password`). Verified `Event::fake` + `broadcastWith` no secret, ingestion catch `Log::warning` jika Reverb down (sensor tetap 201).

## 11. Run Tests
```bash
composer validate          # valid
php artisan test           # 23 passed 131 assertions (Phase4 11 + Phase5 12)
php artisan test --filter Phase4ApiTest   # 9 auth/nodes/alerts/sensor 401/403/422/pagination/hidden
php artisan test --filter Phase5BusinessTest # 12 normal/bahaya/anomali/vibration/last_seen/telegram/queue/prune/hourly/broadcast
```
`phpunit.xml` `DB_CONNECTION sqlite :memory:` `QUEUE sync` `BROADCAST null` untuk CI, MySQL untuk local `migrate`.

## 12. API Endpoint Summary
| Method | URI | Auth | Deskripsi |
|---|---|---|---|
| POST | `/api/register` | guest | `name,email, password confirmed` → 201 `user,token` role user |
| POST | `/api/login` | guest | `email,password` → 200 `token` else 401 |
| POST | `/api/logout` | `auth:sanctum` | delete current token → 200 |
| GET | `/api/me`, `/api/user` | `auth:sanctum` | current user (no password/hash) |
| GET | `/api/nodes` | `auth:sanctum` | list milik user, `is_online` via `online_threshold`, hides `api_token_hash` |
| POST | `/api/nodes` | `auth:sanctum` | `kode_node unique, nama_lokasi` → 201 `api_token` plaintext sekali, hash sha256 |
| GET | `/api/nodes/{node}/sensor-data` | `auth:sanctum` | `?from,to,per_page 1-200` → 200 paginate, 403 ownership, 404 |
| GET | `/api/alerts` | `auth:sanctum` | `?is_read,per_page 1-200` → 200 |
| PATCH | `/api/alerts/{alert}/read` | `auth:sanctum` | `is_read true`, 403/404 |
| POST | `/api/sensor/store` | `verify.node.token+throttle:ingest` | `kode_node,api_token,ph 0-14,turbidity min0, vibration_rms min0, ai_status` → 201 `SensorData`, `last_seen_at` update, `Bahaya→critical Anomali→warning` Alert + Queue + Broadcast, 401 token/inactive, 422 validation, 429 throttle 60/min per kode_node |

## 13. Known Limitations
- **Channel public** `Channel('node.{id}')` (bukan PrivateChannel) → any client bisa subscribe tanpa auth. Konsekuensi: data sensor tidak sensitif tapi bisa di-scrape; jika butuh private, ubah ke `PrivateChannel` + `routes/channels.php` auth `Broadcast::channel('node.{id}', fn($user,$id)=> $user->nodes()->where('id',$id)->exists())`.
- **No dedup alert**: setiap ingest `Bahaya/Anomali` buat Alert baru (sesuai source, tidak ada policy dedup). Jika perlu throttle alert, tambah di `SensorIngestService`.
- **Telegram only** `TELEGRAM_BOT_TOKEN/CHAT_ID` → single chat, no per-user subscription. Email `Notification::send` masih comment di job.
- **Hourly aggregation** hanya `avg_ph/temp/turbidity` previous hour, tidak `water_level/humidity/vibration` (sesuai source). Bisa extend.
- **SimulateNodeData** command tidak dimigrasi (Phase 5 fokus core, bisa tambah `php artisan node:simulate` jika perlu demo tanpa hardware).
- **.env** local masih `sqlite` (generated random Reverb 593596...), `.env.example` placeholder `water-monitoring-*` — sinkronkan saat deploy MySQL.
- **Rate limit** 60/min per `kode_node` (via `AppServiceProvider`) — tidak ada per-IP global limit.

## 14. Production Checklist
- [ ] `APP_ENV=production` `APP_DEBUG=false` `APP_KEY` generate baru
- [ ] MySQL `water_monitoring` + `php artisan migrate --force --seed` (buat admin baru, ganti password)
- [ ] `QUEUE_CONNECTION=database` + supervisor `queue:work --tries=3 --backoff=10 --sleep=3 --max-time=3600`
- [ ] `BROADCAST_CONNECTION=reverb` + `REVERB_APP_*` real secret (32+ chars), `php artisan reverb:start` via supervisor/systemd, firewall 8080
- [ ] `TELEGRAM_BOT_TOKEN/CHAT_ID` real, atau kosongkan untuk disable
- [ ] `php artisan schedule:run` via cron `* * * * * php /path/artisan schedule:run >> /dev/null 2>&1` atau `schedule:work`
- [ ] `php artisan config:cache route:cache view:cache` + `storage:link`
- [ ] `composer install --no-dev --optimize-autoloader`
- [ ] `php artisan about` `migrate:status` `route:list` `schedule:list` `test` hijau
- [ ] Backup DB + retention `sensor_data:prune --force` daily 02:00
- [ ] Frontend `VITE_REVERB_*` env untuk Echo

## 15. Commands Quick
```bash
composer validate && php artisan about && php artisan migrate:status && php artisan route:list && php artisan schedule:list && php artisan test
```
23 tests pass, 17 routes, 9 migrations, 2 schedules, no failed jobs.
