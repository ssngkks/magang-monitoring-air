<?php

use Illuminate\Support\Facades\Route;

Route::view('/{any?}', 'welcome')->where('any', '^(?!api(?:/|$)).*')->name('login');
