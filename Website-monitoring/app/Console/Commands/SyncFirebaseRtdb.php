<?php

namespace App\Console\Commands;

use App\Services\FirebaseSyncService;
use Illuminate\Console\Command;

class SyncFirebaseRtdb extends Command
{
    protected $signature = 'firebase:sync-rtdb {--limit=100 : Jumlah record history terakhir yang disinkronkan} {--force : Paksa sinkronisasi abaikan cooldown}';

    protected $description = 'Sinkronisasi data pembacaan sensor terbaru dari Firebase Realtime Database ke Cloud Firestore.';

    public function handle(FirebaseSyncService $syncService): int
    {
        $limit = (int) $this->option('limit');
        $force = (bool) $this->option('force');

        $this->info("Memulai sinkronisasi data dari Firebase Realtime Database (limit: {$limit})...");

        $result = $syncService->syncFromRealtimeDatabase(null, null, true, $limit, $force);

        if (($result['status'] ?? '') === 'success') {
            $count = $result['synced_count'] ?? 0;
            $this->info("Berhasil sinkronisasi {$count} data ke Firestore (Node: {$result['node_id']}).");

            return Command::SUCCESS;
        }

        if (($result['status'] ?? '') === 'skipped') {
            $this->warn('Sinkronisasi dilewati: '.($result['message'] ?? 'Cooldown'));

            return Command::SUCCESS;
        }

        $this->error('Gagal sinkronisasi: '.($result['message'] ?? 'Unknown error'));

        return Command::FAILURE;
    }
}
