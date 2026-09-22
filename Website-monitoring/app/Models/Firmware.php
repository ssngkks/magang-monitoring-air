<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Firmware extends Model
{
    use HasFactory;

    protected $table = 'firmwares';

    protected $fillable = [
        'version',
        'name',
        'file_path',
        'file_size',
        'checksum_sha256',
        'target_device_model',
        'firebase_storage_path',
        'firebase_storage_url',
        'changelog',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function otaUpdates()
    {
        return $this->hasMany(OtaUpdate::class);
    }
}
