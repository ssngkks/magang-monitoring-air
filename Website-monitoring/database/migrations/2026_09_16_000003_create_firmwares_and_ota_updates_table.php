<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('firmwares')) {
            Schema::create('firmwares', function (Blueprint $table) {
                $table->id();
                $table->string('version');
                $table->string('name');
                $table->string('file_path');
                $table->unsignedBigInteger('file_size')->default(0);
                $table->string('checksum_sha256')->nullable();
                $table->string('target_device_model')->default('ESP32');
                $table->text('changelog')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('ota_updates')) {
            Schema::create('ota_updates', function (Blueprint $table) {
                $table->id();
                $table->foreignId('node_id')->constrained()->cascadeOnDelete();
                $table->foreignId('firmware_id')->constrained('firmwares')->cascadeOnDelete();
                $table->enum('status', ['pending', 'downloading', 'installing', 'success', 'failed'])->default('pending');
                $table->unsignedTinyInteger('progress_percent')->default(0);
                $table->text('error_message')->nullable();
                $table->timestamp('scheduled_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();

                $table->index(['node_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ota_updates');
        Schema::dropIfExists('firmwares');
    }
};
