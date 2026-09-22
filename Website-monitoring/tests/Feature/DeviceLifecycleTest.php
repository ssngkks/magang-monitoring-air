<?php

namespace Tests\Feature;

use App\Models\Location;
use App\Models\Node;
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
}
