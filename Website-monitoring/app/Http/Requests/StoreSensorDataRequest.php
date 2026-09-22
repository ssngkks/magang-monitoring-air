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
        // BUG-1 fix: TANPA default kode_node/api_token. Alias Indonesia tetap didukung.
        $this->merge([
            'temp' => $this->input('temp') ?? $this->input('suhu'),
            'humidity' => $this->input('humidity') ?? $this->input('kelembapan'),
            'water_level' => $this->input('water_level') ?? $this->input('ketinggian_air'),
            'vibration_rms' => $this->input('vibration_rms') ?? $this->input('getaran'),
        ]);
    }

    public function rules(): array
    {
        return [
            'kode_node' => ['required', 'string'],
            'gateway_id' => ['nullable', 'string'],

            'ph' => ['nullable', 'numeric', 'between:0,14'],
            'temp' => ['nullable', 'numeric'],
            'humidity' => ['nullable', 'numeric'],
            'turbidity' => ['nullable', 'numeric'],
            'water_level' => ['nullable', 'numeric'],
            'vibration_rms' => ['nullable', 'numeric'],
            // Nilai sesuai WaterQualityAI firmware: Normal | Anomali | Bahaya.
            'ai_status' => ['nullable', 'string', 'in:Normal,Anomali,Bahaya'],
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
