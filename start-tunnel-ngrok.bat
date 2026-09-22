@echo off
title Water Monitoring - ngrok Tunnel
echo =======================================================
echo    WATER MONITORING - NGROK TUNNEL (GRATIS)
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
echo Menjalankan ngrok ke port 8000...
echo.
echo Catatan: Jika baru pertama kali memakai ngrok,
echo daftarkan authtoken dulu via perintah:
echo   ngrok config add-authtoken <TOKEN_ANDA>
echo =======================================================
echo.

ngrok http 8000

pause
