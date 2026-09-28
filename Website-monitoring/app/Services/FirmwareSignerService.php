<?php

namespace App\Services;

use Illuminate\Support\Facades\File;

class FirmwareSignerService
{
    protected string $keyDir;

    protected string $privateKeyPath;

    protected string $publicKeyPath;

    public function __construct(?string $keyDir = null)
    {
        $this->keyDir = $keyDir ?? storage_path('app/keys');
        $this->privateKeyPath = $this->keyDir.'/firmware_ed25519.key';
        $this->publicKeyPath = $this->keyDir.'/firmware_ed25519.pub';
    }

    /**
     * Cek ketersediaan signing key TANPA membuat keypair baru.
     * Dipakai jalur graceful saat firmware_signing_required=false: upload
     * boleh lanjut dengan signature null bila belum ada key (fase prototipe).
     */
    public function hasSigningKey(): bool
    {
        $envSecret = config('watermonitoring.firmware_signing_private_key');
        if (! empty($envSecret) && is_string($envSecret)) {
            return true;
        }

        return File::exists($this->privateKeyPath) && File::exists($this->publicKeyPath);
    }

    /**
     * Ambil atau buat keypair Ed25519 untuk signing firmware OTA.
     * Private key disimpan di storage/app/keys (bukan di repo Git).
     *
     * @return array{secret_key: string, public_key: string, public_key_hex: string}
     */
    public function getKeyPair(): array
    {
        // 1. Cek dari environment config terlebih dahulu bila ada
        $envSecret = config('watermonitoring.firmware_signing_private_key');
        if (! empty($envSecret) && is_string($envSecret)) {
            $secretKey = ctype_xdigit($envSecret) ? hex2bin($envSecret) : $envSecret;
            $publicKey = sodium_crypto_sign_publickey_from_secretkey($secretKey);

            return [
                'secret_key' => $secretKey,
                'public_key' => $publicKey,
                'public_key_hex' => bin2hex($publicKey),
            ];
        }

        // 2. Baca dari file storage
        if (File::exists($this->privateKeyPath) && File::exists($this->publicKeyPath)) {
            $secretHex = trim(File::get($this->privateKeyPath));
            $publicHex = trim(File::get($this->publicKeyPath));

            return [
                'secret_key' => hex2bin($secretHex),
                'public_key' => hex2bin($publicHex),
                'public_key_hex' => $publicHex,
            ];
        }

        // 3. Generate keypair baru jika belum ada
        if (! File::isDirectory($this->keyDir)) {
            File::makeDirectory($this->keyDir, 0700, true);
        }

        $keypair = sodium_crypto_sign_keypair();
        $secretKey = sodium_crypto_sign_secretkey($keypair);
        $publicKey = sodium_crypto_sign_publickey($keypair);

        $secretHex = bin2hex($secretKey);
        $publicHex = bin2hex($publicKey);

        File::put($this->privateKeyPath, $secretHex);
        File::put($this->publicKeyPath, $publicHex);

        @chmod($this->privateKeyPath, 0600);
        @chmod($this->publicKeyPath, 0644);

        return [
            'secret_key' => $secretKey,
            'public_key' => $publicKey,
            'public_key_hex' => $publicHex,
        ];
    }

    /**
     * Kembalikan public key dalam format hex (64 karakter hex = 32 bytes).
     * Siap di-embed sebagai konstanta di firmware_signing_key.h ESP32.
     */
    public function getPublicKeyHex(): string
    {
        return $this->getKeyPair()['public_key_hex'];
    }

    /**
     * Tanda-tangani digest SHA-256 (32 bytes raw) dengan Ed25519.
     * Mengembalikan 128 karakter hex (64 bytes Ed25519 signature).
     */
    public function signDigest(string $sha256Hex): string
    {
        $rawDigest = hex2bin($sha256Hex);
        $secretKey = $this->getKeyPair()['secret_key'];

        $signature = sodium_crypto_sign_detached($rawDigest, $secretKey);

        return bin2hex($signature);
    }

    /**
     * Tanda-tangani file binary firmware.
     *
     * @return array{sha256: string, signature: string, public_key: string}
     */
    public function signFile(string $filePath): array
    {
        if (! File::exists($filePath)) {
            throw new \InvalidArgumentException("File firmware tidak ditemukan: {$filePath}");
        }

        $sha256 = hash_file('sha256', $filePath);
        $signature = $this->signDigest($sha256);
        $publicKey = $this->getPublicKeyHex();

        return [
            'sha256' => $sha256,
            'signature' => $signature,
            'public_key' => $publicKey,
        ];
    }

    /**
     * Verifikasi signature Ed25519 terhadap digest SHA-256.
     */
    public function verifyDigest(string $sha256Hex, string $signatureHex, ?string $publicKeyHex = null): bool
    {
        if (strlen($signatureHex) !== 128 || strlen($sha256Hex) !== 64) {
            return false;
        }

        $publicKeyHex = $publicKeyHex ?: $this->getPublicKeyHex();
        if (strlen($publicKeyHex) !== 64) {
            return false;
        }

        $rawDigest = hex2bin($sha256Hex);
        $rawSig = hex2bin($signatureHex);
        $rawPub = hex2bin($publicKeyHex);

        return sodium_crypto_sign_verify_detached($rawSig, $rawDigest, $rawPub);
    }

    /**
     * Verifikasi signature Ed25519 terhadap file binary.
     */
    public function verifyFile(string $filePath, string $signatureHex, ?string $publicKeyHex = null): bool
    {
        if (! File::exists($filePath)) {
            return false;
        }

        $sha256 = hash_file('sha256', $filePath);

        return $this->verifyDigest($sha256, $signatureHex, $publicKeyHex);
    }
}
