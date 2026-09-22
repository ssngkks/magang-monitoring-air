<?php

namespace App\Auth;

use App\Models\FirebaseUser;
use App\Repositories\UserRepository;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\UserProvider;

class FirestoreUserProvider implements UserProvider
{
    public function __construct(protected UserRepository $users) {}

    public function retrieveById($identifier): ?Authenticatable
    {
        $user = $this->users->findById((string) $identifier);

        return $user ? new FirebaseUser($user) : null;
    }

    public function retrieveByToken($identifier, $token): ?Authenticatable
    {
        return null;
    }

    public function updateRememberToken(Authenticatable $user, $token): void {}

    public function retrieveByCredentials(array $credentials): ?Authenticatable
    {
        if (empty($credentials['email'])) {
            return null;
        }
        $user = $this->users->findByEmail($credentials['email']);

        return $user ? new FirebaseUser($user) : null;
    }

    public function validateCredentials(Authenticatable $user, array $credentials): bool
    {
        if (! $user instanceof FirebaseUser) {
            return false;
        }

        return $user->getAuthPassword() === $credentials['password'];
    }

    public function rehashPasswordIfRequired(Authenticatable $user, array $credentials, bool $force = false): void {}
}
