<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class NodeFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'kode_node' => 'LORA-NODE-'.strtoupper(Str::random(4)),
            'nama_lokasi' => fake()->randomElement([
                'Titik Pantau Hulu Sungai', 'Titik Pantau Intake PDAM',
                'Titik Pantau Kolam Retensi', 'Titik Pantau Muara',
            ]),
            'api_token_hash' => hash('sha256', Str::random(40)),
            'status' => 'active',
            'last_seen_at' => now(),
        ];
    }
}
