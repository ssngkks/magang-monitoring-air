<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('locations')) {
            Schema::create('locations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->string('name');
                $table->string('code')->nullable()->unique();
                $table->text('description')->nullable();
                $table->string('address')->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->timestamps();
            });
        }

        Schema::table('nodes', function (Blueprint $table) {
            if (! Schema::hasColumn('nodes', 'location_id')) {
                $table->foreignId('location_id')->nullable()->after('user_id')->constrained('locations')->nullOnDelete();
            }
            if (! Schema::hasColumn('nodes', 'device_name')) {
                $table->string('device_name')->nullable()->after('kode_node');
            }
            if (! Schema::hasColumn('nodes', 'model_type')) {
                $table->string('model_type')->default('ESP32')->after('device_name');
            }
            if (! Schema::hasColumn('nodes', 'firmware_version')) {
                $table->string('firmware_version')->default('1.0.0')->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            if (Schema::hasColumn('nodes', 'location_id')) {
                $table->dropConstrainedForeignId('location_id');
            }
            if (Schema::hasColumn('nodes', 'device_name')) {
                $table->dropColumn('device_name');
            }
            if (Schema::hasColumn('nodes', 'model_type')) {
                $table->dropColumn('model_type');
            }
            if (Schema::hasColumn('nodes', 'firmware_version')) {
                $table->dropColumn('firmware_version');
            }
        });

        Schema::dropIfExists('locations');
    }
};
