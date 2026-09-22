<?php

namespace Database\Seeders;

use App\Models\SensorType;
use Illuminate\Database\Seeder;

class SensorTypeSeeder extends Seeder
{
    public function run(): void
    {
        $types = [
            [
                'code' => 'ph',
                'name' => 'pH Sensor (PH-4502C)',
                'unit' => 'pH',
                'default_min' => 0.0,
                'default_max' => 14.0,
                'icon' => 'Droplet',
                'chart_type' => 'gauge',
                'config_schema' => [
                    'ideal_min' => 6.5,
                    'ideal_max' => 8.5,
                    'calibration' => ['neutral_voltage' => 1.65, 'acid_voltage' => 2.24],
                ],
            ],
            [
                'code' => 'turbidity',
                'name' => 'Sensor Kekeruhan Air',
                'unit' => 'NTU',
                'default_min' => 0.0,
                'default_max' => 100.0,
                'icon' => 'Activity',
                'chart_type' => 'gauge',
                'config_schema' => [
                    'threshold_max' => 50.0,
                    'calibration' => ['clear_voltage' => 2.5, 'muddy_voltage' => 1.0],
                ],
            ],
            [
                'code' => 'water_level',
                'name' => 'Ultrasonic Level Air Tandon',
                'unit' => 'cm',
                'default_min' => 0.0,
                'default_max' => 200.0,
                'icon' => 'Droplet',
                'chart_type' => 'area',
                'config_schema' => [
                    'tank_height_cm' => 100.0,
                    'warning_min' => 20.0,
                    'warning_max' => 85.0,
                ],
            ],
            [
                'code' => 'temperature',
                'name' => 'Suhu Air / Sekitar (DHT22)',
                'unit' => '°C',
                'default_min' => 0.0,
                'default_max' => 60.0,
                'icon' => 'Thermometer',
                'chart_type' => 'line',
                'config_schema' => ['max_alert' => 40.0],
            ],
            [
                'code' => 'humidity',
                'name' => 'Kelembapan Udara (DHT22)',
                'unit' => '%',
                'default_min' => 0.0,
                'default_max' => 100.0,
                'icon' => 'CloudRain',
                'chart_type' => 'line',
                'config_schema' => ['optimal_min' => 40.0, 'optimal_max' => 80.0],
            ],
            [
                'code' => 'vibration',
                'name' => 'Sensor Getaran Pompa (SW-420)',
                'unit' => 'pulsa',
                'default_min' => 0.0,
                'default_max' => 100.0,
                'icon' => 'Activity',
                'chart_type' => 'bar',
                'config_schema' => ['alert_threshold' => 20],
            ],
            [
                'code' => 'mpu',
                'name' => 'MPU6050 Gyroscope & Kestabilan',
                'unit' => '°',
                'default_min' => -180.0,
                'default_max' => 180.0,
                'icon' => 'Activity',
                'chart_type' => 'gyro',
                'config_schema' => [
                    'axes' => ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
                    'stability_threshold' => 0.35,
                ],
            ],
        ];

        foreach ($types as $item) {
            SensorType::updateOrCreate(['code' => $item['code']], $item);
        }
    }
}
