<?php

namespace App\Repositories;

use App\Models\Location;
use Google\Cloud\Firestore\FieldValue;
use Illuminate\Support\Facades\Log;

/**
 * @deprecated Jalur Firestore di bawah ini LEGACY (audit.md §11) — bukan runtime aktif.
 * MySQL adalah satu-satunya source of truth.
 */
class LocationRepository
{
    protected ?FirestoreRepository $firestoreRepo = null;

    public function __construct()
    {
        try {
            if (config('firebase.credentials') && file_exists(base_path(config('firebase.credentials')))) {
                $this->firestoreRepo = new class extends FirestoreRepository
                {
                    public function __construct()
                    {
                        parent::__construct('locations');
                    }
                };
            }
        } catch (\Throwable $e) {
            $this->firestoreRepo = null;
        }
    }

    public function getByUserId(?string $userId = null): array
    {
        try {
            return Location::orderBy('name', 'asc')->get()->toArray();
        } catch (\Throwable $e) {
            return [];
        }
    }

    public function getAll(): array
    {
        if ($this->firestoreRepo) {
            try {
                $list = $this->firestoreRepo->get();
                if (! empty($list)) {
                    return $list;
                }
            } catch (\Throwable $e) {
            }
        }

        try {
            return Location::all()->toArray();
        } catch (\Throwable $e) {
            return [];
        }
    }

    public function find(string|int $id): ?array
    {
        if ($this->firestoreRepo && is_string($id) && ! is_numeric($id)) {
            try {
                $doc = $this->firestoreRepo->find((string) $id);
                if ($doc) {
                    return $doc;
                }
            } catch (\Throwable $e) {
            }
        }

        try {
            $loc = Location::find($id);

            return $loc ? $loc->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function create(array $data): array
    {
        // MySQL adalah source of truth: kegagalan simpan HARUS terlihat
        // (koordinat sektor pernah "berhasil" tersimpan padahal NULL karena
        // exception di sini ditelan dan API tetap menjawab 201).
        $model = Location::create($data);
        $created = $model->toArray();

        if ($this->firestoreRepo) {
            try {
                $fsData = $data;
                $fsData['created_at'] = FieldValue::serverTimestamp();
                $id = $this->firestoreRepo->create($fsData);
                $fsData['id'] = $id;
                if (! $created) {
                    $created = $fsData;
                }
            } catch (\Throwable $e) {
                Log::warning('Location Firestore mirror gagal (diabaikan, MySQL tetap utama).', [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $created;
    }

    public function update(string|int $id, array $data): bool
    {
        $updated = false;
        try {
            $loc = Location::find($id);
            if ($loc) {
                $loc->update($data);
                $updated = true;
            }
        } catch (\Throwable $e) {
            Log::error('Location update ke MySQL gagal.', ['id' => $id, 'error' => $e->getMessage()]);
            throw $e;
        }

        if ($this->firestoreRepo && is_string($id) && ! is_numeric($id)) {
            try {
                $this->firestoreRepo->update((string) $id, $data);
                $updated = true;
            } catch (\Throwable $e) {
            }
        }

        return $updated;
    }

    public function delete(string|int $id): bool
    {
        $deleted = false;
        try {
            $loc = Location::find($id);
            if ($loc) {
                $loc->delete();
                $deleted = true;
            }
        } catch (\Throwable $e) {
        }

        if ($this->firestoreRepo && is_string($id) && ! is_numeric($id)) {
            try {
                $this->firestoreRepo->delete((string) $id);
                $deleted = true;
            } catch (\Throwable $e) {
            }
        }

        return $deleted;
    }
}
