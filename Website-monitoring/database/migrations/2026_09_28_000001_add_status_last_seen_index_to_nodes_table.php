<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Index (status, last_seen_at) mempercepat filter daftar perangkat
        // saat dibuka dari banyak device. try/catch agar idempoten di
        // MySQL maupun SQLite (tanpa doctrine/dbal).
        try {
            Schema::table('nodes', function (Blueprint $table) {
                $table->index(['status', 'last_seen_at'], 'nodes_status_last_seen_at_index');
            });
        } catch (Throwable $e) {
            // Index sudah ada / driver tidak mendukung — abaikan.
        }
    }

    public function down(): void
    {
        try {
            Schema::table('nodes', function (Blueprint $table) {
                $table->dropIndex('nodes_status_last_seen_at_index');
            });
        } catch (Throwable $e) {
            // Index tidak ada — abaikan.
        }
    }
};
