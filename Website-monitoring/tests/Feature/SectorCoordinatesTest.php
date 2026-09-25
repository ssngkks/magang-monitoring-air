<?php

namespace Tests\Feature;

use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SectorCoordinatesTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsUser(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        return $user;
    }

    public function test_store_location_persists_coordinates(): void
    {
        $this->actingAsUser();

        $res = $this->postJson('/api/locations', [
            'name' => 'Sektor 1',
            'code' => 'SEK-01',
            'latitude' => -7.79558,
            'longitude' => 110.36949,
            'radius_m' => 170,
        ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('locations', [
            'code' => 'SEK-01',
            'latitude' => -7.79558,
            'longitude' => 110.36949,
            'radius_m' => 170,
        ]);

        // GET harus mengembalikan koordinat agar marker tampil.
        $list = $this->getJson('/api/locations')->assertOk();
        $row = collect($list->json('data'))->firstWhere('code', 'SEK-01');
        $this->assertNotNull($row);
        $this->assertEquals(-7.79558, $row['latitude']);
        $this->assertEquals(110.36949, $row['longitude']);
        $this->assertEquals(170, $row['radius_m']);
    }

    public function test_update_location_persists_coordinates(): void
    {
        $this->actingAsUser();
        $loc = Location::create([
            'name' => 'Sektor 1',
            'code' => 'SEK-01',
            'latitude' => null,
            'longitude' => null,
            'radius_m' => 200,
        ]);

        $res = $this->putJson("/api/locations/{$loc->id}", [
            'latitude' => -7.79558,
            'longitude' => 110.36949,
            'radius_m' => 170,
        ]);

        $res->assertOk();
        $this->assertDatabaseHas('locations', [
            'id' => $loc->id,
            'latitude' => -7.79558,
            'longitude' => 110.36949,
            'radius_m' => 170,
        ]);
        // History tidak relevan di sini; yang penting nilai lama tertimpa sesuai input.
        $this->assertEquals(-7.79558, $res->json('data.latitude'));
        $this->assertEquals(110.36949, $res->json('data.longitude'));
    }

    public function test_store_location_rejects_out_of_range_coordinates(): void
    {
        $this->actingAsUser();

        $this->postJson('/api/locations', [
            'name' => 'Sektor X',
            'latitude' => -95.0,
            'longitude' => 200.0,
        ])->assertStatus(422);

        $this->assertDatabaseCount('locations', 0);
    }

    public function test_update_location_missing_returns_404(): void
    {
        $this->actingAsUser();

        $this->putJson('/api/locations/999999', [
            'latitude' => -7.79558,
        ])->assertStatus(404);
    }
}
