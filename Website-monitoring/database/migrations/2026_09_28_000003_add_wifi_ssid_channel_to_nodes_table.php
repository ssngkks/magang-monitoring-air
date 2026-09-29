<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // SSID + channel WiFi gateway (dikirim tiap hello/heartbeat).
        // Nullable: node sensor tidak mengirimnya; null = tampil '-'.
        // Tanpa ->after() agar jalan di SQLite maupun MySQL.
        foreach (['wifi_ssid', 'wifi_channel'] as $col) {
            try {
                Schema::table('nodes', function (Blueprint $table) use ($col) {
                    if ($col === 'wifi_ssid') {
                        $table->string('wifi_ssid', 100)->nullable();
                    } else {
                        $table->unsignedTinyInteger('wifi_channel')->nullable();
                    }
                });
            } catch (Throwable $e) {
                // Kolom sudah ada / driver tidak mendukung — abaikan.
            }
        }
    }

    public function down(): void
    {
        try {
            Schema::table('nodes', function (Blueprint $table) {
                $table->dropColumn(['wifi_ssid', 'wifi_channel']);
            });
        } catch (Throwable $e) {
            // Kolom tidak ada — abaikan.
        }
    }
};
