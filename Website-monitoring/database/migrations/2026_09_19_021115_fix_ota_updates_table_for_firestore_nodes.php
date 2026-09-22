<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('ota_updates');

        Schema::create('ota_updates', function (Blueprint $table) {
            $table->id();
            $table->string('node_id')->nullable()->index();
            $table->string('kode_node')->nullable()->index();
            $table->foreignId('firmware_id')->constrained('firmwares')->cascadeOnDelete();
            $table->enum('status', ['pending', 'downloading', 'installing', 'success', 'failed'])->default('pending');
            $table->unsignedTinyInteger('progress_percent')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['node_id', 'status']);
            $table->index(['kode_node', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ota_updates');
    }
};
