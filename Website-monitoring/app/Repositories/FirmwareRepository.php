<?php

namespace App\Repositories;

use App\Models\Firmware;
use App\Models\Node;
use Illuminate\Support\Facades\Storage;

class FirmwareRepository
{
    public function getAll(): array
    {
        try {
            $rows = Firmware::with(['otaUpdates' => function ($q) {
                $q->latest();
            }])->orderBy('created_at', 'desc')->get();
            $installedMap = $this->installedMap();
            $runningMap = $this->runningVersionsMap();
            $list = $rows->map(function ($fw) use ($rows, $installedMap, $runningMap) {
                $arr = $fw->toArray();
                $arr['active_ota_count'] = $fw->otaUpdates->whereIn('status', ['pending', 'downloading', 'installing'])->count();
                $latestOta = $fw->otaUpdates->first();
                $arr['latest_ota'] = $latestOta ? [
                    'id' => $latestOta->id,
                    'node_id' => $latestOta->node_id,
                    'status' => $latestOta->status,
                    'progress_percent' => $latestOta->progress_percent,
                    'error_message' => $latestOta->error_message,
                    'scheduled_at' => $latestOta->scheduled_at ? $latestOta->scheduled_at->toIso8601String() : null,
                    'completed_at' => $latestOta->completed_at ? $latestOta->completed_at->toIso8601String() : null,
                    'updated_at' => $latestOta->updated_at ? $latestOta->updated_at->toIso8601String() : null,
                    'node_name' => $latestOta->kode_node ?: $latestOta->node_id,
                    'kode_node' => $latestOta->kode_node ?: $latestOta->node_id,
                ] : null;

                // Status repository per firmware — sumber kebenaran dari backend:
                // versi terpasang di node dan job OTA terakhir.
                $normVersion = OtaUpdateRepository::normalizeVersion($fw->version ?? '');
                $arr['installed_on'] = $normVersion !== '' ? ($installedMap[$normVersion] ?? []) : [];
                $arr['is_latest_for_model'] = $this->isLatestForModel($arr, $rows);
                $arr['binary_exists'] = $this->binaryExists($fw->file_path);
                $arr['binary_deleted'] = ! $arr['binary_exists'];
                $arr['repo_status'] = $this->resolveRepoStatus($arr);
                // Target perangkat: node unik yang pernah menjadi target deployment
                // firmware ini (dari riwayat OTA — tanpa tabel/duplikat baru).
                $arr['target_nodes'] = $this->resolveTargetNodes($fw, $runningMap, $normVersion);

                return $arr;
            })->toArray();
        } catch (\Throwable $e) {
            $list = [];
        }

        // Format file size nicely
        foreach ($list as &$fw) {
            $bytes = (int) ($fw['file_size'] ?? 0);
            if ($bytes >= 1048576) {
                $fw['file_size_formatted'] = number_format($bytes / 1048576, 1).' MB';
            } elseif ($bytes >= 1024) {
                $fw['file_size_formatted'] = number_format($bytes / 1024, 1).' KB';
            } else {
                $fw['file_size_formatted'] = $bytes.' B';
            }
        }

        return $list;
    }

