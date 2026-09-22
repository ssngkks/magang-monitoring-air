<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sensor_types')) {
            Schema::create('sensor_types', function (Blueprint $table) {
                $table->id();
                $table->string('code')->unique();
                $table->string('name');
                $table->string('unit')->default('');
                $table->decimal('default_min', 10, 2)->default(0);
                $table->decimal('default_max', 10, 2)->default(100);
                $table->string('icon')->default('Activity');
                $table->string('chart_type')->default('line');
                $table->json('config_schema')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('sensors')) {
            Schema::create('sensors', function (Blueprint $table) {
                $table->id();
                $table->foreignId('node_id')->constrained()->cascadeOnDelete();
                $table->foreignId('sensor_type_id')->constrained('sensor_types')->cascadeOnDelete();
                $table->string('name');
                $table->string('code');
                $table->string('pin')->nullable();
                $table->string('unit')->nullable();
                $table->decimal('min_value', 10, 2)->nullable();
                $table->decimal('max_value', 10, 2)->nullable();
                $table->decimal('warning_threshold_min', 10, 2)->nullable();
                $table->decimal('warning_threshold_max', 10, 2)->nullable();
                $table->decimal('critical_threshold_min', 10, 2)->nullable();
                $table->decimal('critical_threshold_max', 10, 2)->nullable();
                $table->json('calibration_data')->nullable();
                $table->json('config')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->unique(['node_id', 'code']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sensors');
        Schema::dropIfExists('sensor_types');
    }
};
