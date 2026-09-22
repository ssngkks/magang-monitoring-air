<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSensorDataRequest;
use App\Services\SensorIngestService;

class SensorDataController extends Controller
{
    public function store(StoreSensorDataRequest $request, SensorIngestService $service)
    {
        /** @var array $node */
        $node = $request->attributes->get('node');

        try {
            [$sensorData] = $service->ingest($node, array_merge($request->all(), $request->validated()));
        } catch (\InvalidArgumentException $e) {
            // §9: kode_node tak dikenal / bukan active → tolak, jangan simpan ke node lain.
            return response()->json(['message' => $e->getMessage()], 404);
        }

        return response()->json([
            'message' => 'Data sensor berhasil disimpan.',
            'data' => $sensorData,
        ], 201);
    }
}
