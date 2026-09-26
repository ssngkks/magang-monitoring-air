# use-dummy.ps1 — beralih ke database DUMMY (aquamonitor_dummy) untuk testing.
# Aman: tidak menjalankan migrate/seed/fresh. Hanya menukar .env + clear cache.

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ExpectedDb = 'aquamonitor_dummy'

function Get-DbDatabase([string]$EnvFile) {
    $line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^DB_DATABASE=' } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace '^DB_DATABASE=', '').Trim()
}

$source = Join-Path $ProjectRoot '.env.dummy'
$dest = Join-Path $ProjectRoot '.env'

if (-not (Test-Path -LiteralPath $source)) {
    Write-Error "Source tidak ditemukan: $source"
    exit 1
}

$sourceDb = Get-DbDatabase $source
if ($sourceDb -cne $ExpectedDb) {
    Write-Error "GUARD: DB_DATABASE di .env.dummy adalah '$sourceDb', wajib exact '$ExpectedDb'. Dibatalkan."
    exit 1
}

$backup = Join-Path $ProjectRoot ('.env.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath $dest -Destination $backup -Force
Write-Output "Backup .env aktif -> $(Split-Path -Leaf $backup)"

Copy-Item -LiteralPath $source -Destination $dest -Force

$finalDb = Get-DbDatabase $dest
if ($finalDb -cne $ExpectedDb) {
    Write-Error "VALIDASI GAGAL: DB_DATABASE hasil akhir '$finalDb', wajib '$ExpectedDb'. Kembalikan dari backup bila perlu: $backup"
    exit 1
}

Set-Location -LiteralPath $ProjectRoot
php artisan optimize:clear

Write-Output ''
Write-Output 'Mode aktif : DUMMY (testing)'
Write-Output "DB_DATABASE: $finalDb"
