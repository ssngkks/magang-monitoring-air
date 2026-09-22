<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sensor_data_hourly', function (Blueprint $table) {
            $table->id();
            $table->foreignId('node_id')->constrained()->cascadeOnDelete();
            $table->decimal('avg_ph', 4, 2)->nullable();
            $table->decimal('avg_temp', 5, 2)->nullable();
            $table->decimal('avg_turbidity', 6, 2)->nullable();
            $table->dateTime('hour');
            $table->timestamps();

            $table->unique(['node_id', 'hour']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sensor_data_hourly');
    }
};
