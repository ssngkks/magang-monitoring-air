<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sensor_data', function (Blueprint $table) {
            $table->id();
            $table->foreignId('node_id')->constrained()->cascadeOnDelete();
            $table->decimal('ph', 4, 2)->nullable();
            $table->decimal('temp', 5, 2)->nullable();
            $table->decimal('humidity', 5, 2)->nullable();
            $table->decimal('turbidity', 6, 2)->nullable();
            $table->decimal('water_level', 6, 2)->nullable();
            $table->boolean('vibration')->default(false);
            $table->string('ai_status')->default('Normal');
            // Sesuai ERD: hanya created_at, tanpa updated_at. Model SensorData set UPDATED_AT = null.
            $table->timestamp('created_at')->useCurrent();

            $table->index(['node_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sensor_data');
    }
};
