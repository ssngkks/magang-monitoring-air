<?php

namespace App\Repositories;

use App\Models\DeviceType;
use Illuminate\Support\Str;

/* =========================================================================
 * TEMPLATE KODE LAMA JENIS PERANGKAT JSON/FIRESTORE (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class DeviceTypeRepositoryLegacy / JSON-file (storage/app/jenis_perangkat.json)
 * + Firestore kondisional ('jenis_perangkat'):
 *   getByUserId() → firestore where user_id / getLocalData()
 *   create() → uniqid('devtype_') + saveLocalData()
 *   ... (dipakai sebelum §8 audit.md — sekarang MySQL tabel device_types)
 * ========================================================================= */

class DeviceTypeRepository
{
    /**
     * §1.3/§8: katalog global, tanpa ownership — userId diabaikan.
     */
    public function getByUserId(string $userId): array
    {
        return $this->getAll();
    }

    public function getAll(): array
    {
        return DeviceType::withCount('nodes')->orderBy('name')->get()->toArray();
    }

    public function find(string|int $id): ?array
    {
        $type = DeviceType::find($id);

        return $type ? $type->toArray() : null;
    }

    public function create(array $data): array
    {
        $type = DeviceType::create([
            'code' => $data['code'] ?? Str::slug($data['name'] ?? Str::random(6), '_'),
            'name' => $data['name'],
            'category' => $data['category'] ?? null,
            'description' => $data['description'] ?? null,
            'default_role' => $data['default_role'] ?? 'node',
        ]);

        return $type->toArray();
    }

    public function update(string|int $id, array $data): bool
    {
        $type = DeviceType::find($id);
        if (! $type) {
            return false;
        }

        return (bool) $type->update($data);
    }

    public function delete(string|int $id): bool
    {
        return (bool) DeviceType::where('id', $id)->delete();
    }
}
