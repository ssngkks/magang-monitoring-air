<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SensorData extends Model
{
    use HasFactory;

    const UPDATED_AT = null;

    protected $table = 'sensor_data';

    protected $fillable = [
        'node_id',
        'ph',
        'temp',
        'humidity',
        'turbidity',
        'water_level',
        'vibration',
        'ai_status',
        'mpu_x',
        'mpu_y',
        'mpu_z',
        'roll',
        'pitch',
        'yaw',
        'stability_status',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'ph' => 'float',
            'temp' => 'float',
            'humidity' => 'float',
            'turbidity' => 'float',
            'water_level' => 'float',
            'vibration' => 'boolean',
            'mpu_x' => 'float',
            'mpu_y' => 'float',
            'mpu_z' => 'float',
            'roll' => 'float',
            'pitch' => 'float',
            'yaw' => 'float',
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function node()
    {
        return $this->belongsTo(Node::class);
    }

    public function isAnomaly(): bool
    {
        return in_array($this->ai_status, ['Bahaya', 'Anomali'], true);
    }
}
