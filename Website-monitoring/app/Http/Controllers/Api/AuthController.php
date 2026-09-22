<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Repositories\UserRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth as AuthFacade;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Kreait\Firebase\Contract\Auth as FirebaseAuth;

class AuthController extends Controller
{
    protected ?FirebaseAuth $firebaseAuth = null;

    public function __construct(
        protected UserRepository $userRepo,
    ) {
        // =========================================================================
        // TEMPLATE RESOLVER FIREBASE AUTH (JANGAN DIHAPUS - UNTUK TEMPLATE)
        // =========================================================================
        // try {
        //     $this->firebaseAuth = app(\Kreait\Firebase\Contract\Auth::class);
        // } catch (\Throwable $e) {}
    }

    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'confirmed', Password::defaults()],
        ]);

        /* =========================================================================
         * TEMPLATE KODE LAMA FIREBASE AUTH (JANGAN DIHAPUS - UNTUK TEMPLATE PROJEK LAIN)
         * =========================================================================
         * $userProperties = [
         *     'email' => $validated['email'],
         *     'password' => $validated['password'],
         *     'displayName' => $validated['name'],
         * ];
         * try {
         *     $createdUser = $this->firebaseAuth->createUser($userProperties);
         *     $uid = (string) $createdUser->uid;
         *     $userProfile = [
         *         'id' => $uid,
         *         'name' => $validated['name'],
         *         'email' => $validated['email'],
         *         'role' => 'user',
         *     ];
         *     $this->userRepo->createUser($userProfile, $uid);
         *     $customToken = $this->firebaseAuth->createCustomToken($uid)->toString();
         *     return response()->json([
         *         'message' => 'Registrasi berhasil.',
         *         'data' => [
         *             'user' => $userProfile,
         *             'token' => $customToken,
         *             'firebase_uid' => $uid,
         *         ],
         *     ], 201);
         * } catch (\Throwable $e) { ... }
         * ========================================================================= */

        // IMPLEMENTASI LOCAL DATABASE (MySQL & phpMyAdmin)
        try {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => 'user',
            ]);

            $token = $user->createToken('auth_token')->plainTextToken;

            $userProfile = [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'avatar' => $user->avatar,
            ];

            return response()->json([
                'message' => 'Registrasi berhasil.',
                'data' => [
                    'user' => $userProfile,
                    'token' => $token,
                    'id' => (string) $user->id,
                ],
            ], 201);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Registrasi gagal: '.$e->getMessage(),
            ], 500);
        }
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        /* =========================================================================
         * TEMPLATE KODE LAMA FIREBASE AUTH (JANGAN DIHAPUS - UNTUK TEMPLATE PROJEK LAIN)
         * =========================================================================
         * try {
         *     $signInResult = $this->firebaseAuth->signInWithEmailAndPassword(
         *         $validated['email'],
         *         $validated['password']
         *     );
         *     $idToken = $signInResult->idToken();
         *     $uid = $signInResult->firebaseUserId();
         *     $userProfile = $this->userRepo->findById($uid);
         *     return response()->json([
         *         'message' => 'Login berhasil.',
         *         'data' => [
         *             'user' => [
         *                 'id' => $uid,
         *                 'name' => $userProfile['name'] ?? '',
         *                 'email' => $userProfile['email'] ?? $validated['email'],
         *                 'role' => $userProfile['role'] ?? 'user',
         *             ],
         *             'token' => $idToken,
         *             'refresh_token' => $signInResult->refreshToken(),
         *         ],
         *     ]);
         * } catch (\Throwable $e) { ... }
         * ========================================================================= */

        // IMPLEMENTASI LOCAL DATABASE (MySQL & phpMyAdmin)
        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'message' => 'Email atau kata sandi tidak sesuai.',
                'errors' => [
                    'email' => ['Kredensial yang diberikan tidak cocok dengan data kami.'],
                ],
            ], 401);
        }

        $user->update(['last_login_at' => now()]);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Login berhasil.',
            'data' => [
                'user' => [
                    'id' => (string) $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'avatar' => $user->avatar,
                ],
                'token' => $token,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        /* =========================================================================
         * TEMPLATE KODE LAMA FIREBASE AUTH (JANGAN DIHAPUS - UNTUK TEMPLATE PROJEK LAIN)
         * =========================================================================
         * $uid = (string) (AuthFacade::id() ?? $request->attributes->get('firebase_uid'));
         * if ($uid && $this->firebaseAuth) {
         *     try {
         *         $this->firebaseAuth->revokeRefreshTokens($uid);
         *     } catch (\Throwable $e) {}
         * }
         * ========================================================================= */

        // IMPLEMENTASI LOCAL DATABASE (MySQL & phpMyAdmin)
        $user = $request->user();
        if ($user) {
            try {
                if (method_exists($user, 'currentAccessToken') && $user->currentAccessToken()) {
                    $user->currentAccessToken()->delete();
                } else {
                    $user->tokens()->delete();
                }
            } catch (\Throwable $e) {
            }
        }

        return response()->json([
            'message' => 'Logout berhasil.',
        ]);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        /* =========================================================================
         * TEMPLATE KODE LAMA FIREBASE AUTH (JANGAN DIHAPUS - UNTUK TEMPLATE PROJEK LAIN)
         * =========================================================================
         * $uid = (string) (AuthFacade::id() ?? $request->attributes->get('firebase_uid'));
         * $profile = $uid ? $this->userRepo->findById($uid) : null;
         * return response()->json(['data' => ['id' => $uid, ...]]);
         * ========================================================================= */

        // IMPLEMENTASI LOCAL DATABASE (MySQL & phpMyAdmin)
        if ($user) {
            return response()->json([
                'data' => [
                    'id' => (string) $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role ?? 'user',
                    'avatar' => $user->avatar,
                ],
            ]);
        }

        return response()->json(['message' => 'Unauthenticated.'], 401);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'avatar' => ['sometimes', 'nullable', 'string'],
        ]);

        $updates = [];
        if (array_key_exists('name', $validated)) {
            $updates['name'] = $validated['name'];
        }
        if (array_key_exists('avatar', $validated)) {
            $updates['avatar'] = $validated['avatar'];
        }

        if (empty($updates)) {
            return response()->json(['message' => 'Tidak ada perubahan.'], 422);
        }

        /* =========================================================================
         * TEMPLATE KODE LAMA FIREBASE (JANGAN DIHAPUS - UNTUK TEMPLATE PROJEK LAIN)
         * =========================================================================
         * try {
         *     $this->userRepo->update($uid, $updates);
         *     if (isset($updates['name']) && $this->firebaseAuth) {
         *         $this->firebaseAuth->updateUser($uid, ['displayName' => $updates['name']]);
         *     }
         * } catch (\Throwable $e) {}
         * ========================================================================= */

        // IMPLEMENTASI LOCAL DATABASE (MySQL & phpMyAdmin)
        $user->update($updates);

        return response()->json([
            'message' => 'Profil berhasil disimpan ke database lokal MySQL.',
            'data' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role ?? 'user',
                'avatar' => $user->avatar,
            ],
        ]);
    }
}
