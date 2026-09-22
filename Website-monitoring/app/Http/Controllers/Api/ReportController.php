<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\LocationRepository;
use App\Repositories\NodeRepository;
use App\Repositories\SensorDataRepository;
use Google\Cloud\Core\Timestamp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ReportController extends Controller
{
    public function __construct(
        protected SensorDataRepository $sensorRepo,
        protected NodeRepository $nodeRepo,
        protected LocationRepository $locationRepo,
    ) {}

    public function summary(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $nodeId = $request->input('node_id');
        $from = $request->input('from');
        $to = $request->input('to');

        $nodes = $this->nodeRepo->getByUserId($userId);

        if (empty($nodes)) {
            return response()->json([
                'data' => [
                    'total_records' => 0,
                    'earliest_record' => null,
                    'latest_record' => null,
                    'sampling_interval_seconds' => 0,
                    'parameters' => ['ph', 'temp', 'humidity', 'turbidity', 'water_level', 'vibration', 'mpu'],
                    'averages' => null,
                ],
            ]);
        }

        $targetNodeId = $nodeId ?: $nodes[0]['id'];
        $readings = $this->sensorRepo->getByNodeId($targetNodeId, 1000, $from, $to);

        if (empty($readings)) {
            return response()->json([
                'data' => [
                    'total_records' => 0,
                    'earliest_record' => null,
                    'latest_record' => null,
                    'sampling_interval_seconds' => 0,
                    'parameters' => ['ph', 'temp', 'humidity', 'turbidity', 'water_level', 'vibration', 'mpu'],
                    'averages' => null,
                ],
            ]);
        }

        $count = count($readings);
        $latest = $readings[0];
        $earliest = end($readings);

        $latestTime = $this->formatTimestamp($latest['created_at'] ?? $latest['received_at'] ?? null);
        $earliestTime = $this->formatTimestamp($earliest['created_at'] ?? $earliest['received_at'] ?? null);

        $intervalSeconds = 0;
        if ($count > 1 && $latestTime && $earliestTime) {
            $diff = abs(strtotime($latestTime) - strtotime($earliestTime));
            $intervalSeconds = round($diff / ($count - 1));
        }

        $sumPh = 0;
        $cntPh = 0;
        $sumTemp = 0;
        $cntTemp = 0;
        $sumHumidity = 0;
        $cntHumidity = 0;
        $sumTurbidity = 0;
        $cntTurbidity = 0;
        $sumWaterLevel = 0;
        $cntWaterLevel = 0;

        foreach ($readings as $r) {
            if (isset($r['ph']) && is_numeric($r['ph'])) {
                $sumPh += (float) $r['ph'];
                $cntPh++;
            }
            if (isset($r['temp']) && is_numeric($r['temp'])) {
                $sumTemp += (float) $r['temp'];
                $cntTemp++;
            }
            if (isset($r['humidity']) && is_numeric($r['humidity'])) {
                $sumHumidity += (float) $r['humidity'];
                $cntHumidity++;
            }
            if (isset($r['turbidity']) && is_numeric($r['turbidity'])) {
                $sumTurbidity += (float) $r['turbidity'];
                $cntTurbidity++;
            }
            if (isset($r['water_level']) && is_numeric($r['water_level'])) {
                $sumWaterLevel += (float) $r['water_level'];
                $cntWaterLevel++;
            }
        }

        return response()->json([
            'data' => [
                'total_records' => $count,
                'earliest_record' => $earliestTime,
                'latest_record' => $latestTime,
                'sampling_interval_seconds' => $intervalSeconds,
                'parameters' => ['ph', 'temp', 'humidity', 'turbidity', 'water_level', 'vibration', 'mpu'],
                'averages' => [
                    'ph' => $cntPh > 0 ? round($sumPh / $cntPh, 2) : 0,
                    'temp' => $cntTemp > 0 ? round($sumTemp / $cntTemp, 2) : 0,
                    'humidity' => $cntHumidity > 0 ? round($sumHumidity / $cntHumidity, 2) : 0,
                    'turbidity' => $cntTurbidity > 0 ? round($sumTurbidity / $cntTurbidity, 2) : 0,
                    'water_level' => $cntWaterLevel > 0 ? round($sumWaterLevel / $cntWaterLevel, 2) : 0,
                ],
            ],
        ]);
    }

    public function data(Request $request)
    {
        $userId = (string) (Auth::id() ?? $request->attributes->get('firebase_uid'));
        $nodeId = $request->input('node_id');
        $locationId = $request->input('location_id');
        $parameter = $request->input('parameter', 'all');
        $perPage = $request->integer('per_page', 50);
        $from = $request->input('from');
        $to = $request->input('to');

        $nodes = $this->nodeRepo->getByUserId($userId);

        if (empty($nodes)) {
            return response()->json(['data' => [], 'meta' => ['total' => 0, 'has_more' => false]]);
        }

        $targetNode = null;
        if ($nodeId) {
            foreach ($nodes as $n) {
                if ((string) $n['id'] === (string) $nodeId || ($n['kode_node'] ?? '') === (string) $nodeId) {
                    $targetNode = $n;
                    break;
                }
            }
        }
        if (! $targetNode) {
            $targetNode = $nodes[0];
        }

        $targetNodeId = $targetNode['id'];
        $paginated = $this->sensorRepo->getPaginated($targetNodeId, $perPage, null, $from, $to);

        $nodeCode = $targetNode['kode_node'] ?? 'ESP32-WATER-01';
        $locationName = $targetNode['nama_lokasi'] ?? 'Titik Pantau Sensor Utama';

        $rows = array_map(function (array $r) use ($nodeCode, $locationName) {
            $ts = $this->formatTimestamp($r['created_at'] ?? $r['received_at'] ?? null);
            $dt = $ts ? new \DateTime($ts) : new \DateTime;

            return [
                'id' => $r['id'] ?? null,
                'device_code' => $nodeCode,
                'location_name' => $locationName,
                'date' => $dt->format('Y-m-d'),
                'time' => $dt->format('H:i:s'),
                'timestamp' => $dt->format(\DateTime::ATOM),
                'ph' => (float) ($r['ph'] ?? 0),
                'temperature' => (float) ($r['temp'] ?? 0),
                'humidity' => (float) ($r['humidity'] ?? 0),
                'turbidity' => (float) ($r['turbidity'] ?? 0),
                'water_level' => (float) ($r['water_level'] ?? 0),
                'vibration' => (bool) ($r['vibration'] ?? false),
                'ai_status' => $r['ai_status'] ?? 'Normal',
                'mpu_x' => isset($r['mpu_x']) ? (float) $r['mpu_x'] : null,
                'mpu_y' => isset($r['mpu_y']) ? (float) $r['mpu_y'] : null,
                'mpu_z' => isset($r['mpu_z']) ? (float) $r['mpu_z'] : null,
                'roll' => isset($r['roll']) ? (float) $r['roll'] : null,
                'pitch' => isset($r['pitch']) ? (float) $r['pitch'] : null,
                'yaw' => isset($r['yaw']) ? (float) $r['yaw'] : null,
                'stability_status' => $r['stability_status'] ?? 'Stabil',
            ];
        }, $paginated['data']);

        return response()->json([
            'data' => $rows,
            'meta' => [
                'total' => $paginated['total'] ?? count($rows),
                'has_more' => $paginated['has_more'],
                'device_code' => $nodeCode,
                'location_name' => $locationName,
            ],
        ]);
    }

    private function formatTimestamp($timestamp): ?string
    {
        if (! $timestamp) {
            return null;
        }

        if ($timestamp instanceof Timestamp) {
            return $timestamp->get()->format(\DateTime::ATOM);
        }

        if ($timestamp instanceof \DateTimeInterface) {
            return $timestamp->format(\DateTime::ATOM);
        }

        if (is_numeric($timestamp)) {
            $sec = strlen((string) (int) $timestamp) > 10 ? (int) ($timestamp / 1000) : (int) $timestamp;

            return (new \DateTime("@$sec"))->format(\DateTime::ATOM);
        }

        if (is_string($timestamp)) {
            return (new \DateTime($timestamp))->format(\DateTime::ATOM);
        }

        return null;
    }
}
