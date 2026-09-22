<?php

namespace App\Repositories;

use Illuminate\Support\Facades\Cache;

/* =========================================================================
 * TEMPLATE KODE LAMA FIREBASE NOTIFICATION SETTINGS (JANGAN DIHAPUS - UNTUK TEMPLATE)
 * =========================================================================
 * class NotificationSettingRepositoryFirebase extends FirestoreRepository
 * {
 *     public function __construct() { parent::__construct('notification_settings'); }
 *     public function upsert(string $userId, array $data): void { ... }
 * }
 * ========================================================================= */

class NotificationSettingRepository
{
    public function getByUserId(string $userId): ?array
    {
        return Cache::get("notif_settings_{$userId}", [
            'user_id' => $userId,
            'notify_critical' => true,
            'notify_warning' => true,
            'notify_recovery' => true,
            'telegram_chat_id' => null,
        ]);
    }

    public function upsert(string $userId, array $data): void
    {
        $existing = $this->getByUserId($userId) ?? [];
        $merged = array_merge($existing, $data, ['user_id' => $userId]);
        Cache::put("notif_settings_{$userId}", $merged, now()->addDays(30));
    }

    public function getChatId(string $userId): ?string
    {
        $setting = $this->getByUserId($userId);

        return $setting['telegram_chat_id'] ?? null;
    }

    public function shouldNotify(string $userId, string $type): bool
    {
        $setting = $this->getByUserId($userId);
        if (! $setting) {
            return true;
        }

        return (bool) ($setting["notify_{$type}"] ?? true);
    }
}
