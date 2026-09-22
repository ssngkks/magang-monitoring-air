<?php

namespace App\Repositories;

use Google\Cloud\Firestore\FieldValue;

class DeviceTypeRepository
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
                        parent::__construct('jenis_perangkat');
                    }
                };
            }
        } catch (\Throwable $e) {
            $this->firestoreRepo = null;
        }
    }

    public function getByUserId(string $userId): array
    {
        if ($this->firestoreRepo) {
            try {
                $query = $this->firestoreRepo->where('user_id', '=', (string) $userId);
                $list = $this->firestoreRepo->get($query);
                if (! empty($list)) {
                    return $list;
                }
            } catch (\Throwable $e) {
            }
        }

        // Fallback file/sqlite storage if needed
        return $this->getLocalData();
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

        return $this->getLocalData();
    }

    public function find(string $id): ?array
    {
        if ($this->firestoreRepo) {
            try {
                $doc = $this->firestoreRepo->find($id);
                if ($doc) {
                    return $doc;
                }
            } catch (\Throwable $e) {
            }
        }

        foreach ($this->getLocalData() as $item) {
            if ($item['id'] === $id) {
                return $item;
            }
        }

        return null;
    }

    public function create(array $data): array
    {
        $id = uniqid('devtype_');
        $data['id'] = $id;
        $data['created_at'] = now()->toIso8601String();

        if ($this->firestoreRepo) {
            try {
                $fsData = $data;
                $fsData['created_at'] = FieldValue::serverTimestamp();
                $fsId = $this->firestoreRepo->create($fsData);
                $data['id'] = $fsId;
            } catch (\Throwable $e) {
            }
        }

        $all = $this->getLocalData();
        $all[] = $data;
        $this->saveLocalData($all);

        return $data;
    }

    public function update(string $id, array $data): bool
    {
        $updated = false;
        if ($this->firestoreRepo) {
            try {
                $this->firestoreRepo->update($id, $data);
                $updated = true;
            } catch (\Throwable $e) {
            }
        }

        $all = $this->getLocalData();
        foreach ($all as &$item) {
            if ($item['id'] === $id) {
                $item = array_merge($item, $data);
                $updated = true;
                break;
            }
        }
        $this->saveLocalData($all);

        return $updated;
    }

    public function delete(string $id): bool
    {
        $deleted = false;
        if ($this->firestoreRepo) {
            try {
                $this->firestoreRepo->delete($id);
                $deleted = true;
            } catch (\Throwable $e) {
            }
        }

        $all = $this->getLocalData();
        $filtered = array_values(array_filter($all, fn ($item) => $item['id'] !== $id));
        if (count($filtered) !== count($all)) {
            $this->saveLocalData($filtered);
            $deleted = true;
        }

        return $deleted;
    }

    protected function getStoragePath(): string
    {
        return storage_path('app/jenis_perangkat.json');
    }

    protected function getLocalData(): array
    {
        $path = $this->getStoragePath();
        if (file_exists($path)) {
            $content = file_get_contents($path);

            return json_decode($content, true) ?: [];
        }

        return [
            ['id' => 'devtype_node', 'name' => 'Node Sensor', 'description' => 'ESP32 Node pembaca sensor air & lingkungan'],
            ['id' => 'devtype_gateway', 'name' => 'Gateway LoRa', 'description' => 'ESP32 Gateway TinyML penerima LoRa & pengirim RTDB'],
        ];
    }

    protected function saveLocalData(array $data): void
    {
        try {
            $path = $this->getStoragePath();
            if (! file_exists(dirname($path))) {
                @mkdir(dirname($path), 0755, true);
            }
            file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
        } catch (\Throwable $e) {
        }
    }
}
