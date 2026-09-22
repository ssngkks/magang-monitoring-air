<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('firmwares', function (Blueprint $table) {
            // Path di dalam Firebase Storage bucket, contoh: firmwares/v1.0.2_node_firmware.bin
            $table->string('firebase_storage_path')->nullable()->after('file_path');
            // URL download publik Firebase Storage (Google CDN - bisa diakses dari manapun)
            $table->text('firebase_storage_url')->nullable()->after('firebase_storage_path');
        });
    }

    public function down(): void
    {
        Schema::table('firmwares', function (Blueprint $table) {
            $table->dropColumn(['firebase_storage_path', 'firebase_storage_url']);
        });
    }
};
