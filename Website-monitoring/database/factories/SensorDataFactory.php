<?php

namespace Database\Factories;

use App\Models\Node;
use Illuminate\Database\Eloquent\Factories\Factory;

class SensorDataFactory extends Factory
{
    public function definition(): array
    {
        return [
            'node_id' => Node::factory(),
            'ph' => fake()->randomFloat(2, 6.5, 8.5),
            'temp' => fake()->randomFloat(2, 24, 29),
            'humidity' => fake()->numberBetween(55, 85),
            'turbidity' => fake()->randomFloat(2, 0.2, 1.4),
            'water_level' => fake()->numberBetween(80, 130),
            'vibration' => fake()->boolean(5),
            'ai_status' => 'Normal',
            'created_at' => fake()->dateTimeBetween('-24 hours', 'now'),
        ];
    }

    public function anomali(): static
    {
        return $this->state(fn () => [
            'ph' => fake()->randomFloat(2, 4, 5.5),
            'turbidity' => fake()->randomFloat(2, 4.5, 9),
            'ai_status' => fake()->randomElement(['Bahaya', 'Anomali']),
        ]);
    }
}
