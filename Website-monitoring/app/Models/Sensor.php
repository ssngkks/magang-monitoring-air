<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sensor extends Model
{
    use HasFactory;

    protected $fillable = [
        'node_id',
        'sensor_type_id',
        'name',
        'code',
        'pin',
        'unit',
        'min_value',
        'max_value',
        'warning_threshold_min',
        'warning_threshold_max',
        'critical_threshold_min',
        'critical_threshold_max',
        'calibration_data',
        'config',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'min_value' => 'float',
            'max_value' => 'float',
            'warning_threshold_min' => 'float',
            'warning_threshold_max' => 'float',
            'critical_threshold_min' => 'float',
            'critical_threshold_max' => 'float',
            'calibration_data' => 'array',
            'config' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function node()
    {
        return $this->belongsTo(Node::class);
    }

    public function sensorType()
    {
        return $this->belongsTo(SensorType::class);
    }
}
