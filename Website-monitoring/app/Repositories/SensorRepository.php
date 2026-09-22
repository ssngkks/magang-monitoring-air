<?php

namespace App\Repositories;

use App\Models\Sensor;
use Google\Cloud\Firestore\FieldValue;

class SensorRepository
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
                        parent::__construct('sensors');
                    }
                };
            }
        } catch (\Throwable $e) {
            $this->firestoreRepo = null;
        }
    }

    public function getByNodeId(string|int $nodeId): array
    {
        if ($this->firestoreRepo) {
            try {
                $query = $this->firestoreRepo->where('node_id', '=', (string) $nodeId);
                $list = $this->firestoreRepo->get($query);
                if (! empty($list)) {
                    return $list;
                }
            } catch (\Throwable $e) {
            }
        }

        try {
            return Sensor::with('sensorType')->where('node_id', $nodeId)->get()->toArray();
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
            $s = Sensor::with('sensorType')->find($id);

            return $s ? $s->toArray() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    public function create(array $data): array
    {
        $created = null;
        try {
            $model = Sensor::create($data);
            $created = $model->load('sensorType')->toArray();
        } catch (\Throwable $e) {
        }

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
            }
        }

        return $created ?? array_merge(['id' => uniqid('sens_')], $data);
    }

    public function update(string|int $id, array $data): bool
    {
        $updated = false;
        try {
            $s = Sensor::find($id);
            if ($s) {
                $s->update($data);
                $updated = true;
            }
        } catch (\Throwable $e) {
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
            $s = Sensor::find($id);
            if ($s) {
                $s->delete();
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
