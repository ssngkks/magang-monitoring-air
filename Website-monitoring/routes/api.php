<?php

use App\Http\Controllers\Api\AIDiagnosticController;
use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DeviceLifecycleController;
use App\Http\Controllers\Api\DeviceManagementController;
use App\Http\Controllers\Api\FirmwareOtaController;
use App\Http\Controllers\Api\NodeController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SensorDataController;
use Illuminate\Support\Facades\Route;

// Public auth
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth');

// Ingest dari node/ESP32/gateway — middleware custom hash + throttle per kode_node
Route::middleware(['verify.node.token', 'throttle:ingest'])
    ->post('/sensor/store', [SensorDataController::class, 'store']);

// Lifecycle device §5 audit.md — auth via device_key di body (X-Device-Key setara),
// BUKAN Sanctum. Hello = sekali saat boot, heartbeat = tiap ±15 detik.
Route::middleware(['throttle:ingest'])->group(function () {
    Route::post('/devices/hello', [DeviceLifecycleController::class, 'hello']);
    Route::post('/devices/heartbeat', [DeviceLifecycleController::class, 'heartbeat']);
});

// Public OTA routes (Gateway ESP32 & Web Manifest check)
Route::get('/firmware/ota/check', [FirmwareOtaController::class, 'checkOta']);
Route::get('/firmware/ota/download/{id}', [FirmwareOtaController::class, 'downloadFirmware']);
Route::post('/firmware/ota/status', [FirmwareOtaController::class, 'reportOtaStatus']);

// =========================================================================
// TEMPLATE AUTH MIDDLEWARE FIREBASE (JANGAN DIHAPUS - UNTUK TEMPLATE PROJEK LAIN)
// =========================================================================
// $authMiddleware = class_exists(\App\Http\Middleware\VerifyFirebaseToken::class) ? 'verify.firebase.token' : [];

// =========================================================================
// AUTHENTIKASI DATABASE LOKAL (Sanctum & MySQL pada Laptop)
// =========================================================================
$authMiddleware = ['auth:sanctum'];

Route::group(['middleware' => $authMiddleware], function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/nodes', [NodeController::class, 'index']);
    Route::post('/nodes', [NodeController::class, 'store']);
    Route::get('/nodes/{nodeId}/sensor-data', [NodeController::class, 'sensorData']);

    Route::get('/alerts', [AlertController::class, 'index']);
    Route::patch('/alerts/read-all', [AlertController::class, 'markAllRead']);
    Route::patch('/alerts/{alertId}/read', [AlertController::class, 'markRead']);

    Route::get('/reports/summary', [ReportController::class, 'summary']);
    Route::get('/reports/data', [ReportController::class, 'data']);

    // Explainable Edge AI Diagnostics
    Route::get('/ai/diagnostics', [AIDiagnosticController::class, 'index']);

    // Master Lokasi Sektor & Penugasan ESP32
    Route::get('/locations', [DeviceManagementController::class, 'indexLocations']);
    Route::post('/locations', [DeviceManagementController::class, 'storeLocation']);
    Route::put('/locations/{id}', [DeviceManagementController::class, 'updateLocation']);
    Route::delete('/locations/{id}', [DeviceManagementController::class, 'deleteLocation']);
    Route::post('/locations/{id}/assign-devices', [DeviceManagementController::class, 'assignDevicesToLocation']);

    // Master Perangkat (ESP32)
    Route::get('/devices', [DeviceManagementController::class, 'indexDevices']);
    Route::get('/devices/discover', [DeviceManagementController::class, 'discoverDevice']);
    Route::get('/devices/pending', [DeviceLifecycleController::class, 'pending']);
    Route::post('/devices', [DeviceManagementController::class, 'storeDevice']);
    Route::post('/devices/{id}/register', [DeviceLifecycleController::class, 'register']);
    Route::post('/devices/{id}/ignore', [DeviceLifecycleController::class, 'ignore']);
    Route::put('/devices/{id}', [DeviceManagementController::class, 'updateDevice']);
    Route::delete('/devices/{id}', [DeviceManagementController::class, 'deleteDevice']);

    // Master Jenis Perangkat (Fitur Baru bebas diketik user)
    Route::get('/device-types', [DeviceManagementController::class, 'indexDeviceTypes']);
    Route::post('/device-types', [DeviceManagementController::class, 'storeDeviceType']);
    Route::put('/device-types/{id}', [DeviceManagementController::class, 'updateDeviceType']);
    Route::delete('/device-types/{id}', [DeviceManagementController::class, 'deleteDeviceType']);

    // Master Sensor & Auto-Detect
    Route::get('/devices/{nodeId}/sensors', [DeviceManagementController::class, 'indexSensors']);
    Route::post('/devices/{nodeId}/sensors', [DeviceManagementController::class, 'storeSensor']);
    Route::post('/devices/{nodeId}/auto-detect-sensors', [DeviceManagementController::class, 'autoDetectSensors']);
    Route::put('/sensors/{id}', [DeviceManagementController::class, 'updateSensor']);
    Route::delete('/sensors/{id}', [DeviceManagementController::class, 'deleteSensor']);
    Route::get('/sensor-types', [DeviceManagementController::class, 'indexSensorTypes']);

    // Firmware Repository & OTA Management
    Route::get('/firmwares', [FirmwareOtaController::class, 'indexFirmwares']);
    Route::post('/firmwares', [FirmwareOtaController::class, 'uploadFirmware']);
    Route::put('/firmwares/{id}', [FirmwareOtaController::class, 'updateFirmware']);
    Route::delete('/firmwares/{id}', [FirmwareOtaController::class, 'deleteFirmware']);

    Route::post('/devices/{nodeId}/ota/trigger', [FirmwareOtaController::class, 'triggerOta']);
    Route::post('/devices/ota/trigger-multi', [FirmwareOtaController::class, 'triggerOtaMulti']);
    Route::get('/devices/{nodeId}/ota/status', [FirmwareOtaController::class, 'getOtaStatus']);
    Route::post('/devices/{nodeId}/ota/force-check', [FirmwareOtaController::class, 'forceOtaCheck']);
    Route::get('/devices/{nodeId}/ota/manifest-url', [FirmwareOtaController::class, 'getManifestUrl']);
});
