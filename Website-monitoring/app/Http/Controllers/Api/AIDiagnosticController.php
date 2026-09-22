<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\NodeRepository;
use App\Services\AIDiagnosticService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AIDiagnosticController extends Controller
{
    public function __construct(
        protected AIDiagnosticService $aiService,
        protected NodeRepository $nodeRepo,
    ) {}

    /**
     * Mengambil hasil analisis Explainable AI (XAI) untuk node monitoring air.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $nodeId = $request->query('node_id');

        if (! $nodeId) {
            $nodes = $userId ? $this->nodeRepo->getByUserId($userId) : $this->nodeRepo->getAll();
            if (! empty($nodes)) {
                $nodeId = $nodes[0]['id'];
            } else {
                $nodeId = 'ESP32-WATER-01';
            }
        }

        $diagnostics = $this->aiService->getDiagnosticsForNode((string) $nodeId);

        return response()->json([
            'data' => $diagnostics,
        ]);
    }
}
