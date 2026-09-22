<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        // CSP: allow self, unsafe-inline for Vite/Tailwind, ws/wss for Reverb, dicebear for avatars
        if (! $response->headers->has('Content-Security-Policy')) {
            $csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src 'self' https://fonts.bunny.net data:; img-src 'self' data: blob: https://api.dicebear.com; connect-src 'self' ws: wss: http://localhost:* https://localhost:*";
            // Only set CSP in production to avoid breaking dev HMR if too strict; still set header but report-only in debug
            if (app()->environment('production')) {
                $response->headers->set('Content-Security-Policy', $csp);
            } else {
                $response->headers->set('Content-Security-Policy-Report-Only', $csp);
            }
        }

        // Remove X-Powered-By
        $response->headers->remove('X-Powered-By');

        return $response;
    }
}
