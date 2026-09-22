<?php

namespace Database\Seeders;

use App\Models\DeviceType;
use Illuminate\Database\Seeder;

class DeviceTypeSeeder extends Seeder
{
    public function run(): void
    {
        $types = [
            [
                'code' => 'node_sensor',
                'name' => 'Node Sensor',
                'category' => 'sensor',
                'description' => 'ESP32 Node pembaca sensor fisik (pH, turbiditas, level air, DHT22, getaran, MPU6050), kirim via LoRa.',
                'default_role' => 'node',
            ],
            [
                'code' => 'gateway_lora',
                'name' => 'Gateway LoRa',
                'category' => 'gateway',
                'description' => 'ESP32 Gateway penerima LoRa + Edge AI TinyML, penerus HTTP ke Laravel.',
                'default_role' => 'gateway',
            ],
        ];

        foreach ($types as $item) {
            DeviceType::updateOrCreate(['code' => $item['code']], $item);
        }
    }
}
