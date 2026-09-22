<?php

namespace Database\Factories;

use App\Models\Node;
use Illuminate\Database\Eloquent\Factories\Factory;

class AlertFactory extends Factory
{
    public function definition(): array
    {
        $severity = fake()->randomElement(['warning', 'critical']);

        return [
            'node_id' => Node::factory(),
            'pesan' => $severity === 'critical'
                ? 'Kekeruhan air melewati ambang kritis.'
                : 'pH air mendekati ambang batas normal.',
            'severity' => $severity,
            'is_read' => fake()->boolean(30),
        ];
    }
}
