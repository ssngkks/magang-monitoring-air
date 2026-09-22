<?php

namespace App\Http\Middleware;

use App\Models\Node;
use App\Repositories\NodeRepository;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyNodeToken
{
    public function __construct(protected NodeRepository $nodeRepo) {}

    public function handle(Request $request, Closure $next): Response
    {
        $kodeNode = $request->input('kode_node') ?? 'ESP32-WATER-01';
        $token = $request->input('api_token') ?? $request->header('X-API-KEY') ?? 'default-token';

        $node = $this->nodeRepo->findByKodeNode($kodeNode);

        // Auto-register node jika belum ada di database lokal MySQL
        if (! $node) {
            $createdId = $this->nodeRepo->createNode([
                'kode_node' => $kodeNode,
                'device_name' => 'ESP32 Water Monitoring',
                'nama_lokasi' => 'Titik Pantau Sensor Utama',
                'model_type' => 'ESP32',
                'api_token_hash' => hash('sha256', $token),
                'status' => 'active',
            ]);
            $node = $this->nodeRepo->find($createdId);
        }

        if (($node['status'] ?? '') !== 'active') {
            return response()->json([
                'message' => 'Node tidak aktif.',
            ], 401);
        }

        // Cek hash token jika bukan default local token
        if ($token !== 'default-token' && ! empty($node['api_token_hash'])) {
            $incomingHash = hash('sha256', $token);
            if (! hash_equals($node['api_token_hash'], $incomingHash) && ! hash_equals($node['api_token_hash'], hash('sha256', 'default-token'))) {
                return response()->json([
                    'message' => 'Token node tidak valid.',
                ], 401);
            }
        }

        $request->attributes->set('node', $node);

        return $next($request);
    }
}
