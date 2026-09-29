<?php

return [

    // Ambang RMS getaran (m/s^2) di atas mana dianggap "vibration = true".
    'vibration_rms_threshold' => env('VIBRATION_RMS_THRESHOLD', 0.30),

    // Berapa bulan data mentah sensor_data disimpan sebelum diagregasi & diarsipkan.
    'raw_retention_months' => env('SENSOR_DATA_RAW_RETENTION_MONTHS', 3),

    // Konektivitas device dari last_seen_at — SATU config untuk semua controller (§5.6).
    // ONLINE: last_seen_at <= online_threshold_seconds lalu.
    // STALE:  di antara online dan stale threshold. OFFLINE: selebihnya / null.
    'online_threshold_seconds' => env('NODE_ONLINE_THRESHOLD_SECONDS', 45),
    'stale_threshold_seconds' => env('NODE_STALE_THRESHOLD_SECONDS', 120),

    // LEGACY (menit): dipertahankan agar kode lama yang masih membaca key ini
    // tidak error, tapi JANGAN dipakai di kode baru — pakai *_seconds di atas.
    'online_threshold_minutes' => env('NODE_ONLINE_THRESHOLD_MINUTES', 10),

    // Shared device key prototipe LAN (§7). Disimpan plaintext di env server;
    // di tabel nodes hanya hash-nya (kolom api_token_hash). Dibandingkan pakai hash_equals().
    // Berfungsi sebagai initial provisioning key: saat hello pertama, backend
    // men-generate token unik per-device yang disimpan di nodes.api_token_hash.
    'device_key' => env('DEVICE_KEY', 'prototipe-shared-key-ganti-ini'),

    // Kunci autentikasi link LoRa antar ESP32 (HMAC-SHA256, blueprint §3.1).
    'lora_auth_key' => env('LORA_AUTH_KEY', 'lora-secret-key-32-bytes-auth!'),

    // Digital signature firmware (Ed25519) untuk verifikasi integritas OTA.
    // Jika null, service otomatis membaca dari storage/app/keys/firmware_ed25519.key.
    'firmware_signing_private_key' => env('FIRMWARE_SIGNING_PRIVATE_KEY', null),
    'firmware_signing_public_key' => env('FIRMWARE_SIGNING_PUBLIC_KEY', null),

    // Blueprint susulan simplify-crypto: signing WAJIB atau opsional.
    // false (default, fase prototipe): upload tetap sukses 201 walau belum ada
    // key — signature_ed25519 disimpan null, firmware default (tanpa verify)
    // memakai checksum SHA256 saja. true (industrial): upload gagal bila
    // signing tidak bisa dilakukan (firmware secure akan menolak tanpa sig).
    'firmware_signing_required' => env('FIRMWARE_SIGNING_REQUIRED', false),

    // Cooldown menit untuk notifikasi Telegram per node_id + severity (anti-spam).
    'alert_cooldown_minutes' => env('ALERT_COOLDOWN_MINUTES', 10),

];
