<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Node extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'location_id',
        'device_type_id',
        'kode_node',
        'device_name',
        'nama_lokasi',
        'model_type',
        'device_role',
        'api_token_hash',
        'status',
        'firmware_version',
        'capabilities',
        'ip_address',
        'hardware_id',
        'last_seen_at',
    ];

    protected $hidden = [
        'api_token_hash',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'capabilities' => 'array',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function deviceType()
    {
        return $this->belongsTo(DeviceType::class);
    }

    public function sensors()
    {
        return $this->hasMany(Sensor::class);
    }

    public function otaUpdates()
    {
        return $this->hasMany(OtaUpdate::class);
    }

    public function sensorData()
    {
        return $this->hasMany(SensorData::class);
    }

    public function alerts()
    {
        return $this->hasMany(Alert::class);
    }

    public function hourlyAggregates()
    {
        return $this->hasMany(SensorDataHourly::class);
    }

    /**
     * Konektivitas berbasis detik (audit.md §5.6). Satu-satunya sumber threshold
     * adalah config/watermonitoring.php (online_threshold_seconds).
     */
    public function isOnline(?int $withinSeconds = null): bool
    {
        $withinSeconds ??= (int) config('watermonitoring.online_threshold_seconds', 45);

        return $this->last_seen_at !== null
            && $this->last_seen_at->gt(now()->subSeconds($withinSeconds));
    }
}
