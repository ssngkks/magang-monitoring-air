<?php

namespace App\Http\Middleware;

use App\Repositories\NodeRepository;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyNodeToken
{
    public function __construct(protected NodeRepository $nodeRepo) {}

    /**
     * Auth device prototipe LAN (audit.md §7 + blueprint §3.3/§3.5):
     * - Header utama: X-Device-Key (token unik per-device, §3.3).
     *   X-API-KEY / body api_token / device_key diterima untuk kompatibilitas
     *   token per-device lama & test suite.
     * - TANPA default-token, TANPA auto-create (BUG-1 fix).
     * - Key salah / hilang → 401. Device tak dikenal → 404 (lakukan hello dulu).
     * - Status bukan active → 403 (pending = menunggu registrasi dashboard).
     * - Delegasi gateway (blueprint §3.3 sinkron firmware): gateway yang aktif
     *   boleh meneruskan data/OTA atas nama node memakai TOKEN GATEWAY sendiri
     *   (field gateway_id terisi). Bacaan tetap diatribusikan ke kode_node target.
     *   Tanpa ini, gateway yang forward data node akan selalu 401 setelah token
     *   diunikkan per-device.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Izinkan request jika user sudah terautentikasi melalui Sanctum (misal UI web dashboard)
        if ($request->user()) {
            return $next($request);
        }

        $kodeNode = $request->input('kode_node')
            ?? $request->input('device_id')
            ?? $request->input('device')
            ?? $request->query('device')
            ?? $request->query('kode_node')
            ?? $request->header('X-Device-Id');

        $deviceKey = $request->header('X-Device-Key')
            ?? $request->header('X-API-KEY')
            ?? $request->input('device_key')
            ?? $request->input('api_token')
            ?? $request->query('api_token')
            ?? $request->query('device_key');

        if (empty($kodeNode) || ! is_string($kodeNode)) {
            return response()->json(['message' => 'kode_node wajib diisi.'], 401);
        }

        if (empty($deviceKey) || ! is_string($deviceKey)) {
            return response()->json(['message' => 'Device key wajib diisi (header X-Device-Key).'], 401);
        }

        $node = $this->nodeRepo->findByKodeNode($kodeNode);

        if (! $node) {
            return response()->json([
                'message' => 'Device belum terdaftar. Lakukan POST /api/devices/hello terlebih dahulu.',
            ], 404);
        }

        // Hash diambil terpisah karena di-hidden dari toArray() (anti-bocor ke response).
        $storedHash = $this->nodeRepo->getTokenHashByKodeNode($kodeNode);
        if ($storedHash !== null && hash_equals($storedHash, hash('sha256', $deviceKey))) {
            return $this->authorizeByStatus($request, $next, $node);
        }

        // Delegasi gateway: coba autentikasi sebagai gateway penerus.
        // Syarat: field gateway_id ada & berbeda dari kode_node, token cocok
        // dengan hash milik gateway, dan gateway berstatus active.
        $gatewayId = $request->input('gateway_id')
            ?? $request->input('gatewayId')
            ?? $request->header('X-Gateway-Id');
        if (is_string($gatewayId) && $gatewayId !== '' && $gatewayId !== $kodeNode) {
            $gwHash = $this->nodeRepo->getTokenHashByKodeNode($gatewayId);
            if ($gwHash !== null && hash_equals($gwHash, hash('sha256', $deviceKey))) {
                $gateway = $this->nodeRepo->findByKodeNode($gatewayId);
                if ($gateway && ($gateway['status'] ?? '') === 'active') {
                    return $this->authorizeByStatus($request, $next, $node);
                }
            }
        }

        return response()->json(['message' => 'Device key tidak valid.'], 401);
    }

    /**
     * Penjaga status registrasi target (dipakai jalur langsung & delegasi gateway).
     */
    protected function authorizeByStatus(Request $request, Closure $next, array $node): Response
    {
        $status = $node['status'] ?? '';
        if ($status === 'pending') {
            return response()->json([
                'message' => 'Device menunggu registrasi di dashboard.',
                'status' => 'pending',
            ], 403);
        }

        if ($status !== 'active') {
            return response()->json(['message' => 'Device dinonaktifkan.'], 403);
        }

        $request->attributes->set('node', $node);

        return $next($request);
    }
}
