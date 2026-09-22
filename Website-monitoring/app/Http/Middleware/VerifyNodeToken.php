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
     * Auth device prototipe LAN (audit.md §7):
     * - Header utama: X-Device-Key (shared DEVICE_KEY, §7).
     *   X-API-KEY / body api_token / device_key diterima untuk kompatibilitas
     *   token per-device lama & test suite.
     * - TANPA default-token, TANPA auto-create (BUG-1 fix).
     * - Key salah / hilang → 401. Device tak dikenal → 404 (lakukan hello dulu).
     * - Status bukan active → 403 (pending = menunggu registrasi dashboard).
     */
    public function handle(Request $request, Closure $next): Response
    {
        $kodeNode = $request->input('kode_node') ?? $request->input('device_id');
        $deviceKey = $request->header('X-Device-Key')
            ?? $request->header('X-API-KEY')
            ?? $request->input('device_key')
            ?? $request->input('api_token');

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
        if ($storedHash === null || ! hash_equals($storedHash, hash('sha256', $deviceKey))) {
            return response()->json(['message' => 'Device key tidak valid.'], 401);
        }

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