    public function find(string|int $id): ?array
    {
        try {
            $f = Firmware::with(['otaUpdates' => function ($q) {
                $q->latest();
            }])->find($id);
            if (! $f) {
                return null;
            }
            $arr = $f->toArray();
            $latestOta = $f->otaUpdates->first();
            $arr['latest_ota'] = $latestOta ? [
                'id' => $latestOta->id,
                'node_id' => $latestOta->node_id,
                'status' => $latestOta->status,
                'progress_percent' => $latestOta->progress_percent,
                'error_message' => $latestOta->error_message,
                'scheduled_at' => $latestOta->scheduled_at ? $latestOta->scheduled_at->toIso8601String() : null,
                'completed_at' => $latestOta->completed_at ? $latestOta->completed_at->toIso8601String() : null,
                'updated_at' => $latestOta->updated_at ? $latestOta->updated_at->toIso8601String() : null,
                'node_name' => $latestOta->kode_node ?: $latestOta->node_id,
                'kode_node' => $latestOta->kode_node ?: $latestOta->node_id,
            ] : null;

            return $arr;
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function update(string|int $id, array $data): ?array
    {
        try {
            $f = Firmware::find($id);
            if ($f) {
                $f->update($data);

                return $f->fresh()->toArray();
            }
        } catch (\Throwable $e) {
        }

        return null;
    }

    public function getLatest(string $targetModel = 'ESP32'): ?array
    {
        try {
            $f = Firmware::where('is_active', true)
                ->where('target_device_model', $targetModel)
                ->orderBy('created_at', 'desc')
                ->first();

            return $f ? $f->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function create(array $data): array
    {
        $f = Firmware::create($data);

        return $f->toArray();
    }

    /**
     * True bila versi (normalisasi) sudah ada pada target model yang sama.
     */
    public function versionExistsForModel(string $version, ?string $targetModel, string|int|null $exceptId = null): bool
    {
        $norm = OtaUpdateRepository::normalizeVersion($version);
        if ($norm === '') {
            return false;
        }
        try {
            $query = Firmware::where('target_device_model', $targetModel ?? 'ESP32');
            if ($exceptId !== null) {
                $query->where('id', '!=', $exceptId);
            }

            foreach ($query->pluck('version') as $existing) {
                if (OtaUpdateRepository::normalizeVersion((string) $existing) === $norm) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            return false;
        }

        return false;
    }

    /**
     * Daftar kode_node yang versi terpasangnya (normalisasi) sama dengan versi
     * firmware yang diberikan.
     *
     * @return string[]
     */
    public function findInstalledNodes(string $version): array
    {
        $norm = OtaUpdateRepository::normalizeVersion($version);
        if ($norm === '') {
            return [];
        }
        $map = $this->installedMap();

        return $map[$norm] ?? [];
    }

    /**
     * Peta versi-terpasang (normalisasi) => daftar kode_node. Sumber kebenaran
     * "firmware terpasang" berasal dari kolom nodes.firmware_version.
     *
     * @return array<string, string[]>
     */
    protected function installedMap(): array
    {
        $map = [];
        try {
            foreach (Node::select('kode_node', 'firmware_version')->get() as $node) {
                $v = OtaUpdateRepository::normalizeVersion($node->firmware_version);
                if ($v === '') {
                    continue;
                }
                $map[$v][] = $node->kode_node;
            }
        } catch (\Throwable $e) {
            return [];
        }
        foreach ($map as $v => $nodes) {
            $map[$v] = array_values(array_unique($nodes));
        }

        return $map;
    }

    /**
     * True bila baris firmware adalah versi terbaru untuk target modelnya.
     * Label numerik bertitik dibandingkan semver; label lain fallback created_at.
     */
    protected function isLatestForModel(array $fw, $rows): bool
    {
        $model = (string) ($fw['target_device_model'] ?? '');
        foreach ($rows as $other) {
            if ((string) ($other->target_device_model ?? '') !== $model) {
                continue;
            }
            if ((int) $other->id === (int) ($fw['id'] ?? 0)) {
                continue;
            }
            if ($this->compareFirmwareRows($other->toArray(), $fw) > 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * >0 bila $a lebih baru dari $b; 0 bila setara; <0 bila lebih lama.
     */
    protected function compareFirmwareRows(array $a, array $b): int
    {
        $va = OtaUpdateRepository::normalizeVersion($a['version'] ?? '');
        $vb = OtaUpdateRepository::normalizeVersion($b['version'] ?? '');
        $numericA = (bool) preg_match('/^\d+(\.\d+)*$/', $va);
        $numericB = (bool) preg_match('/^\d+(\.\d+)*$/', $vb);
        if ($numericA && $numericB && $va !== $vb) {
            return version_compare($va, $vb);
        }

        return strcmp((string) ($a['created_at'] ?? ''), (string) ($b['created_at'] ?? ''));
    }

    /**
     * Peta kode_node => versi berjalan (mentah) untuk seluruh node.
     *
     * @return array<string, string|null>
     */
    protected function runningVersionsMap(): array
    {
        $map = [];
        try {
            foreach (Node::select('kode_node', 'firmware_version')->get() as $node) {
                if (! empty($node->kode_node)) {
                    $map[(string) $node->kode_node] = $node->firmware_version;
                }
            }
        } catch (\Throwable $e) {
            return [];
        }

        return $map;
    }

    /**
     * Target perangkat firmware: node unik yang pernah menjadi target
     * deployment versi ini (dari riwayat OTA yang sudah ada) beserta versi
     * yang sedang berjalan di tiap node dan flag terpasang.
     *
     * @return array<int, array{kode_node: string, running_version: string|null, installed: bool}>
     */
    protected function resolveTargetNodes($fw, array $runningMap, string $normVersion): array
    {
        $seen = [];
        foreach ($fw->otaUpdates as $job) {
            $code = trim((string) ($job->kode_node ?: $job->node_id ?: ''));
            if ($code === '' || isset($seen[$code])) {
                continue;
            }
            $seen[$code] = true;
        }
        $targets = [];
        foreach (array_keys($seen) as $code) {
            $running = $runningMap[$code] ?? null;
            $targets[] = [
                'kode_node' => $code,
                'running_version' => $running,
                'installed' => $normVersion !== '' && OtaUpdateRepository::normalizeVersion($running) === $normVersion,
            ];
        }

        return $targets;
    }

    /**
     * Status repository terkomputasi — jangan samakan "tersedia di repository"
     * dengan "terpasang di perangkat". Status "Hilang" tidak dipakai lagi:
     * file yang tak ada tidak divisualkan sebagai badge, record tetap ada.
     */
    protected function resolveRepoStatus(array $fw): string
    {
        if (! empty($fw['installed_on'])) {
            return 'Terpasang';
        }
        $latestStatus = $fw['latest_ota']['status'] ?? null;
        if (($fw['active_ota_count'] ?? 0) > 0) {
            return in_array($latestStatus, ['downloading', 'installing'], true) ? 'Flashing' : 'Menunggu';
        }
        if ($latestStatus === 'failed') {
            return 'Gagal';
        }
        if ($fw['is_latest_for_model'] ?? false) {
            return 'Tersedia';
        }

        return 'Versi Lama';
    }

    /**
     * Cek keberadaan file biner fisik di semua kandidat path storage.
     * Bila path exact tidak ketemu (record lama ber-path basi), fallback
     * mencari basename di direktori firmware yang dikenal — tanpa membuat
     * file palsu dan tanpa mengubah database.
     */
    public function binaryExists(?string $filePath): bool
    {
        return $this->resolveFirmwarePath($filePath) !== null;
    }

    /**
     * Resolve path fisik file firmware: kandidat exact dulu, lalu basename
     * di direktori firmware yang dikenal (untuk record lama ber-path basi).
     */
    public function resolveFirmwarePath(?string $filePath): ?string
    {
        if (empty($filePath)) {
            return null;
        }
        $candidates = [
            Storage::disk('local')->path($filePath),
            storage_path('app/private/'.$filePath),
            storage_path('app/'.$filePath),
        ];
        foreach ($candidates as $p) {
            if (file_exists($p)) {
                return $p;
            }
        }

        $basename = basename((string) $filePath);
        if ($basename === '' || $basename === $filePath) {
            return null;
        }
        $fallbackDirs = [
            Storage::disk('local')->path('firmwares'),
            storage_path('app/private/firmwares'),
            storage_path('app/firmwares'),
            storage_path('app/public/firmwares'),
        ];
        foreach ($fallbackDirs as $dir) {
            $p = rtrim($dir, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$basename;
            if (file_exists($p)) {
                return $p;
            }
        }

        return null;
    }

    public function delete(string|int $id): bool
    {
        try {
            $f = Firmware::find($id);
            if (! $f) {
                return false;
            }
            if (! empty($f->file_path)) {
                Storage::disk('local')->delete($f->file_path);
                if (file_exists(storage_path('app/'.$f->file_path))) {
                    @unlink(storage_path('app/'.$f->file_path));
                }
                if (file_exists(storage_path('app/private/'.$f->file_path))) {
                    @unlink(storage_path('app/private/'.$f->file_path));
                }
            }
            $f->delete();

            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }
}
