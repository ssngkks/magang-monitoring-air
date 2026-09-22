<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSensorDataRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'kode_node' => $this->input('kode_node') ?? 'ESP32-WATER-01',
            'api_token' => $this->input('api_token') ?? $this->header('X-API-KEY') ?? 'default-token',
            'temp' => $this->input('temp') ?? $this->input('suhu'),
            'humidity' => $this->input('humidity') ?? $this->input('kelembapan'),
            'water_level' => $this->input('water_level') ?? $this->input('ketinggian_air'),
            'vibration_rms' => $this->input('vibration_rms') ?? $this->input('getaran'),
        ]);
    }

    public function rules(): array
    {
        return [
            'api_token' => ['nullable', 'string'],
            'kode_node' => ['nullable', 'string'],
            'gateway_id' => ['nullable', 'string'],

            'ph' => ['nullable', 'numeric', 'between:0,14'],
            'temp' => ['nullable', 'numeric'],
            'humidity' => ['nullable', 'numeric'],
            'turbidity' => ['nullable', 'numeric'],
            'water_level' => ['nullable', 'numeric'],
            'vibration_rms' => ['nullable', 'numeric'],
            'ai_status' => ['nullable', 'string'],
            'ai_confidence' => ['nullable', 'numeric'],
            'ai_diagnosis' => ['nullable', 'string'],
            'rssi' => ['nullable', 'numeric'],
            'snr' => ['nullable', 'numeric'],
            'getaran' => ['nullable', 'numeric'],
            'suhu' => ['nullable', 'numeric'],
            'kelembapan' => ['nullable', 'numeric'],
            'ketinggian_air' => ['nullable', 'numeric'],
            'mpu_x' => ['nullable', 'numeric'],
            'mpu_y' => ['nullable', 'numeric'],
            'mpu_z' => ['nullable', 'numeric'],
            'roll' => ['nullable', 'numeric'],
            'pitch' => ['nullable', 'numeric'],
            'yaw' => ['nullable', 'numeric'],
            'stability_status' => ['nullable', 'string'],
        ];
    }
}
