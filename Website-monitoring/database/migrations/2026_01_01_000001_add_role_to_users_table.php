<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // MySQL supports ->after(), SQLite (testing :memory:) tidak.
            // Conditional untuk menjaga MySQL sebagai target utama tetap valid saat test SQLite.
            if (Schema::getConnection()->getDriverName() !== 'sqlite') {
                $table->enum('role', ['admin', 'user'])->default('user')->after('password');
            } else {
                $table->enum('role', ['admin', 'user'])->default('user');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};
