<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // §8 audit.md — katalog jenis perangkat (MySQL, bukan JSON/Firestore).
        if (! Schema::hasTable('device_types')) {
            Schema::create('device_types', function (Blueprint $table) {
                $table->id();
                $table->string('code')->unique();
                $table->string('name');
                $table->string('category')->nullable();
                $table->text('description')->nullable();
                $table->string('default_role', 20)->default('node');
                $table->timestamps();
            });
        }

        // §5 audit.md — lifecycle hello → pending → active.
        Schema::table('nodes', function (Blueprint $table) {
            if (! Schema::hasColumn('nodes', 'device_type_id')) {
                $table->foreignId('device_type_id')->nullable()->after('location_id')->constrained('device_types')->nullOnDelete();
            }
            if (! Schema::hasColumn('nodes', 'device_role')) {
                $table->string('device_role', 20)->default('node')->after('model_type');
            }
            if (! Schema::hasColumn('nodes', 'capabilities')) {
                $table->json('capabilities')->nullable()->after('firmware_version');
            }
            if (! Schema::hasColumn('nodes', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('capabilities');
            }
            if (! Schema::hasColumn('nodes', 'hardware_id')) {
                $table->string('hardware_id', 50)->nullable()->after('ip_address');
            }
        });

        // Status "pending" untuk alur registrasi (§5.3). Hanya MySQL yang pakai ENUM;
        // SQLite (testing) memperlakukan kolom sebagai string biasa.
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE `nodes` MODIFY `status` ENUM('pending','active','inactive') NOT NULL DEFAULT 'pending'");
            // Device hello tanpa lokasi: nama_lokasi boleh null.
            DB::statement('ALTER TABLE `nodes` MODIFY `nama_lokasi` VARCHAR(255) NULL');
        } else {
            Schema::table('nodes', function (Blueprint $table) {
                $table->string('nama_lokasi')->nullable()->change();
            });
        }

        // §6.2 audit.md — bedakan sensor auto vs manual agar reconcile tak menimpa manual.
        Schema::table('sensors', function (Blueprint $table) {
            if (! Schema::hasColumn('sensors', 'source')) {
                $table->string('source', 10)->default('auto')->after('is_active');
            }
        });
    }

    public function down(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            if (Schema::hasColumn('sensors', 'source')) {
                $table->dropColumn('source');
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE `nodes` MODIFY `status` ENUM('active','inactive') NOT NULL DEFAULT 'active'");
        }

        Schema::table('nodes', function (Blueprint $table) {
            if (Schema::hasColumn('nodes', 'device_type_id')) {
                $table->dropConstrainedForeignId('device_type_id');
            }
            foreach (['device_role', 'capabilities', 'ip_address', 'hardware_id'] as $col) {
                if (Schema::hasColumn('nodes', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::dropIfExists('device_types');
    }
};
