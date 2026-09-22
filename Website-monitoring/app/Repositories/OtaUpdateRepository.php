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
