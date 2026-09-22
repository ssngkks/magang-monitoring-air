<?php

use App\Repositories\UserRepository;

return [

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'api'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    'guards' => [
        'api' => [
            'driver' => 'custom',
            'provider' => 'users',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'custom',
            'model' => UserRepository::class,
        ],
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => 'password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

];
