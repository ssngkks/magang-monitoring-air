@echo off
title Water Monitoring - Pilih Metode Online
cd /d "%~dp0"

:menu
cls
echo =======================================================
echo     SISTEM MONITORING AIR - AKSES ONLINE DARI LUAR
echo =======================================================
echo.
echo  Pilih terowongan publik gratis yang ingin dipakai:
echo.
echo   [1] Cloudflare Tunnel (Sangat Direkomendasikan - Tanpa Akun/Token)
echo   [2] ngrok Tunnel (Perlu Authtoken gratis dari dashboard ngrok)
echo   [3] Jalankan Laravel Lokal Saja (Port 8000)
echo   [4] Keluar
echo.
set /p pilihan="Masukkan pilihan [1-4]: "

if "%pilihan%"=="1" goto cloudflare
if "%pilihan%"=="2" goto ngrok
if "%pilihan%"=="3" goto laravel
if "%pilihan%"=="4" goto keluar
echo Pilihan tidak valid!
timeout /t 2 >nul
goto menu

:cloudflare
call "%~dp0start-tunnel-cloudflare.bat"
goto menu

:ngrok
call "%~dp0start-tunnel-ngrok.bat"
goto menu

:laravel
start "Laravel Server (Port 8000)" cmd /k "cd /d "%~dp0Website-monitoring" && php artisan serve --host=0.0.0.0 --port=8000"
echo Laravel dijalankan di jendela terpisah.
pause
goto menu

:keluar
exit
