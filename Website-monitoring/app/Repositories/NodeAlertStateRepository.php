<?php

namespace App\Repositories;

use DateTime;
use DateTimeInterface;
use Illuminate\Support\Facades\Cache;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE NODE ALERT STATE (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class NodeAlertStateRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('node_alert_state'); }
 *     public function updateState(string $nodeId, string $severity, ?string $parameter = null): void { ... }
 *     public function updateLastNotified(string $nodeId): void { ... }
 * }
 * ========================================================================= */

class NodeAlertStateRepository
{
    public function getState(string $nodeId): array
    {
        $cached = Cache::get("node_alert_state_{$nodeId}");
        if ($cached) {
            return $cached;
        }

        return [
            'id' => $nodeId,
            'node_id' => (string) $nodeId,
            'current_severity' => 'normal',
            'last_transition_at' => null,
            'last_notified_at' => null,
        ];
    }

    public function updateState(string $nodeId, string $severity, ?string $parameter = null): void
    {
        $state = $this->getState($nodeId);
        $state['current_severity'] = $severity;
        $state['last_transition_at'] = now()->toIso8601String();
        $state['updated_at'] = now()->toIso8601String();
        if ($parameter) {
            $state['last_parameter'] = $parameter;
        }

        Cache::put("node_alert_state_{$nodeId}", $state, now()->addDays(7));
    }

    public function updateLastNotified(string $nodeId): void
    {
        $state = $this->getState($nodeId);
        $state['last_notified_at'] = now()->toIso8601String();
        Cache::put("node_alert_state_{$nodeId}", $state, now()->addDays(7));
    }

    public function isInCooldown(string $nodeId, int $cooldownMinutes): bool
    {
        $state = $this->getState($nodeId);
        if (empty($state['last_notified_at'])) {
            return false;
        }

        $lastNotified = $state['last_notified_at'];
        if (is_string($lastNotified)) {
            try {
                $lastNotified = new DateTime($lastNotified);
            } catch (\Throwable $e) {
                return false;
            }
        }

        if (! $lastNotified instanceof DateTimeInterface) {
            return false;
        }

        $diff = (new DateTime)->diff($lastNotified);

        return ($diff->i + $diff->h * 60 + $diff->d * 1440) < $cooldownMinutes;
    }
}
