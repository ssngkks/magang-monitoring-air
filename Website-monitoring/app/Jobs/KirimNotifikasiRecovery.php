<?php

namespace App\Jobs;

use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class KirimNotifikasiRecovery implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 10;

    public function __construct(public array $node, public string $previousStatus) {}

    public function handle(): void
    {
        // Pengiriman notifikasi Telegram dialihkan sepenuhnya ke ESP32 Gateway (lora2.ino)
        // untuk mencegah pengiriman ganda (double notifications).
        Log::info('Pengiriman recovery Telegram dari website dinonaktifkan (ditangani oleh ESP32 Gateway).');

        return;

        $timestamp = Carbon::now()->locale('id')->isoFormat('D MMMM Y, HH:mm:ss').' WIB';

        $teks = "✅ *EDGE AI UPDATE*\n\n"
            ."Status kembali *NORMAL*\n"
            ."Waktu: {$timestamp}\n"
            .'Kondisi seluruh parameter telah stabil kembali.';

        $this->kirimTelegram($teks);
    }

    private function kirimTelegram(string $teks): void
    {
        $botToken = config('services.telegram.bot_token');
        $chatId = config('services.telegram.chat_id');

        if (! $botToken || ! $chatId) {
            Log::info('Telegram belum dikonfigurasi, notifikasi recovery dilewati.', [
                'node_id' => $this->node['id'] ?? null,
            ]);

            return;
        }

        $response = Http::timeout(5)->asForm()->post("https://api.telegram.org/bot{$botToken}/sendMessage", [
            'chat_id' => $chatId,
            'text' => $teks,
            'parse_mode' => 'Markdown',
        ]);

        if ($response->failed()) {
            Log::error('Telegram recovery notification gagal', [
                'node_id' => $this->node['id'] ?? null,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            $response->throw();
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::critical('KirimNotifikasiRecovery gagal setelah semua retry', [
            'node_id' => $this->node['id'] ?? null,
            'previous_status' => $this->previousStatus,
            'error' => $exception->getMessage(),
        ]);
    }
}
