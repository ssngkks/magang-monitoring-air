<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // RSSI WiFi terakhir gateway (dari heartbeat) untuk kartu sinyal.
        // Nullable: node sensor tidak mengirimnya; null = tampil '-'.
        try {
            Schema::table('nodes', function (Blueprint $table) {
                $table->integer('wifi_rssi')->nullable()->after('hardware_id');
            });
        } catch (Throwable $e) {
            // Kolom sudah ada / driver tidak mendukung — abaikan.
        }
    }

    public function down(): void
    {
        try {
            Schema::table('nodes', function (Blueprint $table) {
                $table->dropColumn('wifi_rssi');
            });
        } catch (Throwable $e) {
            // Kolom tidak ada — abaikan.
        }
    }
};
