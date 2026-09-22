<?php

namespace App\Models;

use Illuminate\Contracts\Auth\Authenticatable;

/**
 * @deprecated LEGACY (audit.md §11) — referensi arsip era Firebase. Bukan runtime
 * aktif (auth via Sanctum + tabel users MySQL). Jangan dipakai di kode baru.
 */
class FirebaseUser implements Authenticatable
{
    public function __construct(
        public array $data
    ) {}

    public function getAuthIdentifierName(): string
    {
        return 'id';
    }

    public function getAuthIdentifier()
    {
        return $this->data['id'] ?? null;
    }

    public function getAuthPasswordName(): string
    {
        return 'password';
    }

    public function getAuthPassword()
    {
        return $this->data['password'] ?? null;
    }

    public function getRememberTokenName(): string
    {
        return 'remember_token';
    }

    public function getRememberToken()
    {
        return $this->data['remember_token'] ?? null;
    }

    public function setRememberToken($value): void
    {
        $this->data['remember_token'] = $value;
    }

    public function __get(string $name)
    {
        return $this->data[$name] ?? null;
    }

    public function __isset(string $name): bool
    {
        return isset($this->data[$name]);
    }

    public function toArray(): array
    {
        return $this->data;
    }

    public function getFirebaseClaims(): array
    {
        return $this->data['firebase_claims'] ?? [];
    }

    public function getNodeIds(): array
    {
        return $this->getFirebaseClaims()['node_ids'] ?? [];
    }

    public function isAdmin(): bool
    {
        return ($this->data['role'] ?? '') === 'admin' || ($this->getFirebaseClaims()['admin'] ?? false);
    }
}
