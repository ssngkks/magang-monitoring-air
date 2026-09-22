<?php

namespace App\Repositories;

use App\Models\User;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE USER REPOSITORY (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class UserRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('users'); }
 *     public function createUser(array $data, ?string $uid = null): string { ... }
 *     public function upsertUser(string $uid, array $data): void { ... }
 *     public function findByEmail(string $email): ?array { ... }
 *     public function findById(string $id): ?array { ... }
 *     public function updateLastLogin(string $userId): void { ... }
 * }
 * ========================================================================= */

class UserRepository
{
    public function createUser(array $data, ?string $uid = null): string
    {
        $user = User::create([
            'name' => $data['name'] ?? 'User',
            'email' => $data['email'],
            'password' => isset($data['password']) ? bcrypt($data['password']) : bcrypt('password123'),
            'role' => $data['role'] ?? 'user',
            'avatar' => $data['avatar'] ?? null,
        ]);

        return (string) $user->id;
    }

    public function upsertUser(string $uid, array $data): void
    {
        $user = User::find($uid);
        if ($user) {
            $user->update($data);
        } else {
            $this->createUser($data, $uid);
        }
    }

    public function findByEmail(string $email): ?array
    {
        $user = User::where('email', $email)->first();

        return $user ? $user->toArray() : null;
    }

    public function findById(string $id): ?array
    {
        $user = User::find($id);

        return $user ? $user->toArray() : null;
    }

    public function getUserNodes(string $userId): array
    {
        $nodeRepo = new NodeRepository;

        return $nodeRepo->getByUserId($userId);
    }

    public function updateLastLogin(string $userId): void
    {
        User::where('id', $userId)->update(['last_login_at' => now()]);
    }

    public function update(string $userId, array $data): bool
    {
        return (bool) User::where('id', $userId)->update($data);
    }
}
