<?php

namespace App\Events;

use App\Models\SensorData;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SensorDataReceived implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public SensorData $sensorData) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('node.'.$this->sensorData->node_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'sensor.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->sensorData->id,
            'node_id' => $this->sensorData->node_id,
            'ph' => $this->sensorData->ph,
            'temp' => $this->sensorData->temp,
            'humidity' => $this->sensorData->humidity,
            'turbidity' => $this->sensorData->turbidity,
            'water_level' => $this->sensorData->water_level,
            'vibration' => $this->sensorData->vibration,
            'ai_status' => $this->sensorData->ai_status,
            'created_at' => $this->sensorData->created_at?->toIso8601String(),
        ];
    }
}
