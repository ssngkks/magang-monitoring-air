<?php

namespace App\Console\Commands;

use App\Repositories\NodeRepository;
use App\Repositories\SensorDataRepository;
use App\Repositories\SensorHourlyAggRepository;
use Illuminate\Console\Command;

class AggregateSensorDataHourly extends Command
{
    protected $signature = 'sensor-data:aggregate-hourly';

    protected $description = 'Agregasi rata-rata sensor_readings per jam ke koleksi Firestore sensor_hourly_agg.';

    public function handle(
        NodeRepository $nodeRepo,
        SensorDataRepository $sensorRepo,
        SensorHourlyAggRepository $hourlyRepo
    ): int {
        $jamMulai = now()->subHour()->startOfHour();
        $jamSelesai = now()->subHour()->endOfHour();
        $hourIso = $jamMulai->format('Y-m-d\TH:00:00\Z');

        $nodes = $nodeRepo->getActiveNodes();
        $jumlahDiagregasi = 0;

        foreach ($nodes as $node) {
            $nodeId = $node['id'];
            $readings = $sensorRepo->getByNodeId(
                $nodeId,
                500,
                $jamMulai->toIso8601String(),
                $jamSelesai->toIso8601String()
            );

            if (empty($readings)) {
                continue;
            }

            $count = count($readings);
            $sumPh = 0;
            $sumTemp = 0;
            $sumTurbidity = 0;
            $sumHumidity = 0;
            $sumWaterLevel = 0;

            foreach ($readings as $r) {
                $sumPh += (float) ($r['ph'] ?? 0);
                $sumTemp += (float) ($r['temp'] ?? 0);
                $sumTurbidity += (float) ($r['turbidity'] ?? 0);
                $sumHumidity += (float) ($r['humidity'] ?? 0);
                $sumWaterLevel += (float) ($r['water_level'] ?? 0);
            }

            $averages = [
                'ph' => round($sumPh / $count, 2),
                'temp' => round($sumTemp / $count, 2),
                'turbidity' => round($sumTurbidity / $count, 2),
                'humidity' => round($sumHumidity / $count, 2),
                'water_level' => round($sumWaterLevel / $count, 2),
            ];

            $hourlyRepo->upsertHourly($nodeId, $hourIso, $averages, $count, $node['user_id'] ?? null);
            $jumlahDiagregasi++;
        }

        $this->info("Agregasi selesai untuk jam {$jamMulai->format('Y-m-d H:00')}. Node terproses: {$jumlahDiagregasi}.");

        return self::SUCCESS;
    }
}
