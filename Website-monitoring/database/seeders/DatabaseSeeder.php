<?php

namespace Database\Seeders;

use App\Models\Alert;
use App\Models\Node;
use App\Models\SensorData;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(SensorTypeSeeder::class);
        $admin = User::factory()->admin()->create([
            'name' => 'Admin Water Monitoring',
            'email' => 'admin@watermonitoring.test',
        ]);

        $nodes = Node::factory()
            ->count(3)
            ->for($admin)
            ->create();

        foreach ($nodes as $node) {
            SensorData::factory()->count(50)->for($node)->create();
            SensorData::factory()->anomali()->count(3)->for($node)->create();
            Alert::factory()->count(4)->for($node)->create();
        }
    }
}
