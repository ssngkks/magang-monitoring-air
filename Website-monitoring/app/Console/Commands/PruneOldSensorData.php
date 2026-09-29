<?php

namespace App\Console\Commands;

use App\Models\SensorData;
use Illuminate\Console\Command;

class PruneOldSensorData extends Command
{
    protected $signature = 'sensor-data:prune {--force : lewati konfirmasi dan jalankan non-interaktif}';

    protected $description = 'Hapus pembacaan sensor mentah yang lebih tua dari masa retensi (MySQL, bertahap per 1000 baris).';

    public function handle(): int
    {
        $bulanRetensi = (int) config('watermonitoring.raw_retention_months', 3);
        $batasWaktu = now()->subMonths($bulanRetensi);

        $this->info("Menyiapkan pembersihan data sebelum {$batasWaktu->toDateString()}...");

        $total = (clone $this->baseQuery($batasWaktu))->count();
        if ($total === 0) {
            $this->info('Tidak ada data mentah lama yang perlu dihapus.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("Akan menghapus {$total} baris sensor lama. Lanjutkan?", true)) {
            $this->warn('Dibatalkan.');

            return self::SUCCESS;
        }

        // Hapus bertahap agar tabel tidak terkunci lama saat dibuka
        // bersamaan dari banyak device (phpMyAdmin ikut lega).
        $deleted = 0;
        do {
            $batch = (clone $this->baseQuery($batasWaktu))->limit(1000)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Berhasil membersihkan {$deleted} data sensor lama.");

        return self::SUCCESS;
    }

    protected function baseQuery(\DateTimeInterface $cutoff)
    {
        return SensorData::where('created_at', '<', $cutoff);
    }
}
