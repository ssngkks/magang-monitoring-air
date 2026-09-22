#include "LoraProtocol.h"

#ifdef DEVICE_ROLE_NODE
#include "secrets.h"
String LoraProtocol::encode(const SensorManager &sensors) {
  float waterLevel         = sensors.get("AIR").values[0];
  int   turbidity          = (int)sensors.get("TURBID").values[0];
  float ph                 = sensors.get("PH").values[0];
  float temp               = sensors.get("DHT").values[0];
  float hum                = sensors.get("DHT").values[1];
  unsigned long vibration  = (unsigned long)sensors.get("GETARAN").values[0];

  String payload = "NODE:" + String(KODE_NODE) +
                   ",GETARAN:" + String(vibration) +
                   ",AIR:" + String(waterLevel, 1) +
                   ",TURBID:" + String(turbidity) +
                   ",PH:" + String(ph, 2) +
                   ",SUHU:" + String(temp, 1) +
                   ",HUM:" + String(hum, 1);

  if (sensors.isOnline("MPU")) {
    SensorReading mpu = sensors.get("MPU");
    payload += ",ACC:" + String(mpu.values[0], 2) + "/" + String(mpu.values[1], 2) + "/" + String(mpu.values[2], 2);
    payload += ",GYRO:" + String(mpu.values[3], 1) + "/" + String(mpu.values[4], 1) + "/" + String(mpu.values[5], 1);
  }

  return payload;
}
#endif

String LoraProtocol::extractField(const String &data, const String &key) {
  int startIndex = data.indexOf(key);
  if (startIndex == -1) return "";
  startIndex += key.length();

  int endIndex = data.indexOf(",", startIndex);
  if (endIndex == -1) endIndex = data.length();

  return data.substring(startIndex, endIndex);
}

String LoraProtocol::extractFieldWithFallback(const String &data, const String &primaryKey, const String &fallbackKey) {
  String val = extractField(data, primaryKey);
  if (val.length() == 0 && fallbackKey.length() > 0) {
    val = extractField(data, fallbackKey);
  }
  return val;
}

#ifdef DEVICE_ROLE_GATEWAY
#include "secrets.h"
String LoraProtocol::buildFirebaseJson(float waterLevel, int turbidity, float ph,
                                       float temperature, float humidity, unsigned long vibration,
                                       int rssi, float snr, const AIResult &ai,
                                       const String &nodeId) {
  String targetNode = (nodeId.length() > 0) ? nodeId : String(KODE_NODE);
  String json = "{";
  json += "\"kode_node\":\"" + targetNode + "\",";
  json += "\"api_token\":\"" + String(LOCAL_API_TOKEN) + "\",";
  json += "\"getaran\":" + String(vibration) + ",";
  json += "\"ketinggian_air\":" + String(waterLevel, 1) + ",";
  json += "\"turbidity\":" + String(turbidity) + ",";
  json += "\"ph\":" + String(ph, 2) + ",";
  json += "\"suhu\":" + String(temperature, 1) + ",";
  json += "\"kelembapan\":" + String(humidity, 1) + ",";
  json += "\"rssi\":" + String(rssi) + ",";
  json += "\"snr\":" + String(snr, 2) + ",";
  json += "\"ai_status\":\"" + String(ai.status) + "\",";
  json += "\"ai_confidence\":" + String(ai.confidence, 1) + ",";
  json += "\"ai_diagnosis\":\"" + String(ai.diagnosis) + "\",";
  json += "\"gateway_id\":\"" + String(GATEWAY_ID) + "\"";
  json += "}";
  return json;
}
#endif


String LoraProtocol::toJson(const String &payload) {
  String json = "{";
  int start = 0;
  bool first = true;

  while (start < (int)payload.length()) {
    int comma = payload.indexOf(',', start);
    String pair = (comma == -1) ? payload.substring(start) : payload.substring(start, comma);

    int colon = pair.indexOf(':');
    if (colon != -1) {
      String key = pair.substring(0, colon);
      String value = pair.substring(colon + 1);

      if (!first) json += ",";
      first = false;
      json += "\"" + key + "\":";

      bool isNumeric = value.length() > 0 &&
        (isDigit(value.charAt(0)) || value.charAt(0) == '-' || value.charAt(0) == '.');

      json += isNumeric ? value : ("\"" + value + "\"");
    }

    if (comma == -1) break;
    start = comma + 1;
  }

  json += "}";
  return json;
}

String LoraProtocol::injectNumericField(String json, const String &key, const String &value) {
  if (json.length() < 2) return json;
  json.remove(json.length() - 1);
  json += ",\"" + key + "\":" + value + "}";
  return json;
}

String LoraProtocol::injectStringField(String json, const String &key, const String &value) {
  if (json.length() < 2) return json;
  json.remove(json.length() - 1);
  json += ",\"" + key + "\":\"" + value + "\"}";
  return json;
}
