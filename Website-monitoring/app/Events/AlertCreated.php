<?php

namespace App\Events;

use App\Models\Alert;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class AlertCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Alert $alert) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('node.'.$this->alert->node_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'alert.created';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->alert->id,
            'node_id' => $this->alert->node_id,
            'pesan' => $this->alert->pesan,
            'severity' => $this->alert->severity,
            'is_read' => $this->alert->is_read,
            'created_at' => $this->alert->created_at?->toIso8601String(),
        ];
    }
}
