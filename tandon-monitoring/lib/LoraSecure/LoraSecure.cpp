#include "LoraSecure.h"
#include <Preferences.h>
#ifdef FEATURE_LORA_AUTH
#include "mbedtls/md.h"
#include "mbedtls/sha256.h"
#endif

namespace LoraSecure {

  String effectiveKey(const String &deviceToken) {
#ifdef FEATURE_LORA_AUTH
    String tok = deviceToken;
    tok.trim();
    // Token unik per-device (§3.3) panjang 48 hex → turunkan kunci LoRa 32 char
    // via SHA256(token). Tiap unit otomatis beda tanpa provisioning manual.
    if (tok.length() >= 16) {
      uint8_t hash[32];
      // mbedtls SHA256 satu tembakan (tanpa alokasi String berlebih).
      mbedtls_sha256((const unsigned char*)tok.c_str(), tok.length(), hash, 0);
      char hex[65];
      for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", hash[i]);
      hex[64] = '\0';
      return String(hex);
    }
#endif
    // Fallback masa transisi / mode default (FEATURE_LORA_AUTH mati):
    // kunci provisioning compile-time.
    (void)deviceToken;
    return String(LORA_AUTH_KEY);
  }

  String hmacTrunc8(const String &payload, uint32_t nonce, const String &key) {
#ifdef FEATURE_LORA_AUTH
    // Pesan = payload + "|" + nonce desimal (format stabil, hemat RAM).
    String msg = payload + "|" + String(nonce);
    uint8_t out[32];
    const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!info) return "";
    int rc = mbedtls_md_hmac(info,
                             (const unsigned char*)key.c_str(), key.length(),
                             (const unsigned char*)msg.c_str(), msg.length(),
                             out);
    if (rc != 0) return "";
    // Potong 8 byte pertama → 16 hex char (hemat airtime vs 64 char penuh).
    char hex[17];
    for (int i = 0; i < 8; i++) sprintf(hex + i * 2, "%02x", out[i]);
    hex[16] = '\0';
    return String(hex);
#else
    // Mode default: kode HMAC tidak ikut ter-compile (hemat flash).
    (void)payload; (void)nonce; (void)key;
    return "";
#endif
  }

  String appendAuth(const String &csvPayload, uint32_t nonce, const String &key) {
#ifdef FEATURE_LORA_AUTH
    String h = hmacTrunc8(csvPayload, nonce, key);
    String out = csvPayload;
    out += ",NONCE:" + String(nonce);
    out += ",HMAC:" + h;
    out += ",VER:1";
    return out;
#else
    // Mode default: kirim plain seperti sebelum hardening (tanpa field auth).
    (void)nonce; (void)key;
    return csvPayload;
#endif
  }

  static String extractFieldVal(const String &csv, const char *field) {
    String k = String(field) + ":";
    int s = csv.indexOf(k);
    if (s == -1) return "";
    s += k.length();
    int e = csv.indexOf(',', s);
    if (e == -1) e = csv.length();
    String v = csv.substring(s, e);
    v.trim();
    return v;
  }

  static String stripAuthFields(const String &csv) {
    // Hapus ,NONCE:.., ,HMAC:.., ,VER:.. (urutan apa pun) tanpa merusak field sensor.
    String out = csv;
    const char *fields[] = {"NONCE:", "HMAC:", "VER:"};
    for (int f = 0; f < 3; f++) {
      String k = String(",") + fields[f];
      int s = out.indexOf(k);
      while (s != -1) {
        int e = out.indexOf(',', s + 1);
        if (e == -1) { out = out.substring(0, s); break; }
        out = out.substring(0, s) + out.substring(e);
        s = out.indexOf(k);
      }
    }
    return out;
  }

  VerifyResult verifyAndStrip(String &csvInOut, uint32_t &nonceOut,
                              uint32_t lastNonce, const String &key) {
    String hmacVal = extractFieldVal(csvInOut, "HMAC");
    String nonceStr = extractFieldVal(csvInOut, "NONCE");
    if (hmacVal.length() == 0 && nonceStr.length() == 0) {
      // Paket lama tanpa auth (VER:0 / pra-§3.1) — terima sebagai legacy.
      return AUTH_OK_LEGACY;
    }
#ifdef FEATURE_LORA_AUTH
    if (hmacVal.length() != 16 || nonceStr.length() == 0) {
      return AUTH_FAIL_FORMAT;
    }
    uint32_t nonce = (uint32_t)strtoul(nonceStr.c_str(), nullptr, 10);
    String base = stripAuthFields(csvInOut);
    String expect = hmacTrunc8(base, nonce, key);
    expect.toLowerCase();
    String got = hmacVal;
    got.toLowerCase();
    if (expect.length() != 16 || got != expect) {
      return AUTH_FAIL_HMAC;
    }
    if (nonce <= lastNonce && lastNonce != 0) {
      // Paket lama direkam ulang (replay) — tolak meski HMAC valid.
      nonceOut = nonce;
      return AUTH_FAIL_REPLAY;
    }
    csvInOut = base;
    nonceOut = nonce;
    return AUTH_OK_SECURED;
#else
    // Mode default (FEATURE_LORA_AUTH mati): kode verifikasi HMAC tidak ikut
    // ter-compile. Paket ber-field auth diperlakukan sebagai legacy yang
    // di-strip agar parser lama tetap jalan (kompatibel dua arah plain).
    (void)lastNonce; (void)key;
    csvInOut = stripAuthFields(csvInOut);
    nonceOut = 0;
    return AUTH_OK_LEGACY;
#endif
  }

  String fuotaAnnounceHmac(uint32_t fwSize, uint16_t chunks, uint32_t nonce,
                           const String &target, const String &version,
                           const String &key) {
#ifdef FEATURE_LORA_AUTH
    // Bangun pesan biner stabil: sizeLE4 + chunksLE2 + nonceLE4 + target + '|' + version.
    uint8_t msg[10 + 64];
    msg[0] = fwSize & 0xFF; msg[1] = (fwSize >> 8) & 0xFF;
    msg[2] = (fwSize >> 16) & 0xFF; msg[3] = (fwSize >> 24) & 0xFF;
    msg[4] = chunks & 0xFF; msg[5] = (chunks >> 8) & 0xFF;
    msg[6] = nonce & 0xFF; msg[7] = (nonce >> 8) & 0xFF;
    msg[8] = (nonce >> 16) & 0xFF; msg[9] = (nonce >> 24) & 0xFF;
    String tail = target + "|" + version;
    size_t tailLen = tail.length() > 64 ? 64 : tail.length();
    // HMAC atas (header10 || tail) agar target/version ikut diautentikasi.
    uint8_t out[32];
    const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!info) return "";
    // mbedtls_md_hmac hanya sekali panggil: gabung ke buffer sementara.
    uint8_t buf[10 + 64];
    memcpy(buf, msg, 10);
    memcpy(buf + 10, tail.c_str(), tailLen);
    int rc = mbedtls_md_hmac(info,
                             (const unsigned char*)key.c_str(), key.length(),
                             buf, 10 + tailLen, out);
    if (rc != 0) return "";
    char hex[17];
    for (int i = 0; i < 8; i++) sprintf(hex + i * 2, "%02x", out[i]);
    hex[16] = '\0';
    return String(hex);
#else
    (void)fwSize; (void)chunks; (void)nonce; (void)target; (void)version; (void)key;
    return "";
#endif
  }

  static Preferences sPrefs;
  static bool sBegun = false;
  static void ensurePrefs() {
    if (!sBegun) { sPrefs.begin("lora", false); sBegun = true; }
  }

  uint32_t nextNonce() {
    ensurePrefs();
    uint32_t cur = sPrefs.getUInt("nonce", 0);
    if (cur == 0) {
      // Boot pertama / NVS kosong: mulai acak tinggi agar tak bentrok replay lama.
      cur = ((uint32_t)esp_random() | 0x10000000UL);
      if (cur == 0) cur = 0x10000000UL;
    } else {
      cur++;
      if (cur == 0) cur = 1; // hindari 0 (disamakan "belum pernah" di verify)
    }
    sPrefs.putUInt("nonce", cur);
    return cur;
  }

  uint32_t lastStoredNonce() {
    ensurePrefs();
    return sPrefs.getUInt("nonce", 0);
  }

} // namespace LoraSecure
