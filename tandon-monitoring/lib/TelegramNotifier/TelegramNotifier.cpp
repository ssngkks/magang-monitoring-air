#include "TelegramNotifier.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "secrets.h"

static String urlEncode(const String &str) {
  String encoded = "";
  char c, code0, code1;

  for (unsigned int i = 0; i < str.length(); i++) {
    c = str.charAt(i);

    if (isalnum(c)) {
      encoded += c;
    } else if (c == ' ') {
      encoded += "%20";
    } else {
      code1 = (c & 0xf) + '0';
      if ((c & 0xf) > 9) code1 = (c & 0xf) - 10 + 'A';

      c = (c >> 4) & 0xf;
      code0 = c + '0';
      if (c > 9) code0 = c - 10 + 'A';

      encoded += "%";
      encoded += code0;
      encoded += code1;
    }
  }
  return encoded;
}

void TelegramNotifier::send(const String &message) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("TELEGRAM: WIFI TIDAK TERHUBUNG");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // untuk produksi idealnya pakai root CA Telegram

  HTTPClient https;
  https.begin(client, "https://api.telegram.org/bot" + String(TELEGRAM_BOT_TOKEN) + "/sendMessage");
  https.addHeader("Content-Type", "application/x-www-form-urlencoded");

  String postData = "chat_id=" + String(TELEGRAM_CHAT_ID) + "&text=" + urlEncode(message) + "&parse_mode=Markdown";
  int httpCode = https.POST(postData);

  Serial.print("TELEGRAM : ");
  if (httpCode > 0) {
    Serial.printf("OK (HTTP %d)\n", httpCode);
  } else {
    Serial.println("GAGAL : " + https.errorToString(httpCode));
  }

  https.end();
}
