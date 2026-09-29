<?php

namespace Tests\Feature;

use App\Models\Firmware;
use App\Models\Node;
use App\Models\User;
use App\Services\FirmwareSignerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SecurityBlueprintHardenedTest extends TestCase
{
    use RefreshDatabase;

    private string $provisioningKey = 'provision-secret-key-test';

    protected function setUp(): void
    {
        parent::setUp();
        config(['watermonitoring.device_key' => $this->provisioningKey]);
    }

    public function test_first_hello_returns_unique_token_and_subsequent_request_authenticates(): void
    {
        // 1. Initial hello dengan provisioning key
        $res = $this->postJson('/api/devices/hello', [
            'device_id' => 'ESP32-NODE-SEC1',
            'device_role' => 'node',
            'device_key' => $this->provisioningKey,
            'firmware_version' => '1.0.0',
        ]);

        $res->assertStatus(202)
            ->assertJsonPath('status', 'pending');

        $deviceToken = $res->json('device_token');
        $this->assertNotEmpty($deviceToken, 'Hello pertama wajib mengembalikan token unik per-device');
        $this->assertNotEquals($this->provisioningKey, $deviceToken);

        // 2. Database menyimpan HASH dari token unik, bukan plaintext token
        $this->assertDatabaseHas('nodes', [
            'kode_node' => 'ESP32-NODE-SEC1',
            'api_token_hash' => hash('sha256', $deviceToken),
        ]);

        // 3. Heartbeat menggunakan token unik baru tersebut berhasil
        $hbRes = $this->postJson('/api/devices/heartbeat', [
            'device_id' => 'ESP32-NODE-SEC1',
            'device_key' => $deviceToken,
        ]);
        $hbRes->assertOk();

        // 4. Heartbeat dengan provisioning key DITOLAK (karena token unik sudah established)
        $hbOldRes = $this->postJson('/api/devices/heartbeat', [
            'device_id' => 'ESP32-NODE-SEC1',
            'device_key' => $this->provisioningKey,
        ]);
        $hbOldRes->assertStatus(401);
    }

    public function test_ota_endpoints_strictly_require_device_authentication(): void
    {
        $uniqueToken = 'sec-device-token-abc123456';
        $node = Node::factory()->create([
            'kode_node' => 'ESP32-GW-SEC',
            'status' => 'active',
            'api_token_hash' => hash('sha256', $uniqueToken),
        ]);

        $fw = Firmware::create([
            'version' => 'v2.0.0',
            'name' => 'Secured Firmware',
            'file_path' => 'firmwares/fw_sec.bin',
            'file_size' => 1024,
            'checksum_sha256' => hash('sha256', 'dummy-bin'),
            'signature_ed25519' => str_repeat('a', 128),
            'is_active' => true,
        ]);

        // 1. /api/firmware/ota/check TANPA auth -> 401
        $this->getJson('/api/firmware/ota/check?device=ESP32-GW-SEC')
            ->assertStatus(401);

        // 2. /api/firmware/ota/check dengan key salah -> 401
        $this->getJson('/api/firmware/ota/check?device=ESP32-GW-SEC', [
            'X-Device-Key' => 'salah-kunci',
        ])->assertStatus(401);

        // 3. /api/firmware/ota/check dengan token per-device yang valid -> 200
        $checkRes = $this->getJson('/api/firmware/ota/check?device=ESP32-GW-SEC', [
            'X-Device-Key' => $uniqueToken,
        ]);
        $checkRes->assertOk();

        // 4. /api/firmware/ota/download/{id} TANPA auth -> 401
        $this->getJson("/api/firmware/ota/download/{$fw->id}?device=ESP32-GW-SEC")
            ->assertStatus(401);

        // 5. /api/firmware/ota/status TANPA auth -> 401
        $this->postJson('/api/firmware/ota/status', [
            'kode_node' => 'ESP32-GW-SEC',
            'status' => 'downloading',
            'progress' => 50,
        ])->assertStatus(401);

        // 6. /api/firmware/ota/status dengan token valid -> 200
        $this->postJson('/api/firmware/ota/status', [
            'kode_node' => 'ESP32-GW-SEC',
            'status' => 'downloading',
            'progress' => 50,
        ], [
            'X-Device-Key' => $uniqueToken,
        ])->assertOk();
    }

    public function test_firmware_signer_signs_and_verifies_ed25519(): void
    {
        $signer = new FirmwareSignerService;
        $keypair = $signer->getKeyPair();

        $this->assertNotEmpty($keypair['secret_key']);
        $this->assertNotEmpty($keypair['public_key']);
        $this->assertEquals(64, strlen($keypair['public_key_hex'])); // 32 bytes hex = 64 chars

        $content = 'ESP32_FIRMWARE_BINARY_MOCK_'.time();
        $hash = hash('sha256', $content);

        // Sign digest
        $signature = $signer->signDigest($hash);
        $this->assertEquals(128, strlen($signature)); // 64 bytes hex = 128 chars

        // Verify valid signature
        $this->assertTrue($signer->verifyDigest($hash, $signature));

        // Verify tampered hash fails
        $tamperedHash = hash('sha256', 'TAMPERED');
        $this->assertFalse($signer->verifyDigest($tamperedHash, $signature));
    }

    public function test_upload_firmware_automatically_attaches_ed25519_signature(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        Storage::fake('local');
        $file = UploadedFile::fake()->create('firmware_v3.bin', 2048, 'application/octet-stream');

        $res = $this->postJson('/api/firmwares', [
            'firmware_file' => $file,
            'version' => '3.0.0',
            'name' => 'Auto Signed FW',
        ]);

        $res->assertStatus(201);
        $fwData = $res->json('data');

        $this->assertNotEmpty($fwData['checksum_sha256']);
        $this->assertNotEmpty($fwData['signature_ed25519']);
        $this->assertEquals(128, strlen($fwData['signature_ed25519']));

        // Verifikasi bahwa signature cocok dengan checksum SHA-256
        $signer = new FirmwareSignerService;
        $this->assertTrue($signer->verifyDigest($fwData['checksum_sha256'], $fwData['signature_ed25519']));
    }
}
