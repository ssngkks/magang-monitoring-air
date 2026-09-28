<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('firmwares', function (Blueprint $table) {
            if (! Schema::hasColumn('firmwares', 'signature_ed25519')) {
                $table->string('signature_ed25519', 128)->nullable()->after('checksum_sha256');
            }
        });
    }

    public function down(): void
    {
        Schema::table('firmwares', function (Blueprint $table) {
            if (Schema::hasColumn('firmwares', 'signature_ed25519')) {
                $table->dropColumn('signature_ed25519');
            }
        });
    }
};
