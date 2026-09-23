<?php

namespace App\Repositories;

use App\Models\OtaUpdate;

class OtaUpdateRepository
{
    public function getPendingForNode(string|int $nodeId, ?string $kodeNode = null): ?array
    {
        try {
            $query = OtaUpdate::with('firmware')
                ->whereIn('status', ['pending', 'downloading', 'installing']);

            $query->where(function ($q) use ($nodeId, $kodeNode) {
                $q->where('node_id', (string) $nodeId);
                if ($kodeNode) {
                    $q->orWhere('kode_node', $kodeNode);
                }
            });

            $u = $query->latest('scheduled_at')->first() ?? $query->latest('created_at')->first();

            return $u ? $u->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function getLatestForNode(string|int $nodeId, ?string $kodeNode = null): ?array
    {
        try {
            $query = OtaUpdate::with('firmware');
            $query->where(function ($q) use ($nodeId, $kodeNode) {
                $q->where('node_id', (string) $nodeId);
                if ($kodeNode) {
                    $q->orWhere('kode_node', $kodeNode);
                }
            });

            $u = $query->latest('scheduled_at')->first() ?? $query->latest('created_at')->first();

            return $u ? $u->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function find(string|int $id): ?array
    {
        try {
            $u = OtaUpdate::with('firmware')->find($id);

            return $u ? $u->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Pending aktif (pending/downloading/installing) untuk firmware yang sama.
     * Dipakai mencegah duplikat trigger yang menumpuk dan memicu flash berulang.
     */
    public function getPendingForFirmware(string|int $nodeId, ?string $kodeNode, string|int $firmwareId): ?array
    {
        try {
            $query = OtaUpdate::with('firmware')
                ->whereIn('status', ['pending', 'downloading', 'installing'])
                ->where('firmware_id', $firmwareId);
            $query->where(function ($q) use ($nodeId, $kodeNode) {
                $q->where('node_id', (string) $nodeId);
                if ($kodeNode) {
                    $q->orWhere('kode_node', $kodeNode);
                }
            });

            $u = $query->latest('scheduled_at')->first();

            return $u ? $u->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Rekonsiliasi: tutup job aktif yang targetnya sudah tercapai/terlewati oleh
     * versi yang SEDANG BERJALAN di device (dilaporkan via hello/heartbeat).
     * Self-healing untuk: flash USB (tanpa lapor), laporan success yang hilang,
     * dan baris basi. TIDAK PERNAH membuka job baru — hanya menutup.
     */
    public function reconcileByReportedVersion(string $kodeNode, ?string $runningVersion): int
    {
        $running = self::normalizeVersion($runningVersion);
        if ($running === '') {
            return 0;
        }

        try {
            $rows = OtaUpdate::with('firmware')
                ->where('kode_node', $kodeNode)
                ->whereIn('status', ['pending', 'downloading', 'installing'])
                ->get();

            $closed = 0;
            foreach ($rows as $row) {
                $target = self::normalizeVersion($row->firmware?->version ?? '');
                if ($target === '') {
                    continue;
                }
                if ($target === $running || self::isNewerOrEqual($running, $target)) {
                    $row->update([
                        'status' => 'success',
                        'progress_percent' => 100,
                        'completed_at' => now(),
                    ]);
                    $closed++;
                }
            }

            return $closed;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /**
     * Normalisasi label versi: trim + buang satu huruf v/V di depan
     * ("v1.0.2" dianggap sama dengan "1.0.2").
     */
    public static function normalizeVersion(?string $version): string
    {
        $v = trim((string) ($version ?? ''));
        if (str_starts_with($v, 'v') || str_starts_with($v, 'V')) {
            $v = substr($v, 1);
        }

        return trim($v);
    }

    /**
     * True bila $running lebih baru/sama dari $target. Hanya untuk label
     * numerik bertitik; label aneh → false (fallback ke equality persis).
     */
    protected static function isNewerOrEqual(string $running, string $target): bool
    {
        if (! preg_match('/^\d+(\.\d+)*$/', $running) || ! preg_match('/^\d+(\.\d+)*$/', $target)) {
            return false;
        }

        return version_compare($running, $target, '>=');
    }

    /**
     * Tandai job aktif milik kode_node agar tidak ada sisa pending yang memicu
     * flash berulang. Bila $firmwareVersion diisi, HANYA baris dengan firmware
     * berversi itu yang disentuh — antrean versi lain tidak ikut terbunuh.
     */
    public function updateStatusForDevice(string $kodeNode, string $status, int $progress = 0, ?string $error = null, ?string $firmwareVersion = null): int
    {
        try {
            $payload = ['status' => $status, 'progress_percent' => $progress];
            if ($error !== null) {
                $payload['error_message'] = $error;
            }
            if ($status === 'success' || $status === 'failed') {
                $payload['completed_at'] = now();
            }

            $ids = OtaUpdate::with('firmware')
                ->where('kode_node', $kodeNode)
                ->whereIn('status', ['pending', 'downloading', 'installing'])
                ->get()
                ->filter(function ($row) use ($firmwareVersion) {
                    if ($firmwareVersion === null || $firmwareVersion === '') {
                        return true;
                    }

                    return self::normalizeVersion($row->firmware?->version ?? '') === self::normalizeVersion($firmwareVersion);
                })
                ->map(fn ($row) => $row->id)
                ->all();

            if (empty($ids)) {
                return 0;
            }

            return OtaUpdate::whereIn('id', $ids)->update($payload);
        } catch (\Throwable $e) {
            return 0;
        }
    }

    public function create(array $data): array
    {
        $u = OtaUpdate::create($data);

        return $u->load('firmware')->toArray();
    }

    public function updateStatus(string|int $id, string $status, int $progress = 0, ?string $error = null): bool
    {
        try {
            $u = OtaUpdate::find($id);
            if ($u) {
                $payload = [
                    'status' => $status,
                    'progress_percent' => $progress,
                ];
                if ($error !== null) {
                    $payload['error_message'] = $error;
                }
                if ($status === 'success' || $status === 'failed') {
                    $payload['completed_at'] = now();
                }
                $u->update($payload);

                return true;
            }
        } catch (\Throwable $e) {
        }

        return false;
    }
}
