<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Kreait\Firebase\Factory;

class FirebaseStorageService
{
    protected ?Factory $factory = null;

    protected $storage = null;

    protected $bucket = null;

    protected bool $isAvailable = false;

    protected ?string $bucketName = null;

    public function __construct()
    {
        $credPath = config('firebase.credentials');
        if ($credPath && file_exists(base_path($credPath))) {
            try {
                $this->factory = (new Factory)
                    ->withServiceAccount(base_path($credPath));

                $this->storage = $this->factory->createStorage();

                $configuredBucket = config('firebase.storage_bucket');
                if ($configuredBucket) {
                    try {
                        $this->bucket = $this->storage->getBucket($configuredBucket);
                        if ($this->bucket->exists()) {
                            $this->isAvailable = true;
                            $this->bucketName = $configuredBucket;
                        }
                    } catch (\Throwable $e) {
                    }
                }

                if (! $this->isAvailable) {
                    // Coba ambil default bucket
                    try {
                        $this->bucket = $this->storage->getBucket();
                        // Cek apakah bucket benar-benar bisa diakses
                        if ($this->bucket->exists()) {
                            $this->isAvailable = true;
                            $this->bucketName = $this->bucket->name();
                        }
                    } catch (\Throwable $e) {
                        // Coba nama bucket alternatif jika default appspot.com gagal
                        $altBucketName = config('firebase.project_id').'.firebasestorage.app';
                        try {
                            $altBucket = $this->storage->getBucket($altBucketName);
                            if ($altBucket->exists()) {
                                $this->bucket = $altBucket;
                                $this->isAvailable = true;
                                $this->bucketName = $altBucketName;
                            }
                        } catch (\Throwable $e2) {
                            $this->isAvailable = false;
                        }
                    }
                }

            } catch (\Throwable $e) {
                Log::warning('FirebaseStorageService initialization warning: '.$e->getMessage());
                $this->isAvailable = false;
            }
        }
    }

    /**
     * Apakah Firebase Storage aktif dan memiliki bucket yang valid
     */
    public function isAvailable(): bool
    {
        return $this->isAvailable;
    }

    public function getBucketName(): ?string
    {
        return $this->bucketName;
    }

    /**
     * Unggah file firmware lokal ke Firebase Storage
     * Mengembalikan array ['path' => ..., 'url' => ...] jika sukses, atau null jika gagal
     */
    public function uploadFirmware(string $localFullPath, string $version, string $filename): ?array
    {
        if (! $this->isAvailable || ! $this->bucket || ! file_exists($localFullPath)) {
            return null;
        }

        try {
            $cleanVersion = preg_replace('/[^a-zA-Z0-9._-]/', '_', $version);
            $cleanFilename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
            $remotePath = "firmwares/{$cleanVersion}_{$cleanFilename}";

            $token = bin2hex(random_bytes(16));

            $fileHandle = fopen($localFullPath, 'r');
            $object = $this->bucket->upload($fileHandle, [
                'name' => $remotePath,
                'metadata' => [
                    'contentType' => 'application/octet-stream',
                    'metadata' => [
                        'firebaseStorageDownloadTokens' => $token,
                        'version' => $version,
                        'uploaded_at' => now()->toIso8601String(),
                    ],
                ],
            ]);

            if (is_resource($fileHandle)) {
                fclose($fileHandle);
            }

            // Bangun URL download publik Firebase Storage Google CDN
            $encodedPath = urlencode($remotePath);
            $publicUrl = "https://firebasestorage.googleapis.com/v0/b/{$this->bucketName}/o/{$encodedPath}?alt=media&token={$token}";

            Log::info("Firmware {$version} berhasil diunggah ke Firebase Storage: {$remotePath}");

            return [
                'path' => $remotePath,
                'url' => $publicUrl,
            ];
        } catch (\Throwable $e) {
            Log::error('Gagal upload firmware ke Firebase Storage: '.$e->getMessage());

            return null;
        }
    }

    /**
     * Hapus file firmware dari Firebase Storage (setelah update sukses / dibatalkan)
     */
    public function deleteFirmware(?string $remotePath): bool
    {
        if (! $this->isAvailable || ! $this->bucket || empty($remotePath)) {
            return false;
        }

        try {
            $object = $this->bucket->object($remotePath);
            if ($object->exists()) {
                $object->delete();
                Log::info("File firmware {$remotePath} di Firebase Storage berhasil dihapus otomatis.");

                return true;
            }
        } catch (\Throwable $e) {
            Log::warning("Gagal menghapus file {$remotePath} dari Firebase Storage: ".$e->getMessage());
        }

        return false;
    }
}
