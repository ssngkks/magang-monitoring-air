<?php

namespace Tests\Feature;

use App\Models\Firmware;
use App\Models\Location;
use App\Models\Node;
use App\Models\OtaUpdate;
use App\Models\Sensor;
use App\Models\SensorType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private string $deviceKey = 'test-shared-key-123';

    protected function setUp(): void
    {
        parent::setUp();
        config(['watermonitoring.device_key' => $this->deviceKey]);
    }

    private function actingAsUser(?User $user = null): User
    {
        $user ??= User::factory()->create();
        $this->actingAs($user, 'sanctum');

        return $user;
    }

    public function test_hello_unknown_device_creates_pending(): void
    {
        $res = $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-01',
            'device_role' => 'node',
            'device_key' => $this->deviceKey,
            'firmware_version' => '1.0.0',
            'hardware_id' => 'AABBCCDDEEFF',
            'ip_address' => '192.168.1.50',
            'capabilities' => ['ph', 'turbidity', 'water_level', 'temperature', 'humidity', 'vibration', 'mpu6050'],
        ]);

        $res->assertStatus(202)->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('nodes', [
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'pending',
            'device_role' => 'node',
            'firmware_version' => '1.0.0',
            'hardware_id' => 'AABBCCDDEEFF',
            'ip_address' => '192.168.1.50',
        ]);
        // TIDAK PERNAH langsung active, TIDAK membuat duplikat
        $this->assertDatabaseCount('nodes', 1);
    }

    public function test_hello_wrong_key_rejected(): void
    {
        $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-01',
            'device_key' => 'salah',
        ])->assertStatus(401);
        $this->assertDatabaseCount('nodes', 0);
    }

    public function test_hello_pending_stays_pending_until_registered(): void
    {
        Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'pending',
            'api_token_hash' => hash('sha256', $this->deviceKey),
        ]);

        $res = $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-01',
            'device_key' => $this->deviceKey,
            'firmware_version' => '1.0.1',
        ]);

        $res->assertStatus(202)->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-NODE-01', 'status' => 'pending']);
    }

    public function test_hello_pre_registered_with_location_auto_activates(): void
    {
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'pending',
            'device_name' => 'Tandon Utara',
            'api_token_hash' => hash('sha256', 'random-lama'),
        ]);
        $location = Location::create(['name' => 'Sektor A']);
        $node->update(['location_id' => $location->id]);

        $res = $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-01',
            'device_key' => $this->deviceKey,
            'capabilities' => ['ph', 'turbidity'],
        ]);

        $res->assertOk()->assertJsonPath('status', 'active');
        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-NODE-01', 'status' => 'active']);
    }

    public function test_hello_inactive_rejected(): void
    {
        Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'inactive',
            'api_token_hash' => hash('sha256', $this->deviceKey),
        ]);

        $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-01',
            'device_key' => $this->deviceKey,
        ])->assertStatus(403);
    }

    public function test_heartbeat_updates_last_seen_without_changing_status(): void
    {
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'pending',
            'api_token_hash' => hash('sha256', $this->deviceKey),
            'last_seen_at' => now()->subHour(),
        ]);

        $res = $this->postJson('/api/devices/heartbeat', [
            'device_id' => 'ESP32-NODE-01',
            'device_key' => $this->deviceKey,
            'uptime' => 382920,
            'wifi_rssi' => -48,
        ]);

        $res->assertOk()->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-NODE-01', 'status' => 'pending']);
        $this->assertNotEquals(
            $node->fresh()->last_seen_at->timestamp,
            $node->last_seen_at->timestamp
        );
    }

    public function test_heartbeat_unknown_device_404_and_wrong_key_401(): void
    {
        $this->postJson('/api/devices/heartbeat', [
            'device_id' => 'TIDAK-ADA',
            'device_key' => $this->deviceKey,
        ])->assertStatus(404);

        Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'active',
            'api_token_hash' => hash('sha256', $this->deviceKey),
        ]);
        $this->postJson('/api/devices/heartbeat', [
            'device_id' => 'ESP32-NODE-01',
            'device_key' => 'salah',
        ])->assertStatus(401);
    }

    public function test_telemetry_rejects_unknown_and_missing_key(): void
    {
        Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'active',
            'api_token_hash' => hash('sha256', $this->deviceKey),
        ]);

        // kode acak → 404, tidak membuat node, tidak nyasar (§13 skenario 6)
        $this->postJson('/api/sensor/store', [
            'kode_node' => 'ACAK-999', 'api_token' => $this->deviceKey, 'ph' => 7.0,
        ])->assertStatus(404);
        $this->assertDatabaseMissing('nodes', ['kode_node' => 'ACAK-999']);
        $this->assertDatabaseCount('sensor_data', 0);

        // tanpa key / key salah → 401 (§13 skenario 7)
        $this->postJson('/api/sensor/store', ['kode_node' => 'ESP32-NODE-01', 'ph' => 7.0])->assertStatus(401);
        $this->postJson('/api/sensor/store', ['kode_node' => 'ESP32-NODE-01', 'api_token' => 'salah'])->assertStatus(401);

        // header X-Device-Key valid → 201
        $this->postJson('/api/sensor/store', ['kode_node' => 'ESP32-NODE-01', 'ph' => 7.0], [
            'X-Device-Key' => $this->deviceKey,
        ])->assertStatus(201);
    }

    public function test_register_activates_and_reconciles_sensors(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'pending',
            'device_role' => 'node',
            'api_token_hash' => hash('sha256', $this->deviceKey),
            'capabilities' => ['ph', 'turbidity', 'water_level', 'temperature', 'humidity', 'vibration', 'mpu6050'],
        ]);

        $res = $this->postJson("/api/devices/{$node->id}/register", [
            'device_name' => 'Tandon Utara',
            'sensor_mode' => 'auto',
        ]);

        $res->assertOk();
        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-NODE-01', 'status' => 'active']);
        // 7 sensor node sesuai capability (mpu6050 → mpu)
        $this->assertDatabaseCount('sensors', 7);
        $this->assertDatabaseHas('sensors', ['node_id' => $node->id, 'code' => 'mpu', 'source' => 'auto']);
    }

    public function test_register_manual_sensors_survive_reconcile(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01',
            'status' => 'pending',
            'api_token_hash' => hash('sha256', $this->deviceKey),
            'capabilities' => ['ph'],
        ]);
        $type = SensorType::firstOrCreate(['code' => 'custom_do'], ['name' => 'DO Custom']);
        Sensor::create([
            'node_id' => $node->id, 'sensor_type_id' => $type->id,
            'name' => 'DO Manual', 'code' => 'custom_do', 'source' => 'manual', 'is_active' => true,
        ]);

        $this->postJson("/api/devices/{$node->id}/register", ['sensor_mode' => 'auto'])->assertOk();

        $this->assertDatabaseHas('sensors', ['node_id' => $node->id, 'code' => 'custom_do', 'source' => 'manual', 'is_active' => true]);
        $this->assertDatabaseHas('sensors', ['node_id' => $node->id, 'code' => 'ph', 'source' => 'auto']);
    }

    public function test_ignore_sets_inactive_and_pending_visible_to_all_users(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create(['kode_node' => 'ESP32-NODE-01', 'status' => 'pending']);

        $this->postJson("/api/devices/{$node->id}/ignore")->assertOk();
        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-NODE-01', 'status' => 'inactive']);

        // user lain tetap melihat semua device (§1.3 / §13 skenario 12)
        $this->actingAsUser(User::factory()->create());
        $res = $this->getJson('/api/nodes')->assertOk();
        $this->assertTrue(collect($res->json('data'))->pluck('kode_node')->contains('ESP32-NODE-01'));

        $pending = Node::factory()->create(['kode_node' => 'ESP32-NODE-02', 'status' => 'pending']);
        $res = $this->getJson('/api/devices/pending')->assertOk();
        $this->assertTrue(collect($res->json('data'))->pluck('kode_node')->contains('ESP32-NODE-02'));
        $res = $this->getJson('/api/devices/discover')->assertOk()->assertJsonPath('detected', true);
    }

    public function test_trigger_ota_dedup_and_manifest_unescaped(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create(['kode_node' => 'ESP32-NODE-01', 'status' => 'active']);
        $fw = Firmware::create([
            'version' => 'v9.9.9', 'name' => 'Test FW', 'file_path' => 'firmwares/test.bin',
            'file_size' => 100, 'target_device_model' => 'Node Sensor', 'is_active' => true,
        ]);

        $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw->id])->assertOk();
        // Trigger kedua firmware sama tidak membuat duplikat
        $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw->id])->assertOk();
        $this->assertEquals(1, OtaUpdate::where('kode_node', 'ESP32-NODE-01')->count());

        // Manifest mengandung status + URL tanpa escape backslash (parser naive ESP32)
        $res = $this->getJson('/api/firmware/ota/check?device=ESP32-NODE-01')->assertOk();
        $res->assertJsonPath('update_available', true)->assertJsonPath('status', 'pending');
        $this->assertStringNotContainsString('\\/', $res->getContent());
    }

    public function test_report_ota_status_closes_all_device_pendings(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create(['kode_node' => 'ESP32-NODE-01', 'status' => 'active']);
        $fw = Firmware::create([
            'version' => 'v9.9.9', 'name' => 'Test FW', 'file_path' => 'firmwares/test.bin',
            'file_size' => 100, 'is_active' => true,
        ]);
        foreach (range(1, 3) as $i) {
            OtaUpdate::create([
                'node_id' => (string) $node->id, 'kode_node' => 'ESP32-NODE-01',
                'firmware_id' => $fw->id, 'status' => 'pending', 'progress_percent' => 0,
            ]);
        }

        // Laporan sukses via skema firmware menutup SEMUA pending device itu
        $this->postJson('/api/firmware/ota/status', [
            'kode_node' => 'ESP32-NODE-01', 'status' => 'success', 'progress_percent' => 100,
        ])->assertOk();
        $this->assertEquals(0, OtaUpdate::where('kode_node', 'ESP32-NODE-01')
            ->whereIn('status', ['pending', 'downloading', 'installing'])->count());
        $this->getJson('/api/firmware/ota/check?device=ESP32-NODE-01')->assertJsonPath('update_available', false);
    }

    public function test_hello_reconciles_ota_to_reported_version(): void
    {
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01', 'status' => 'active',
            'api_token_hash' => hash('sha256', $this->deviceKey),
        ]);
        $fw = Firmware::create([
            'version' => 'v9.9.9', 'name' => 'Test FW', 'file_path' => 'firmwares/test.bin',
            'file_size' => 100, 'is_active' => true,
        ]);
        OtaUpdate::create([
            'node_id' => (string) $node->id, 'kode_node' => 'ESP32-NODE-01',
            'firmware_id' => $fw->id, 'status' => 'downloading', 'progress_percent' => 30,
        ]);

        // Versi dilaporkan sudah mencapai target → job ditutup otomatis
        $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-01', 'device_key' => $this->deviceKey,
            'firmware_version' => 'v9.9.9',
        ])->assertOk();
        $this->assertEquals(0, OtaUpdate::where('kode_node', 'ESP32-NODE-01')
            ->whereIn('status', ['pending', 'downloading', 'installing'])->count());

        // Versi lebih lama dilaporkan → job tidak disentuh
        OtaUpdate::create([
            'node_id' => (string) $node->id, 'kode_node' => 'ESP32-NODE-01',
            'firmware_id' => $fw->id, 'status' => 'pending', 'progress_percent' => 0,
        ]);
        $this->postJson('/api/devices/heartbeat', [
            'device_id' => 'ESP32-NODE-01', 'device_key' => $this->deviceKey,
            'firmware_version' => 'v1.0.0',
        ])->assertOk();
        $this->assertEquals(1, OtaUpdate::where('kode_node', 'ESP32-NODE-01')
            ->whereIn('status', ['pending', 'downloading', 'installing'])->count());
    }

    public function test_trigger_same_version_blocked_unless_forced(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-NODE-01', 'status' => 'active', 'firmware_version' => 'v1.0.2',
        ]);
        $fw = Firmware::create([
            'version' => 'v1.0.2', 'name' => 'Same FW', 'file_path' => 'firmwares/same.bin',
            'file_size' => 100, 'is_active' => true,
        ]);

        $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw->id])
            ->assertStatus(422)->assertJsonPath('code', 'same_version');
        $this->assertEquals(0, OtaUpdate::count());

        $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw->id, 'force' => true])
            ->assertOk();
        $this->assertEquals(1, OtaUpdate::count());
    }

    public function test_report_ota_id_closes_exact_row_only(): void
    {
        $this->actingAsUser();
        $node = Node::factory()->create(['kode_node' => 'ESP32-NODE-01', 'status' => 'active']);
        $fwA = Firmware::create([
            'version' => 'v9.9.8', 'name' => 'FW A', 'file_path' => 'firmwares/a.bin',
            'file_size' => 100, 'is_active' => true,
        ]);
        $fwB = Firmware::create([
            'version' => 'v9.9.9', 'name' => 'FW B', 'file_path' => 'firmwares/b.bin',
            'file_size' => 100, 'is_active' => true,
        ]);
        $otaA = OtaUpdate::create([
            'node_id' => (string) $node->id, 'kode_node' => 'ESP32-NODE-01',
            'firmware_id' => $fwA->id, 'status' => 'pending', 'progress_percent' => 0,
        ]);
        $otaB = OtaUpdate::create([
            'node_id' => (string) $node->id, 'kode_node' => 'ESP32-NODE-01',
            'firmware_id' => $fwB->id, 'status' => 'pending', 'progress_percent' => 0,
        ]);

        $this->postJson('/api/firmware/ota/status', [
            'ota_id' => $otaA['id'], 'status' => 'success', 'progress' => 100,
        ])->assertOk();

        $this->assertEquals('success', OtaUpdate::find($otaA['id'])->status);
        $this->assertEquals('pending', OtaUpdate::find($otaB['id'])->status);
    }
}
