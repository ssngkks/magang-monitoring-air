<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth as AuthFacade;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class VerifyFirebaseToken
{
    /* =========================================================================
     * TEMPLATE KODE LAMA FIREBASE TOKEN VERIFICATION (JANGAN DIHAPUS - UNTUK TEMPLATE)
     * =========================================================================
     * public function __construct(protected \Kreait\Firebase\Contract\Auth $auth) {}
     *
     * public function handle(Request $request, Closure $next): Response
     * {
     *     $token = $request->bearerToken();
     *     if (!$token) return response()->json(['message' => 'Unauthenticated.'], 401);
     *     try {
     *         $verifiedIdToken = $this->auth->verifyIdToken($token);
     *         $uid = (string) $verifiedIdToken->claims()->get('sub');
     *         $claims = $verifiedIdToken->claims()->all();
     *         ...
     *     } catch (\Throwable $e) { ... }
     * }
     * ========================================================================= */

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (! $token) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Cek token via Laravel Sanctum
        $accessToken = PersonalAccessToken::findToken($token);

        if ($accessToken) {
            $user = $accessToken->tokenable;
            if ($user instanceof User) {
                AuthFacade::setUser($user);
                $request->setUserResolver(fn () => $user);
                $request->attributes->set('user', $user);
                $request->attributes->set('firebase_uid', (string) $user->id);

                return $next($request);
            }
        }

        // Cek jika sudah terautentikasi oleh guard
        $guardUser = AuthFacade::guard('sanctum')->user() ?? AuthFacade::user();
        if ($guardUser) {
            $request->attributes->set('user', $guardUser);
            $request->attributes->set('firebase_uid', (string) $guardUser->id);

            return $next($request);
        }

        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
