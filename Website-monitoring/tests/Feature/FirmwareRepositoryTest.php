<?php

namespace Tests\Feature;

use App\Models\Firmware;
use App\Models\Node;
use App\Models\OtaUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FirmwareRepositoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Fake sekali per test: fake ulang akan me-reset disk dan menghapus
        // file upload sebelumnya dalam test yang sama.
        Storage::fake();
    }

    private function actingAsUser(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        return $user;
    }

    private function uploadFirmware(string $version, string $model = 'ESP32', string $contents = 'fake-binary'): array
    {
        $res = $this->post('/api/firmwares', [
            'firmware_file' => UploadedFile::fake()->createWithContent('fw_'.$version.'.bin', $contents),
            'version' => $version,
            'name' => 'Firmware '.$version,
            'target_device_model' => $model,
            'changelog' => 'changelog '.$version,
        ]);
        $res->assertStatus(201);

        return $res->json('data');
    }

    // TEST 1 + 2: upload berurutan menyimpan file berbeda, tidak menimpa.
    public function test_upload_keeps_each_version_as_own_file(): void
    {
        $this->actingAsUser();

        $fw1 = $this->uploadFirmware('v1.0.1', 'ESP32', 'binary-v101');
        $fw2 = $this->uploadFirmware('v1.0.2', 'ESP32', 'binary-v102');

        $this->assertNotSame($fw1['file_path'], $fw2['file_path']);
        $this->assertDatabaseHas('firmwares', ['version' => 'v1.0.1']);
        $this->assertDatabaseHas('firmwares', ['version' => 'v1.0.2']);
        Storage::assertExists($fw1['file_path']);
        Storage::assertExists($fw2['file_path']);
    }

    // TEST 2 lanjutan: duplikat versi pada model sama ditolak, beda model boleh.
    public function test_upload_rejects_duplicate_version_per_model(): void
    {
        $this->actingAsUser();

        $this->uploadFirmware('v1.0.1', 'ESP32');

        $dup = $this->post('/api/firmwares', [
            'firmware_file' => UploadedFile::fake()->createWithContent('dup.bin', 'x'),
            'version' => 'v1.0.1',
            'name' => 'Duplikat',
            'target_device_model' => 'ESP32',
        ]);
        $dup->assertStatus(422);

        $otherModel = $this->post('/api/firmwares', [
            'firmware_file' => UploadedFile::fake()->createWithContent('gw.bin', 'x'),
            'version' => 'v1.0.1',
            'name' => 'Gateway',
            'target_device_model' => 'Gateway LoRa',
        ]);
        $otherModel->assertStatus(201);
    }

    // TEST 3: download mengembalikan biner ASLI versi yang diminta.
    public function test_download_returns_exact_version_binary(): void
    {
        $this->actingAsUser();

        $fw1 = $this->uploadFirmware('v1.0.1', 'ESP32', 'binary-v101-payload');
        $this->uploadFirmware('v1.0.2', 'ESP32', 'binary-v102-payload');

        $res = $this->get('/api/firmwares/'.$fw1['id'].'/download');
        $res->assertOk();
        $this->assertSame('binary-v101-payload', $res->streamedContent());
    }

    // TEST 4: history tetap muncul semua setelah upload versi baru.
    public function test_history_lists_all_uploaded_versions(): void
    {
        $this->actingAsUser();

        $this->uploadFirmware('v1.0.1');
        $this->uploadFirmware('v1.0.2');
        $this->uploadFirmware('v1.0.3');

        $res = $this->getJson('/api/firmwares');
        $res->assertOk();
        $versions = collect($res->json('data'))->pluck('version')->all();
        $this->assertContains('v1.0.1', $versions);
        $this->assertContains('v1.0.2', $versions);
        $this->assertContains('v1.0.3', $versions);
    }

    // TEST 5 + 6: status Terpasang/Tersedia/Versi Lama berasal dari backend.
    public function test_repo_status_reflects_installed_version(): void
    {
        $this->actingAsUser();

        $this->uploadFirmware('v1.0.2');
        $this->uploadFirmware('v1.0.3');
        $v104 = $this->uploadFirmware('v1.0.4');
        Node::factory()->create(['kode_node' => 'ESP32-GW-01', 'firmware_version' => 'v1.0.3', 'model_type' => 'ESP32']);

        $res = $this->getJson('/api/firmwares');
        $byVersion = collect($res->json('data'))->keyBy('version');

        $this->assertSame(['ESP32-GW-01'], $byVersion['v1.0.3']['installed_on']);
        $this->assertSame('Terpasang', $byVersion['v1.0.3']['repo_status']);
        // Repository punya v1.0.4 tetapi node masih v1.0.3 → bukan terpasang.
        $this->assertSame('Tersedia', $byVersion['v1.0.4']['repo_status']);
        $this->assertSame([], $byVersion['v1.0.4']['installed_on']);
        $this->assertSame('Versi Lama', $byVersion['v1.0.2']['repo_status']);
        $this->assertSame($v104['id'], $byVersion['v1.0.4']['id']);
    }

    // TEST 5: deploy tercatat + riwayat OTA bertahan setelah versi baru.
    public function test_deploy_and_ota_history_persist(): void
    {
        $this->actingAsUser();

        $fw103 = $this->uploadFirmware('v1.0.3');
        $this->uploadFirmware('v1.0.4');
        $node = Node::factory()->create(['kode_node' => 'ESP32-GW-01', 'firmware_version' => 'v1.0.2', 'model_type' => 'ESP32']);

        $trigger = $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw103['id']]);
        $trigger->assertOk();

        $this->postJson('/api/firmware/ota/status', [
            'kode_node' => 'ESP32-GW-01',
            'ota_id' => $trigger->json('data.id'),
            'status' => 'success',
            'progress_percent' => 100,
            'version' => 'v1.0.3',
        ])->assertOk();

        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-GW-01', 'firmware_version' => 'v1.0.3']);

        $history = $this->getJson('/api/ota/history?per_page=20');
        $history->assertOk();
        $versions = collect($history->json('data'))->pluck('firmware_version')->all();
        $this->assertContains('v1.0.3', $versions);
    }

    // TEST 7: rollback = OTA memakai biner lama, dengan riwayat tetap ada.
    public function test_rollback_to_older_version_creates_real_ota_job(): void
    {
        $this->actingAsUser();

        $fw102 = $this->uploadFirmware('v1.0.2', 'ESP32', 'binary-old');
        $fw103 = $this->uploadFirmware('v1.0.3', 'ESP32', 'binary-new');
        $node = Node::factory()->create(['kode_node' => 'ESP32-GW-01', 'firmware_version' => 'v1.0.3', 'model_type' => 'ESP32']);

        // Versi sama persis diblokir tanpa force (bukan rollback).
        $same = $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw103['id']]);
        $same->assertStatus(422);

        // Rollback ke v1.0.2 diizinkan → job pending memakai firmware_id lama.
        $rollback = $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw102['id']]);
        $rollback->assertOk();
        $this->assertSame($fw102['id'], $rollback->json('data.firmware_id'));
        $this->assertSame('pending', $rollback->json('data.status'));

        // Selesaikan rollback → node tercatat di v1.0.2, file v1.0.3 tetap ada.
        $this->postJson('/api/firmware/ota/status', [
            'kode_node' => 'ESP32-GW-01',
            'ota_id' => $rollback->json('data.id'),
            'status' => 'success',
            'progress_percent' => 100,
            'version' => 'v1.0.2',
        ])->assertOk();
        $this->assertDatabaseHas('nodes', ['kode_node' => 'ESP32-GW-01', 'firmware_version' => 'v1.0.2']);
        $this->assertDatabaseHas('firmwares', ['version' => 'v1.0.3']);
    }

    // TEST 8: dua node dapat memegang versi aktif berbeda.
    public function test_two_nodes_can_run_different_versions(): void
    {
        $this->actingAsUser();

        $this->uploadFirmware('v1.0.3');
        $this->uploadFirmware('v1.0.4');
        Node::factory()->create(['kode_node' => 'ESP32-A', 'firmware_version' => 'v1.0.3', 'model_type' => 'ESP32']);
        Node::factory()->create(['kode_node' => 'ESP32-B', 'firmware_version' => 'v1.0.4', 'model_type' => 'ESP32']);

        $res = $this->getJson('/api/firmwares');
        $byVersion = collect($res->json('data'))->keyBy('version');
        $this->assertSame(['ESP32-A'], $byVersion['v1.0.3']['installed_on']);
        $this->assertSame(['ESP32-B'], $byVersion['v1.0.4']['installed_on']);
    }

    // Guard: hapus diblokir bila terpasang / punya riwayat; lolos bila bersih.
    public function test_delete_blocked_when_installed_or_referenced(): void
    {
        $this->actingAsUser();

        $installed = $this->uploadFirmware('v1.0.6');
        Node::factory()->create(['kode_node' => 'ESP32-X', 'firmware_version' => 'v1.0.6', 'model_type' => 'ESP32']);
        $this->deleteJson('/api/firmwares/'.$installed['id'])->assertStatus(422);

        $withHistory = $this->uploadFirmware('v1.0.7');
        OtaUpdate::create([
            'node_id' => '99',
            'kode_node' => 'ESP32-Y',
            'firmware_id' => $withHistory['id'],
            'status' => 'success',
            'progress_percent' => 100,
        ]);
        $this->deleteJson('/api/firmwares/'.$withHistory['id'])->assertStatus(422);

        $clean = $this->uploadFirmware('v1.0.8');
        $this->deleteJson('/api/firmwares/'.$clean['id'])->assertOk();
        $this->assertDatabaseMissing('firmwares', ['id' => $clean['id']]);
        Storage::assertMissing($clean['file_path']);
    }

    // Target Perangkat berasal dari riwayat deployment OTA yang sudah ada.
    public function test_target_nodes_come_from_deployment_history(): void
    {
        $this->actingAsUser();

        $fw = $this->uploadFirmware('v1.0.7', 'Gateway LoRa');
        $node = Node::factory()->create(['kode_node' => 'ESP32-GW-01', 'firmware_version' => 'v1.0.6', 'model_type' => 'Gateway LoRa']);

        $this->postJson("/api/devices/{$node->id}/ota/trigger", ['firmware_id' => $fw['id']])->assertOk();

        $res = $this->getJson('/api/firmwares');
        $byVersion = collect($res->json('data'))->keyBy('version');
        $targets = $byVersion['v1.0.7']['target_nodes'];

        $this->assertCount(1, $targets);
        $this->assertSame('ESP32-GW-01', $targets[0]['kode_node']);
        $this->assertSame('v1.0.6', $targets[0]['running_version']);
        $this->assertFalse($targets[0]['installed']);

        // Firmware yang belum pernah di-deploy → target kosong (tampil "-").
        $this->uploadFirmware('v1.0.8', 'Gateway LoRa');
        $res = $this->getJson('/api/firmwares');
        $byVersion = collect($res->json('data'))->keyBy('version');
        $this->assertSame([], $byVersion['v1.0.8']['target_nodes']);
    }

    // Record lama ber-path basi tetap ter-resolve bila file ada (basename),
    // tanpa membuat file palsu dan tanpa ubah database.
    public function test_stale_path_resolves_by_basename(): void
    {
        $this->actingAsUser();

        Storage::put('firmwares/firmware_v1_0_5.bin', 'binary-v105-legacy');
        $fw = Firmware::create([
            'version' => 'v1.0.5',
            'name' => 'Legacy',
            'file_path' => 'legacy_dir/firmware_v1_0_5.bin',
            'file_size' => 18,
            'target_device_model' => 'ESP32',
            'is_active' => true,
        ]);

        $res = $this->getJson('/api/firmwares');
        $row = collect($res->json('data'))->firstWhere('version', 'v1.0.5');
        $this->assertTrue($row['binary_exists']);
        // Path record tidak diubah otomatis.
        $this->assertSame('legacy_dir/firmware_v1_0_5.bin', $fw->fresh()->file_path);

        $dl = $this->get('/api/firmwares/'.$fw->id.'/download');
        $dl->assertOk();
        $this->assertSame('binary-v105-legacy', $dl->streamedContent());
    }

    // File benar-benar tidak ada: record tetap, status tanpa "Hilang",
    // download 404 jelas (tanpa file palsu).
    public function test_missing_file_keeps_record_without_hilang_status(): void
    {
        $this->actingAsUser();

        Firmware::create([
            'version' => 'v1.0.4',
            'name' => 'Gone',
            'file_path' => 'firmwares/does-not-exist.bin',
            'file_size' => 10,
            'target_device_model' => 'ESP32',
            'is_active' => true,
        ]);
        $this->uploadFirmware('v1.0.5');

        $res = $this->getJson('/api/firmwares');
        foreach ($res->json('data') as $row) {
            $this->assertNotSame('Hilang', $row['repo_status']);
        }
        $byVersion = collect($res->json('data'))->keyBy('version');
        $this->assertSame('Versi Lama', $byVersion['v1.0.4']['repo_status']);

        $missingId = $byVersion['v1.0.4']['id'];
        $this->get('/api/firmwares/'.$missingId.'/download')->assertStatus(404);
        $this->assertDatabaseHas('firmwares', ['version' => 'v1.0.4']);
    }

    // Guard: model tidak cocok dilewati dengan alasan jelas.
    public function test_trigger_multi_skips_model_mismatch(): void
    {
        $this->actingAsUser();

        $fw = $this->uploadFirmware('v9.0.0', 'Gateway LoRa');
        $node = Node::factory()->create(['kode_node' => 'ESP32-SENSOR', 'firmware_version' => 'v1.0.0', 'model_type' => 'Node Sensor Air']);

        $res = $this->postJson('/api/devices/ota/trigger-multi', [
            'firmware_id' => $fw['id'],
            'device_ids' => [$node->id],
        ]);
        $res->assertOk();
        $this->assertSame(0, $res->json('count'));
        $this->assertCount(1, $res->json('mismatched'));
    }
}
