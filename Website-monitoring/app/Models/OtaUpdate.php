<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OtaUpdate extends Model
{
    use HasFactory;

    protected $table = 'ota_updates';

    protected $fillable = [
        'node_id',
        'kode_node',
        'firmware_id',
        'status',
        'progress_percent',
        'error_message',
        'scheduled_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'progress_percent' => 'integer',
            'scheduled_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function node()
    {
        return $this->belongsTo(Node::class);
    }

    public function firmware()
    {
        return $this->belongsTo(Firmware::class);
    }
}
