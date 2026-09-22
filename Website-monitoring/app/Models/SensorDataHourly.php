<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SensorDataHourly extends Model
{
    use HasFactory;

    protected $table = 'sensor_data_hourly';

    protected $fillable = [
        'node_id',
        'avg_ph',
        'avg_temp',
        'avg_turbidity',
        'hour',
    ];

    protected function casts(): array
    {
        return [
            'avg_ph' => 'float',
            'avg_temp' => 'float',
            'avg_turbidity' => 'float',
            'hour' => 'datetime',
        ];
    }

    public function node()
    {
        return $this->belongsTo(Node::class);
    }
}
