<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sensor_data', function (Blueprint $table) {
            if (! Schema::hasColumn('sensor_data', 'mpu_x')) {
                $table->decimal('mpu_x', 8, 3)->nullable()->after('vibration');
            }
            if (! Schema::hasColumn('sensor_data', 'mpu_y')) {
                $table->decimal('mpu_y', 8, 3)->nullable()->after('mpu_x');
            }
            if (! Schema::hasColumn('sensor_data', 'mpu_z')) {
                $table->decimal('mpu_z', 8, 3)->nullable()->after('mpu_y');
            }
            if (! Schema::hasColumn('sensor_data', 'roll')) {
                $table->decimal('roll', 8, 2)->nullable()->after('mpu_z');
            }
            if (! Schema::hasColumn('sensor_data', 'pitch')) {
                $table->decimal('pitch', 8, 2)->nullable()->after('roll');
            }
            if (! Schema::hasColumn('sensor_data', 'yaw')) {
                $table->decimal('yaw', 8, 2)->nullable()->after('pitch');
            }
            if (! Schema::hasColumn('sensor_data', 'stability_status')) {
                $table->string('stability_status')->default('Stabil')->after('yaw');
            }
            if (! Schema::hasColumn('sensor_data', 'metadata')) {
                $table->json('metadata')->nullable()->after('ai_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('sensor_data', function (Blueprint $table) {
            $columns = ['mpu_x', 'mpu_y', 'mpu_z', 'roll', 'pitch', 'yaw', 'stability_status', 'metadata'];
            foreach ($columns as $col) {
                if (Schema::hasColumn('sensor_data', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
