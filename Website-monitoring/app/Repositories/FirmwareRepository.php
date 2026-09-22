<?php

namespace App\Repositories;

use App\Models\Firmware;
use Illuminate\Support\Facades\Storage;

class FirmwareRepository
{
    public function getAll(): array
    {
        try {
            $list = Firmware::with(['otaUpdates' => function ($q) {
                $q->latest();
            }])->orderBy('created_at', 'desc')->get()->map(function ($fw) {
                $arr = $fw->toArray();
                $latestOta = $fw->otaUpdates->first();
                $arr['latest_ota'] = $latestOta ? [
                    'id' => $latestOta->id,
                    'node_id' => $latestOta->node_id,
                    'status' => $latestOta->status,
                    'progress_percent' => $latestOta->progress_percent,
                    'error_message' => $latestOta->error_message,
                    'scheduled_at' => $latestOta->scheduled_at ? $latestOta->scheduled_at->toIso8601String() : null,
                    'completed_at' => $latestOta->completed_at ? $latestOta->completed_at->toIso8601String() : null,
                    'node_name' => $latestOta->kode_node ?: $latestOta->node_id,
                    'kode_node' => $latestOta->kode_node ?: $latestOta->node_id,
                ] : null;

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

    public function delete(string|int $id): bool
    {
        try {
            $f = Firmware::find($id);
            if ($f) {
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
            }

            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }
}
