#include "FirmwareVerify.h"
#include "firmware_signing_key.h"
#include <Ed25519.h>
#include "mbedtls/sha256.h"

namespace FirmwareVerify {

  static int hexNibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  }

  size_t hexToBytes(const String &hex, uint8_t *out, size_t outLen) {
    if (hex.length() != (int)(outLen * 2)) return 0;
    for (size_t i = 0; i < outLen; i++) {
      int hi = hexNibble(hex.charAt(i * 2));
      int lo = hexNibble(hex.charAt(i * 2 + 1));
      if (hi < 0 || lo < 0) return 0;
      out[i] = (uint8_t)((hi << 4) | lo);
    }
    return outLen;
  }

  bool verifyDigest(const uint8_t *digest32, const uint8_t *sig64, const uint8_t *pub32) {
    if (!digest32 || !sig64 || !pub32) return false;
    // Ed25519::verify menuntut buffer internal; salin agar API const-safe.
    uint8_t sig[64], pub[32];
    memcpy(sig, sig64, 64);
    memcpy(pub, pub32, 32);
    // Pesan yang ditandatangani backend = digest SHA-256 mentah 32 byte.
    return Ed25519::verify(sig, pub, digest32, 32);
  }

  bool verifyDigestHex(const String &shaHex, const String &sigHex, const String &pubHex) {
    String s = shaHex; s.trim(); s.toLowerCase();
    String g = sigHex; g.trim(); g.toLowerCase();
    if (s.length() != 64 || g.length() != 128) return false;
    uint8_t digest[32], sig[64], pub[32];
    if (hexToBytes(s, digest, 32) != 32) return false;
    if (hexToBytes(g, sig, 64) != 64) return false;
    if (pubHex.length() > 0) {
      String p = pubHex; p.trim(); p.toLowerCase();
      if (p.length() != 64) return false;
      if (hexToBytes(p, pub, 32) != 32) return false;
    } else {
      memcpy(pub, FIRMWARE_PUBLIC_KEY, 32);
    }
    return verifyDigest(digest, sig, pub);
  }

  String sha256HexOfStream(Stream &s, size_t len) {
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);
    uint8_t buf[256];
    size_t remaining = len;
    while (remaining > 0) {
      size_t want = remaining > sizeof(buf) ? sizeof(buf) : remaining;
      size_t got = s.readBytes((char*)buf, want);
      if (got == 0) break;
      mbedtls_sha256_update(&ctx, buf, got);
      remaining -= got;
      if (got < want) break;
    }
    uint8_t out[32];
    mbedtls_sha256_finish(&ctx, out);
    mbedtls_sha256_free(&ctx);
    if (remaining != 0) return "";
    char hex[65];
    for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", out[i]);
    hex[64] = '\0';
    return String(hex);
  }

} // namespace FirmwareVerify
