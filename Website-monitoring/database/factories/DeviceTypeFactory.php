<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class DeviceTypeFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => 'devtype_'.fake()->unique()->slug(2),
            'name' => fake()->words(2, true),
            'category' => 'sensor',
            'description' => fake()->sentence(),
            'default_role' => 'node',
        ];
    }
}
