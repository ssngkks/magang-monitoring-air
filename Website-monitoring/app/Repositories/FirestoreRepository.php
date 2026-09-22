<?php

namespace App\Repositories;

use Google\Cloud\Core\Timestamp;
use Google\Cloud\Firestore\CollectionReference;
use Google\Cloud\Firestore\DocumentReference;
use Google\Cloud\Firestore\FirestoreClient;
use Google\Cloud\Firestore\Query;
use Google\Cloud\Firestore\WriteBatch;

abstract class FirestoreRepository
{
    protected FirestoreClient $firestore;

    protected string $collection;

    public function __construct(string $collection)
    {
        $this->collection = $collection;
        $service = app('firebase.firestore');
        $this->firestore = $service instanceof FirestoreClient ? $service : $service->database();
    }

    protected function col(): CollectionReference
    {
        return $this->firestore->collection($this->collection);
    }

    protected function doc(string $id): DocumentReference
    {
        return $this->col()->document($id);
    }

    public function create(array $data): string
    {
        $ref = $this->col()->newDocument();
        $data['created_at'] = $data['created_at'] ?? new Timestamp(new \DateTime);
        $ref->set($data);

        return $ref->id();
    }

    public function find(string $id): ?array
    {
        $snapshot = $this->doc($id)->snapshot();
        if (! $snapshot->exists()) {
            return null;
        }
        $data = $snapshot->data();
        $data['id'] = $snapshot->id();

        return $data;
    }

    public function update(string $id, array $data): bool
    {
        $data['updated_at'] = new Timestamp(new \DateTime);
        $this->doc($id)->set($data, ['merge' => true]);

        return true;
    }

    public function delete(string $id): bool
    {
        $this->doc($id)->delete();

        return true;
    }

    public function where(string $field, string $operator, $value): Query
    {
        return $this->col()->where($field, $operator, $value);
    }

    public function whereIn(string $field, array $values): Query
    {
        return $this->col()->whereIn($field, $values);
    }

    public function orderBy(string $field, string $direction = 'DESC'): Query
    {
        return $this->col()->orderBy($field, $direction);
    }

    public function limit(int $count): Query
    {
        return $this->col()->limit($count);
    }

    public function get(?Query $query = null): array
    {
        $query = $query ?? $this->col();
        $documents = $query->documents();
        $results = [];
        foreach ($documents as $doc) {
            $data = $doc->data();
            $data['id'] = $doc->id();
            $results[] = $data;
        }

        return $results;
    }

    public function first(?Query $query = null): ?array
    {
        $results = $this->limit(1)->get($query);

        return $results[0] ?? null;
    }

    public function batch(): WriteBatch
    {
        return $this->firestore->batch();
    }

    public function commit(WriteBatch $batch): void
    {
        $batch->commit();
    }
}
