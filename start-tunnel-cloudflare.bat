@echo off
title Water Monitoring - Cloudflare Tunnel
echo =======================================================
echo    WATER MONITORING - CLOUDFLARE TUNNEL (GRATIS)
echo =======================================================
echo.

:: Pastikan berjalan dari direktori root projek
cd /d "%~dp0"

:: Cek apakah port 8000 (Laravel) sudah berjalan
netstat -ano | findstr :8000 >nul 2>&1
if errorlevel 1 (
    echo [INFO] Laravel server (port 8000) belum terdeteksi.
    echo Menjalankan Laravel server di background...
    start "Laravel Server (Port 8000)" cmd /k "cd /d "%~dp0Website-monitoring" && php artisan serve --host=0.0.0.0 --port=8000"
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] Laravel server sudah aktif di port 8000.
)

echo.
echo =======================================================
echo Membuka terowongan Cloudflare Tunnel...
echo Tunggu sebentar, link publik HTTPS (.trycloudflare.com)
echo akan segera muncul di bawah ini.
echo.
echo Link tersebut bisa langsung dibuka oleh teman Anda di luar jaringan!
echo Tekan Ctrl + C jika ingin menghentikan tunnel.
echo =======================================================
echo.

cloudflared tunnel --url http://localhost:8000

pause
