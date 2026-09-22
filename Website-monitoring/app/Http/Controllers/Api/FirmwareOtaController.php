<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\FirmwareRepository;
use App\Repositories\NodeRepository;
use App\Repositories\OtaUpdateRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class FirmwareOtaController extends Controller
{
    public function __construct(
        protected FirmwareRepository $firmwareRepo,
        protected OtaUpdateRepository $otaRepo,
        protected NodeRepository $nodeRepo,
    ) {}

    public function resolveFirmwarePath(?string $filePath): ?string
    {
        if (empty($filePath)) {
            return null;
        }
        $candidates = [
            Storage::disk('local')->path($filePath),
            storage_path('app/private/'.$filePath),
            storage_path('app/'.$filePath),
        ];
        foreach ($candidates as $p) {
            if (file_exists($p)) {
                return $p;
            }
        }

        return null;
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

        $file = $request->file('firmware_file');
        $extension = $file->getClientOriginalExtension() ?: 'bin';

        $filename = 'firmware_'.time().'_'.preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $request->input('version')).'.'.$extension;
        $path = $file->storeAs('firmwares', $filename);
        $fullPath = $this->resolveFirmwarePath($path) ?? Storage::disk('local')->path($path);
        $hash = file_exists($fullPath) ? hash_file('sha256', $fullPath) : null;

        $fw = $this->firmwareRepo->create([
            'version' => $request->input('version'),
            'name' => $request->input('name'),
            'file_path' => $path,
            'file_size' => $file->getSize(),
            'checksum_sha256' => $hash,
            'target_device_model' => $request->input('target_device_model', 'ESP32'),
            'changelog' => $request->input('changelog', ''),
            'is_active' => true,
        ]);

        return response()->json([
            'message' => 'Firmware berhasil diunggah dan tersimpan di server storage.',
            'data' => $fw,
        ], 201);
    }

    public function deleteFirmware($id)
    {
        $deleted = $this->firmwareRepo->delete($id);
        if (! $deleted) {
            return response()->json(['message' => 'Firmware tidak ditemukan atau gagal dihapus.'], 404);
        }

        return response()->json(['message' => 'Firmware berhasil dihapus dari database dan storage.']);
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
        ]);

        $firmware = $this->firmwareRepo->find($request->input('firmware_id'));
        if (! $firmware) {
            return response()->json(['message' => 'Firmware tidak ditemukan.'], 404);
        }

        $node = $this->nodeRepo->find($nodeId);
        $kodeNode = $node['kode_node'] ?? (string) $nodeId;

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
        ]);

        $firmware = $this->firmwareRepo->find($validated['firmware_id']);
        if (! $firmware) {
            return response()->json(['message' => 'Firmware tidak ditemukan.'], 404);
        }

        $createdUpdates = [];

        foreach ($validated['device_ids'] as $nodeId) {
            $node = $this->nodeRepo->find($nodeId);
            if (! $node) {
                continue;
            }
            $kodeNode = $node['kode_node'] ?? $nodeId;

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

        return response()->json([
            'message' => count($createdUpdates).' perangkat berhasil dijadwalkan untuk update firmware v'.$firmware['version'].'.',
            'data' => $createdUpdates,
            'count' => count($createdUpdates),
        ]);
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

        return response()->json([
            'update_available' => true,
            'ota_id' => $pending['id'],
            'version' => $fw['version'],
            'checksum' => $fw['checksum_sha256'] ?? '',
            'file_size' => $fw['file_size'] ?? 0,
            'url' => $downloadUrl,
            'download_url' => $downloadUrl,
        ]);
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
            $this->otaRepo->updateStatus($otaId, $validated['status'], $progress, $error);
        } elseif (! empty($device)) {
            $latestOta = $this->otaRepo->getLatestForNode(null, $device);
            if ($latestOta) {
                $this->otaRepo->updateStatus($latestOta['id'], $validated['status'], $progress, $error);
            }
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
