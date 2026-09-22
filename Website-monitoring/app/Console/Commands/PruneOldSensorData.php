<?php

namespace App\Console\Commands;

use App\Repositories\SensorDataRepository;
use Google\Cloud\Core\Timestamp;
use Illuminate\Console\Command;

class PruneOldSensorData extends Command
{
    protected $signature = 'sensor-data:prune {--force : lewati konfirmasi dan jalankan non-interaktif}';

    protected $description = 'Hapus pembacaan sensor lama dari Firestore (disarankan pakai native Firestore TTL policy).';

    public function handle(SensorDataRepository $sensorRepo): int
    {
        $bulanRetensi = (int) config('watermonitoring.raw_retention_months', 3);
        $batasWaktu = now()->subMonths($bulanRetensi);

        $this->info("Menyiapkan pembersihan data sebelum {$batasWaktu->toDateString()}...");

        // Query data lama menggunakan native Timestamp Firestore
        $tsBatasWaktu = new Timestamp($batasWaktu->toDateTime());
        $oldDocs = $sensorRepo->where('received_at', '<', $tsBatasWaktu)->limit(500)->documents();
        $count = 0;
        $batch = $sensorRepo->batch();

        foreach ($oldDocs as $doc) {
            $batch->delete($doc->reference());
            $count++;
        }

        if ($count === 0) {
            $this->info('Tidak ada data mentah lama yang perlu dihapus.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("Akan menghapus {$count} dokumen sensor lama. Lanjutkan?", true)) {
            $this->warn('Dibatalkan.');

            return self::SUCCESS;
        }

        $sensorRepo->commit($batch);
        $this->info("Berhasil membersihkan {$count} data sensor lama.");

        return self::SUCCESS;
    }
}
