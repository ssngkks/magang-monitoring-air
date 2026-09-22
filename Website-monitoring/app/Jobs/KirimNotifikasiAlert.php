<?php

namespace App\Jobs;

use App\Services\AIDiagnosticService;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class KirimNotifikasiAlert implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 10;

    public function __construct(public array $alert, public ?array $node = null) {}

    public function handle(): void
    {
        // Pengiriman notifikasi Telegram dialihkan sepenuhnya ke ESP32 Gateway (lora2.ino)
        // untuk mencegah pengiriman ganda (double notifications).
        Log::info('Pengiriman notifikasi Telegram dari website dinonaktifkan (ditangani oleh ESP32 Gateway).', [
            'alert_id' => $this->alert['id'] ?? null,
        ]);

        return;

        $severity = strtolower($this->alert['severity'] ?? 'warning');
        $reading = $this->alert['reading'] ?? [];

        $aiService = app(AIDiagnosticService::class);
        $eval = ! empty($reading) ? $aiService->evaluate($reading) : null;

        $timestamp = Carbon::now()->locale('id')->isoFormat('D MMMM Y, HH:mm:ss').' WIB';
        $link = rtrim(config('app.url', 'http://localhost:5173'), '/').'/ai-analytics';

        if ($eval) {
            $isCritical = $eval['status'] === 'Bahaya' || $severity === 'critical';
            $diagnosis = $eval['diagnosis'];
            $confidence = $eval['confidence'];
            $triggers = $eval['triggers'];
        } else {
            $isCritical = $severity === 'critical';
            $diagnosis = $this->alert['pesan'] ?? 'Terdeteksi anomali pada parameter sensor kualitas air.';
            $confidence = 96.5;
            $triggers = [
                ['param' => 'Status Sensor', 'value' => $this->alert['pesan'] ?? 'Abnormal'],
            ];
        }

        $triggerLines = [];
        foreach ($triggers as $trig) {
            $triggerLines[] = "- {$trig['param']}: {$trig['value']}";
        }
        if (empty($triggerLines)) {
            $triggerLines[] = '- Nilai Sensor: Terdeteksi Anomali';
        }
        $triggerText = implode("\n", $triggerLines);

        // Format template pesan Telegram sesuai spesifikasi Section 4 prompt-analisis-ai.md
        if ($isCritical) {
            $teks = "🚨 *EDGE AI ALERT — BAHAYA*\n\n"
                ."Status: *KRITIS*\n"
                ."Waktu: {$timestamp}\n\n"
                ."Diagnosis: {$diagnosis}\n\n"
                ."Parameter pemicu:\n{$triggerText}\n\n"
                ."Confidence: {$confidence}%\n"
                ."Segera periksa sistem secara langsung.\n"
                ."Detail lengkap: {$link}";
        } else {
            $teks = "⚠️ *EDGE AI ALERT*\n\n"
                ."Status: *ANOMALI*\n"
                ."Waktu: {$timestamp}\n\n"
                ."Diagnosis: {$diagnosis}\n\n"
                ."Parameter pemicu:\n{$triggerText}\n\n"
                ."Confidence: {$confidence}%\n"
                ."Cek detail lengkap di dashboard: {$link}";
        }

        $this->kirimTelegram($teks);
    }

    private function kirimTelegram(string $teks): void
    {
        $botToken = config('services.telegram.bot_token');
        $chatId = config('services.telegram.chat_id');

        if (! $botToken || ! $chatId) {
            Log::info('Telegram belum dikonfigurasi, notifikasi dilewati.', [
                'alert_id' => $this->alert['id'] ?? null,
            ]);

            return;
        }

        $response = Http::timeout(5)->asForm()->post("https://api.telegram.org/bot{$botToken}/sendMessage", [
            'chat_id' => $chatId,
            'text' => $teks,
            'parse_mode' => 'Markdown',
        ]);

        if ($response->failed()) {
            Log::error('Telegram notification gagal', [
                'alert_id' => $this->alert['id'] ?? null,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            $response->throw();
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::critical('KirimNotifikasiAlert gagal setelah semua retry', [
            'alert_id' => $this->alert['id'] ?? null,
            'node_id' => $this->alert['node_id'] ?? null,
            'severity' => $this->alert['severity'] ?? null,
            'error' => $exception->getMessage(),
        ]);
    }
}
