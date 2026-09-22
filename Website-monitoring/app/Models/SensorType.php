<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SensorType extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'unit',
        'default_min',
        'default_max',
        'icon',
        'chart_type',
        'config_schema',
    ];

    protected function casts(): array
    {
        return [
            'default_min' => 'float',
            'default_max' => 'float',
            'config_schema' => 'array',
        ];
    }

    public function sensors()
    {
        return $this->hasMany(Sensor::class);
    }
}
