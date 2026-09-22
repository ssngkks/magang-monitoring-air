<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreNodeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'kode_node' => ['required', 'string', 'max:50', 'unique:nodes,kode_node'],
            'nama_lokasi' => ['required', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'kode_node.unique' => 'Perangkat dengan kode node ini sudah terdaftar di sistem. Silakan gunakan kode yang berbeda.',
            'kode_node.required' => 'Kode node wajib diisi.',
            'nama_lokasi.required' => 'Nama lokasi wajib diisi.',
        ];
    }
}
