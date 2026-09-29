<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\FirmwareRepository;
use App\Repositories\NodeRepository;
use App\Repositories\OtaUpdateRepository;
use App\Services\FirmwareSignerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class FirmwareOtaController extends Controller
{
    public function __construct(
        protected FirmwareRepository $firmwareRepo,
        protected OtaUpdateRepository $otaRepo,
        protected NodeRepository $nodeRepo,
        protected FirmwareSignerService $signer,
    ) {}

    public function resolveFirmwarePath(?string $filePath): ?string
    {
        // Delegasi ke repository: kandidat exact + fallback basename untuk
        // record lama ber-path basi. Satu sumber kebenaran resolusi file.
        return $this->firmwareRepo->resolveFirmwarePath($filePath);
    }

    public function indexFirmwares()
    {
        $firmwares = $this->firmwareRepo->getAll();

        return response()->json(['data' => $firmwares]);
    }

    public function uploadFirmware(Request $request)
    {
        $request->validate([
            'firmware_file' => ['required', 'file', 'max:10240'], // max 10MB
            'version' => ['required', 'string', 'max:30'],
            'name' => ['required', 'string', 'max:100'],
            'target_device_model' => ['nullable', 'string', 'max:50'],
            'changelog' => ['nullable', 'string'],
        ]);

        $version = trim((string) $request->input('version'));
        $targetModel = trim((string) $request->input('target_device_model', 'ESP32')) ?: 'ESP32';

        // Setiap versi permanen per target model: tolak duplikat agar history
        // tidak tertimpa dan setiap record menunjuk ke file fisiknya sendiri.
        if ($this->firmwareRepo->versionExistsForModel($version, $targetModel)) {
            return response()->json([
                'message' => "Versi {$version} sudah tersimpan untuk model {$targetModel}. Gunakan nomor versi baru.",
                'errors' => ['version' => ["Versi {$version} sudah ada untuk model {$targetModel}."]],
            ], 422);
        }

        $file = $request->file('firmware_file');
        $extension = $file->getClientOriginalExtension() ?: 'bin';

        // Nama file unik per upload (timestamp + random): file lama tidak tertimpa.
        $filename = 'firmware_'.time().'_'.Str::random(6).'_'.preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $version).'.'.$extension;
        $path = $file->storeAs('firmwares', $filename);
        $fullPath = $this->resolveFirmwarePath($path) ?? Storage::disk('local')->path($path);

        // Signing graceful (blueprint susulan simplify-crypto):
        // required=false (default prototipe) → upload TETAP 201 walau key belum
        // ada (SHA dihitung, signature null, firmware default verifikasi SHA saja).
        // required=true (industrial) → gagal bila signing tidak bisa dilakukan.
        $hash = file_exists($fullPath) ? hash_file('sha256', $fullPath) : null;
        $signature = null;
        if (file_exists($fullPath)) {
            $required = (bool) config('watermonitoring.firmware_signing_required', false);
            try {
                if (! $required && ! $this->signer->hasSigningKey()) {
                    $signature = null;
                } else {
                    $signData = $this->signer->signFile($fullPath);
                    $hash = $signData['sha256'];
                    $signature = $signData['signature'];
                }
            } catch (\Throwable $e) {
                if ($required) {
                    throw $e;
                }
                $signature = null;
            }
        }

        $fw = $this->firmwareRepo->create([
            'version' => $version,
            'name' => $request->input('name'),
            'file_path' => $path,
            'file_size' => $file->getSize(),
            'checksum_sha256' => $hash,
            'signature_ed25519' => $signature,
            'target_device_model' => $targetModel,
            'changelog' => $request->input('changelog', ''),
            'is_active' => true,
        ]);

        return response()->json([
            'message' => 'Firmware berhasil diunggah dan tersimpan di server storage.',
            'data' => $fw,
        ], 201);
    }

    public function deleteFirmware(Request $request, $id)
    {
        $force = $request->boolean('force');

        $firmware = $this->firmwareRepo->find($id);
        if (! $firmware) {
            return response()->json(['message' => 'Firmware tidak ditemukan atau gagal dihapus.'], 404);
        }

        // Firmware terpasang SELALU dilindungi (bahkan paksa) — menghapusnya
        // membuat node yatim tanpa rollback. Pindahkan/rollback node dulu.
        $installedOn = $this->firmwareRepo->findInstalledNodes($firmware['version'] ?? '');
        if (! empty($installedOn)) {
            return response()->json([
                'message' => 'Firmware '.$firmware['version'].' sedang terpasang di '.implode(', ', $installedOn).' — tidak dapat dihapus.',
                'code' => 'installed',
                'installed_on' => $installedOn,
            ], 422);
        }
        $refCount = $this->otaRepo->countForFirmware($firmware['id']);
        if ($refCount > 0 && ! $force) {
            return response()->json([
                'message' => "Firmware {$firmware['version']} memiliki {$refCount} riwayat OTA — centang hapus paksa bila riwayat boleh ikut hilang.",
                'code' => 'has_history',
                'history_count' => $refCount,
            ], 422);
        }
        if ($refCount > 0) {
            $this->otaRepo->deleteForFirmware($firmware['id']);
        }

        $deleted = $this->firmwareRepo->delete($id);
        if (! $deleted) {
            return response()->json(['message' => 'Firmware tidak ditemukan atau gagal dihapus.'], 404);
        }

        return response()->json(['message' => 'Firmware berhasil dihapus dari database dan storage.']);
    }

    /**
     * Download FILE ASLI firmware versi tertentu untuk UI web (auth).
     * Mengambil file berdasarkan firmware_id/path record tersebut — bukan
     * file versi terbaru. Route ESP32 publik tidak berubah.
     * GET /api/firmwares/{id}/download
     */
    public function downloadFirmwareFile($id)
    {
        $fw = $this->firmwareRepo->find($id);
        if (! $fw) {
            return response()->json(['message' => 'Firmware tidak ditemukan.'], 404);
        }

        $path = $this->resolveFirmwarePath($fw['file_path'] ?? null);
        if (! $path) {
            return response()->json(['message' => 'File firmware v'.($fw['version'] ?? '').' tidak ditemukan di storage server (mungkin sudah dihapus).'], 404);
        }

        $ext = pathinfo((string) ($fw['file_path'] ?? ''), PATHINFO_EXTENSION) ?: 'bin';
        $filename = 'firmware_'.preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', (string) ($fw['version'] ?? 'latest')).'.'.$ext;

        return response()->download($path, $filename, [
            'Content-Type' => 'application/octet-stream',
            'X-Checksum-SHA256' => $fw['checksum_sha256'] ?? '',
        ]);
    }

    /**
     * Riwayat deployment OTA (terbaru dulu) — tidak dihapus saat firmware
     * baru diterapkan. Filter opsional: ?node_id= &firmware_id= &per_page=
     * GET /api/ota/history
     */
    public function otaHistory(Request $request)
    {
        $validated = $request->validate([
            'node_id' => ['nullable', 'string', 'max:100'],
            'firmware_id' => ['nullable'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $history = $this->otaRepo->getHistory(
            $validated['node_id'] ?? null,
            $validated['firmware_id'] ?? null,
            (int) ($validated['per_page'] ?? 20)
        );

        return response()->json(['data' => $history]);
    }

    public function updateFirmware(Request $request, $id)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'version' => ['sometimes', 'required', 'string', 'max:30'],
            'target_device_model' => ['nullable', 'string', 'max:50'],
            'changelog' => ['nullable', 'string'],
        ]);

        $updated = $this->firmwareRepo->update($id, $validated);
        if (! $updated) {
            return response()->json(['message' => 'Firmware tidak ditemukan.'], 404);
        }

        return response()->json([
            'message' => 'Informasi firmware berhasil diperbarui.',
            'data' => $updated,
        ]);
    }

    public function triggerOta(Request $request, $nodeId)
    {
        $request->validate([
            'firmware_id' => ['required'],
            'server_host' => ['nullable', 'string'],
            'force' => ['nullable', 'boolean'],
        ]);

        $firmware = $this->firmwareRepo->find($request->input('firmware_id'));
        if (! $firmware) {
            return response()->json(['message' => 'Firmware tidak ditemukan.'], 404);
        }

        $node = $this->nodeRepo->find($nodeId);
        $kodeNode = $node['kode_node'] ?? (string) $nodeId;

        // Target model: firmware Gateway tidak boleh dikirim ke Node Sensor
        // (dan sebaliknya) bila kedua sisi modelnya jelas dan berbeda.
        if ($this->isModelMismatch($firmware['target_device_model'] ?? null, $node['model_type'] ?? null)) {
            return response()->json([
                'message' => 'Firmware v'.($firmware['version'] ?? '').' untuk model '.($firmware['target_device_model'] ?? '-').' tidak cocok dengan perangkat '.$kodeNode.' (model '.($node['model_type'] ?? '-').').',
                'code' => 'model_mismatch',
            ], 422);
        }

        // Blokir jebakan label: versi sama dengan yang berjalan akan di-skip device.
        // Paksa hanya via force:true (kasus curiga flash corrupt).
        if (! $request->boolean('force') && $this->isSameVersion($firmware['version'] ?? '', $node['firmware_version'] ?? '')) {
            return response()->json([
                'message' => 'Perangkat '.$kodeNode.' sudah menjalankan versi '.$firmware['version'].' — update akan di-skip device. Paksa bila yakin.',
                'code' => 'same_version',
                'running_version' => $node['firmware_version'] ?? null,
                'firmware_version' => $firmware['version'] ?? null,
            ], 422);
        }

        // Cegah duplikat: firmware sama yang masih aktif tidak dijadwalkan ulang.
        $existing = $this->otaRepo->getPendingForFirmware((string) $nodeId, $kodeNode, $firmware['id']);
        if ($existing) {
            return response()->json([
                'message' => 'Jadwal update firmware ini sudah menunggu eksekusi — tidak dibuat duplikat.',
                'data' => $existing,
                'download_url' => url("/api/firmware/ota/download/{$firmware['id']}"),
            ]);
        }

        $ota = $this->otaRepo->create([
            'node_id' => (string) $nodeId,
            'kode_node' => $kodeNode,
            'firmware_id' => $firmware['id'],
            'status' => 'pending',
            'progress_percent' => 0,
            'scheduled_at' => now(),
        ]);

        if ($request->filled('server_host')) {
            $customHost = rtrim($request->input('server_host'), '/');
            $downloadUrl = $customHost."/api/firmware/ota/download/{$firmware['id']}";
        } else {
            $downloadUrl = url("/api/firmware/ota/download/{$firmware['id']}");
        }

        return response()->json([
            'message' => 'Perintah update firmware berhasil dijadwalkan (Pending Update).',
            'data' => $ota,
            'download_url' => $downloadUrl,
        ]);
    }

    /**
     * Trigger OTA multi-device sekaligus berdasarkan daftar perangkat yang dicentang
     */
    public function triggerOtaMulti(Request $request)
    {
        $validated = $request->validate([
            'firmware_id' => ['required'],
            'device_ids' => ['required', 'array', 'min:1'],
            'device_ids.*' => ['required'],
            'force' => ['nullable', 'boolean'],
        ]);

        $firmware = $this->firmwareRepo->find($validated['firmware_id']);
        if (! $firmware) {
            return response()->json(['message' => 'Firmware tidak ditemukan.'], 404);
        }

        $createdUpdates = [];
        $skipped = 0;
        $blocked = [];
        $mismatched = [];
        $force = (bool) ($validated['force'] ?? false);

        foreach ($validated['device_ids'] as $nodeId) {
            $node = $this->nodeRepo->find($nodeId);
            if (! $node) {
                continue;
            }
            $kodeNode = $node['kode_node'] ?? $nodeId;

            if ($this->isModelMismatch($firmware['target_device_model'] ?? null, $node['model_type'] ?? null)) {
                $mismatched[] = [
                    'id' => $node['id'],
                    'kode_node' => $kodeNode,
                    'model_type' => $node['model_type'] ?? null,
                ];

                continue;
            }

            if (! $force && $this->isSameVersion($firmware['version'] ?? '', $node['firmware_version'] ?? '')) {
                $blocked[] = [
                    'id' => $node['id'],
                    'kode_node' => $kodeNode,
                    'running_version' => $node['firmware_version'] ?? null,
                ];

                continue;
            }

            if ($this->otaRepo->getPendingForFirmware((string) $nodeId, (string) $kodeNode, $firmware['id'])) {
                $skipped++;

                continue;
            }

            $ota = $this->otaRepo->create([
                'firmware_id' => $firmware['id'],
                'node_id' => (string) $nodeId,
                'kode_node' => $kodeNode,
                'status' => 'pending',
                'progress_percent' => 0,
                'scheduled_at' => now(),
            ]);
            $createdUpdates[] = $ota;
        }

        // Semua target sudah versi ini dan tanpa force → tolak dengan jelas.
        if (empty($createdUpdates) && ! empty($blocked)) {
            return response()->json([
                'message' => 'Semua perangkat target sudah menjalankan versi '.$firmware['version'].' — tidak ada yang dijadwalkan. Paksa bila yakin.',
                'code' => 'same_version',
                'blocked' => $blocked,
                'count' => 0,
                'skipped' => $skipped,
            ], 422);
        }

        $message = count($createdUpdates).' perangkat berhasil dijadwalkan untuk update firmware v'.$firmware['version'].'.';
        if ($skipped > 0) {
            $message .= " {$skipped} perangkat dilewati (sudah menunggu eksekusi).";
        }
        if (! empty($blocked)) {
            $message .= ' '.count($blocked).' perangkat dilewati (sudah versi ini).';
        }
        if (! empty($mismatched)) {
            $message .= ' '.count($mismatched).' perangkat dilewati (model tidak cocok).';
        }

        return response()->json([
            'message' => $message,
            'data' => $createdUpdates,
            'count' => count($createdUpdates),
            'skipped' => $skipped,
            'blocked' => $blocked,
            'mismatched' => $mismatched,
        ]);
    }

    /**
     * True bila target model firmware jelas bertentangan dengan model node.
     * 'ESP32' adalah nilai default generik platform (bukan model spesifik),
     * sehingga diperlakukan sebagai wildcard — sama seperti string kosong /
     * 'all'. Hanya pasangan spesifik-vs-spesifik yang berbeda yang diblokir.
     */
    protected function isModelMismatch(?string $firmwareModel, ?string $nodeModel): bool
    {
        $fw = strtolower(trim((string) $firmwareModel));
        $nd = strtolower(trim((string) $nodeModel));
        if ($fw === '' || $fw === 'esp32' || $fw === 'all') {
            return false;
        }
        if ($nd === '' || $nd === 'esp32') {
            return false;
        }

        return $fw !== $nd;
    }

    /**
     * True bila label firmware SAMA dengan versi berjalan (normalisasi v-prefix).
     * Dipakai memblokir trigger yang pasti di-skip device.
     */
    protected function isSameVersion(?string $firmwareVersion, ?string $runningVersion): bool
    {
        $fw = OtaUpdateRepository::normalizeVersion($firmwareVersion);
        $run = OtaUpdateRepository::normalizeVersion($runningVersion);

        return $fw !== '' && $run !== '' && $fw === $run;
    }

    public function getOtaStatus($nodeId)
    {
        return $this->otaStatus($nodeId);
    }

    public function otaStatus($nodeId)
    {
        $node = $this->nodeRepo->find($nodeId);
        $kodeNode = $node['kode_node'] ?? null;
        $latest = $this->otaRepo->getLatestForNode($nodeId, $kodeNode);

        return response()->json(['data' => $latest]);
    }

    // ==========================================
    // ESP32 HARDWARE OTA ENDPOINTS (PUBLIC/TOKEN)
    // ==========================================

    public function checkOta(Request $request)
    {
        $deviceCode = $request->query('device');
        $currentVersion = $request->query('version');

        if (! $deviceCode) {
            return response()->json(['update_available' => false, 'message' => 'Parameter device diperlukan.'], 400);
        }

        $node = $this->nodeRepo->findByKodeNode($deviceCode);
        $nodeId = $node ? $node['id'] : $deviceCode;

        $pending = $this->otaRepo->getPendingForNode($nodeId, $deviceCode);
        if (! $pending) {
            return response()->json([
                'update_available' => false,
                'message' => 'Tidak ada firmware update pending untuk perangkat ini.',
            ]);
        }

        $fw = $pending['firmware'] ?? null;
        if (! $fw) {
            return response()->json(['update_available' => false]);
        }

        $downloadUrl = url("/api/firmware/ota/download/{$fw['id']}");

        // JSON_UNESCAPED_SLASHES: parser JSON naive di ESP32 tidak meng-unescape
        // `\/`, sehingga URL yang ter-escape merusak host (DNS Failed) saat download.
        return response()->json([
            'update_available' => true,
            'ota_id' => $pending['id'],
            'status' => $pending['status'] ?? 'pending',
            'version' => $fw['version'],
            'checksum' => $fw['checksum_sha256'] ?? '',
            'signature' => $fw['signature_ed25519'] ?? '',
            'signature_ed25519' => $fw['signature_ed25519'] ?? '',
            'file_size' => $fw['file_size'] ?? 0,
            'url' => $downloadUrl,
            'download_url' => $downloadUrl,
        ], 200, [], JSON_UNESCAPED_SLASHES);
    }

    public function downloadFirmware($firmwareId)
    {
        $fw = $this->firmwareRepo->find($firmwareId);
        if (! $fw) {
            abort(404, 'Firmware binary tidak ditemukan.');
        }

        $path = $this->resolveFirmwarePath($fw['file_path']);
        if (! $path) {
            abort(404, 'File firmware tidak ditemukan di storage server.');
        }

        return response()->file($path, [
            'Content-Type' => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="firmware_'.($fw['version'] ?? 'latest').'.bin"',
            'X-Checksum-SHA256' => $fw['checksum_sha256'] ?? '',
            'X-Firmware-Signature' => $fw['signature_ed25519'] ?? '',
        ]);
    }

    public function reportOtaStatus(Request $request)
    {
        // BUG-10 fix: firmware mengirim kode_node/progress_percent/error_message,
        // web lama memakai device/progress/error — terima keduanya.
        $validated = $request->validate([
            'device' => ['nullable', 'string'],
            'kode_node' => ['nullable', 'string'],
            'ota_id' => ['nullable'],
            'status' => ['required', 'in:pending,downloading,installing,success,failed'],
            'progress' => ['nullable', 'integer', 'min:0', 'max:100'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'error' => ['nullable', 'string'],
            'error_message' => ['nullable', 'string'],
            'version' => ['nullable', 'string'],
        ]);

        $device = $validated['device'] ?? $validated['kode_node'] ?? null;
        $progress = $validated['progress'] ?? $validated['progress_percent'] ?? 0;
        $error = $validated['error'] ?? $validated['error_message'] ?? null;

        $otaId = $validated['ota_id'] ?? null;
        if ($otaId) {
            // Atribusi tepat: tutup baris job yang nomornya dilaporkan device.
            $this->otaRepo->updateStatus($otaId, $validated['status'], $progress, $error);
        } elseif (! empty($device)) {
            // Fallback binary lama (tanpa ota_id): tutup job device ini yang versinya
            // cocok — antrean versi lain tidak ikut terbunuh.
            $this->otaRepo->updateStatusForDevice($device, $validated['status'], $progress, $error, $validated['version'] ?? null);
        }

        if ($validated['status'] === 'success') {
            // Update versi perangkat di database MySQL
            if (! empty($device) && ! empty($validated['version'])) {
                $node = $this->nodeRepo->findByKodeNode($device);
                if ($node) {
                    $this->nodeRepo->update($node['id'], [
                        'firmware_version' => $validated['version'],
                    ]);
                }
            }
        }

        return response()->json(['message' => 'Status OTA berhasil dicatat di database MySQL.']);
    }

    // ==========================================
    // HELPER: Generate OTA Manifest URL untuk UI
    // ==========================================

    /**
     * Kembalikan string OTA_MANIFEST_URL yang siap dicopy ke secrets.h
     * GET /api/devices/{nodeId}/ota/manifest-url
     */
    public function getManifestUrl(Request $request, $nodeId)
    {
        $node = $this->nodeRepo->find($nodeId);
        if (! $node) {
            return response()->json(['message' => 'Perangkat tidak ditemukan.'], 404);
        }

        $kodeNode = $node['kode_node'] ?? 'UNKNOWN';
        $baseUrl = rtrim(config('app.url'), '/');
        $manifestUrl = $baseUrl.'/api/firmware/ota/check?device='.$kodeNode;

        return response()->json([
            'manifest_url' => $manifestUrl,
            'kode_node' => $kodeNode,
            'base_url' => $baseUrl,
            'secrets_h_line' => '#define OTA_MANIFEST_URL "'.$manifestUrl.'"',
        ]);
    }

    /**
     * Paksa ESP32 cek OTA sekarang
     * POST /api/devices/{nodeId}/ota/force-check
     */
    public function forceOtaCheck(Request $request, $nodeId)
    {
        $node = $this->nodeRepo->find($nodeId);
        if (! $node) {
            return response()->json(['message' => 'Perangkat tidak ditemukan.'], 404);
        }

        $kodeNode = $node['kode_node'] ?? null;
        if (! $kodeNode) {
            return response()->json(['message' => 'kode_node perangkat tidak diatur.'], 422);
        }

        return response()->json([
            'message' => 'Perintah force OTA check berhasil dijadwalkan. ESP32 akan membaca antrean update.',
            'device' => $kodeNode,
        ]);
    }
}
