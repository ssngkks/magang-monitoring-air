<?php

return [

    // Ambang RMS getaran (m/s^2) di atas mana dianggap "vibration = true".
    'vibration_rms_threshold' => env('VIBRATION_RMS_THRESHOLD', 0.30),

    // Berapa bulan data mentah sensor_data disimpan sebelum diagregasi & diarsipkan.
    'raw_retention_months' => env('SENSOR_DATA_RAW_RETENTION_MONTHS', 3),

    // Node dianggap "online" jika last_seen_at dalam N menit terakhir.
    'online_threshold_minutes' => env('NODE_ONLINE_THRESHOLD_MINUTES', 10),

    // Cooldown menit untuk notifikasi Telegram per node_id + severity (anti-spam).
    'alert_cooldown_minutes' => env('ALERT_COOLDOWN_MINUTES', 10),

];
