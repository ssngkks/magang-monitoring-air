<?php

namespace App\Providers;

use App\Auth\FirestoreUserProvider;
use App\Repositories\UserRepository;
use Illuminate\Auth\RequestGuard;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        if (request()->header('x-forwarded-proto') === 'https' || (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || str_starts_with(config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        RateLimiter::for('ingest', function (Request $request) {
            $key = $request->input('kode_node', $request->ip());

            return Limit::perMinute(60)->by($key);
        });

        RateLimiter::for('auth', function (Request $request) {
            $key = strtolower((string) $request->input('email')).'|'.$request->ip();

            return Limit::perMinute(5)->by($key);
        });

        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });

        Auth::provider('custom', function ($app, array $config) {
            return new FirestoreUserProvider($app->make(UserRepository::class));
        });

        Auth::extend('custom', function ($app, $name, array $config) {
            return new RequestGuard(function ($request) {
                return $request->attributes->get('user');
            }, $app['request'], $app['auth']->createUserProvider($config['provider'] ?? null));
        });
    }
}
