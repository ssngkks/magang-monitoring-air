const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('api_token');
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = new Error(
      payload?.message || `Request failed (${response.status})`,
    ) as Error & { status?: number; data?: ApiError };
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<{ message: string; data: { user: User; token: string } }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    apiFetch<{ message: string; data: { user: User; token: string } }>('/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, password_confirmation: password }),
    }),
  me: () => apiFetch<{ data: User }>('/me'),
  updateProfile: (data: { name?: string; avatar?: string | null }) =>
    apiFetch<{ message: string; data: User }>('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  logout: () => apiFetch<{ message: string }>('/logout', { method: 'POST' }),
  nodes: () => apiFetch<{ data: Node[] }>('/nodes'),
  sensorData: (nodeId: string | number, params = '') =>
    apiFetch<{ data: SensorData[]; meta: { per_page?: number; has_more?: boolean; next_cursor?: string | null; total?: number; downsampled?: boolean; requested?: number; returned?: number; total_in_range?: number } }>(
      `/nodes/${nodeId}/sensor-data${params ? `?${params}` : ''}`,
    ),
  alerts: (params = '') =>
    apiFetch<{ data: AlertData[]; current_page: number; last_page: number }>(
      `/alerts${params ? `?${params}` : ''}`,
    ),
  markAlertRead: (id: string | number) =>
    apiFetch<{ data: AlertData }>(`/alerts/${id}/read`, { method: 'PATCH' }),
  markAllAlertsRead: () =>
    apiFetch<{ message: string; count: number }>(`/alerts/read-all`, { method: 'PATCH' }),
  reportsSummary: () =>
    apiFetch<{
      data: {
        total_records: number;
        earliest_record: string | null;
        latest_record: string | null;
        sampling_interval_seconds: number;
        parameters: string[];
        averages: {
          ph: number;
          temp: number;
          humidity: number;
          turbidity: number;
          water_level: number;
        } | null;
      };
    }>('/reports/summary'),
  reportsData: (params = '') =>
    apiFetch<{
      data: {
        id: string;
        device_code?: string;
        location_name?: string;
        date: string;
        time: string;
        timestamp: string;
        ph: number;
        temperature: number;
        humidity: number;
        turbidity: number;
        water_level: number;
        vibration: boolean;
        ai_status: string;
        mpu_x?: number | null;
        mpu_y?: number | null;
        mpu_z?: number | null;
        roll?: number | null;
        pitch?: number | null;
        yaw?: number | null;
        stability_status?: string;
      }[];
      meta: { total: number; has_more: boolean; device_code?: string; location_name?: string };
    }>(`/reports/data${params ? `?${params}` : ''}`),
  aiDiagnostics: (nodeId?: string | number) =>
    apiFetch<AIDiagnosticResponse>(`/ai/diagnostics${nodeId ? `?node_id=${nodeId}` : ''}`),

  // Platform Management
  locations: () => apiFetch<{ data: LocationItem[] }>('/locations'),
  createLocation: (data: Partial<LocationItem>) =>
    apiFetch<{ message: string; data: LocationItem }>('/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateLocation: (id: string | number, data: Partial<LocationItem>) =>
    apiFetch<{ message: string }>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteLocation: (id: string | number) =>
    apiFetch<{ message: string }>(`/locations/${id}`, { method: 'DELETE' }),

  devices: () => apiFetch<{ data: DeviceItem[] }>('/devices'),
  discoverDevice: () =>
    apiFetch<{
      detected: boolean;
      preview?: {
        kode_node: string;
        device_name: string;
        model_type: string;
        firmware_version: string;
        rssi: number;
        snr: number;
        ai_status: string;
        is_online: boolean;
        last_seen_seconds_ago: number;
        metrics: {
          ph?: number | null;
          turbidity?: number | null;
          water_level?: number | null;
          temperature?: number | null;
          humidity?: number | null;
          vibration?: number | null;
        };
        already_registered: boolean;
        registered_node_id?: string | null;
      };
      message?: string;
    }>('/devices/discover'),
  createDevice: (data: Partial<DeviceItem>) =>
    apiFetch<{ message: string; data: DeviceItem }>('/devices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDevice: (id: string | number, data: Partial<DeviceItem>) =>
    apiFetch<{ message: string }>(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteDevice: (id: string | number) =>
    apiFetch<{ message: string }>(`/devices/${id}`, { method: 'DELETE' }),

  // Lifecycle device §5 audit.md — hello/heartbeat milik ESP32, tiga ini milik dashboard
  pendingDevices: () => apiFetch<{ data: PendingDevice[] }>('/devices/pending'),
  registerDevice: (id: string | number, data: {
    device_name?: string;
    device_type_id?: string | number | null;
    location_id?: string | number | null;
    model_type?: string | null;
    sensor_mode?: 'auto' | 'manual';
  }) =>
    apiFetch<{ message: string; data: DeviceItem; sensors?: unknown }>(`/devices/${id}/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  ignoreDevice: (id: string | number) =>
    apiFetch<{ message: string }>(`/devices/${id}/ignore`, { method: 'POST' }),

  deviceSensors: (nodeId: string | number) =>
    apiFetch<{ data: SensorItem[] }>(`/devices/${nodeId}/sensors`),
  autoDetectSensors: (nodeId: string | number) =>
    apiFetch<{
      message: string;
      count: number;
      data: SensorItem[];
    }>(`/devices/${nodeId}/auto-detect-sensors`, { method: 'POST' }),
  createSensor: (nodeId: string | number, data: Partial<SensorItem>) =>
    apiFetch<{ message: string; data: SensorItem }>(`/devices/${nodeId}/sensors`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSensor: (id: string | number, data: Partial<SensorItem>) =>
    apiFetch<{ message: string }>(`/sensors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSensor: (id: string | number) =>
    apiFetch<{ message: string }>(`/sensors/${id}`, { method: 'DELETE' }),

  sensorTypes: () => apiFetch<{ data: SensorTypeItem[] }>('/sensor-types'),

  // Jenis Perangkat (Device Types)
  deviceTypes: () => apiFetch<{ data: DeviceTypeItem[] }>('/device-types'),
  createDeviceType: (data: { name: string; description?: string }) =>
    apiFetch<{ message: string; data: DeviceTypeItem }>('/device-types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDeviceType: (id: string | number, data: { name?: string; description?: string }) =>
    apiFetch<{ message: string }>(`/device-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteDeviceType: (id: string | number) =>
    apiFetch<{ message: string }>(`/device-types/${id}`, { method: 'DELETE' }),

  // Penugasan Perangkat ke Sektor Lokasi
  assignDevicesToLocation: (locationId: string | number, deviceIds: (string | number)[]) =>
    apiFetch<{ message: string }>(`/locations/${locationId}/assign-devices`, {
      method: 'POST',
      body: JSON.stringify({ device_ids: deviceIds }),
    }),

  // Firmware & OTA Management
  firmwares: () => apiFetch<{ data: FirmwareItem[] }>('/firmwares'),
  uploadFirmware: async (formData: FormData) => {
    const token = localStorage.getItem('api_token');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/firmwares`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Gagal mengunggah firmware');
    }
    return res.json();
  },
  updateFirmware: (id: string | number, data: Partial<FirmwareItem>) =>
    apiFetch<{ message: string; data: FirmwareItem }>(`/firmwares/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFirmware: (id: string | number) =>
    apiFetch<{ message: string }>(`/firmwares/${id}`, { method: 'DELETE' }),
  triggerOta: (nodeId: string | number, firmwareId: string | number, force = false) =>
    apiFetch<{ message: string; data: any; code?: string }>(`/devices/${nodeId}/ota/trigger`, {
      method: 'POST',
      body: JSON.stringify({ firmware_id: firmwareId, force }),
    }),
  triggerOtaMulti: (firmwareId: string | number, deviceIds: (string | number)[], force = false) =>
    apiFetch<{ message: string; data: any[]; count: number; skipped?: number; blocked?: { id: string | number; kode_node: string }[]; code?: string }>(`/devices/ota/trigger-multi`, {
      method: 'POST',
      body: JSON.stringify({ firmware_id: firmwareId, device_ids: deviceIds, force }),
    }),
  otaStatus: (nodeId: string | number) =>
    apiFetch<{ data: OtaStatusItem | null }>(`/devices/${nodeId}/ota/status`),
  forceOtaCheck: (nodeId: string | number) =>
    apiFetch<{ message: string; kode_node: string; rtdb_path: string }>(
      `/devices/${nodeId}/ota/force-check`,
      { method: 'POST' },
    ),
  getOtaManifestUrl: (nodeId: string | number) =>
    apiFetch<{ manifest_url: string; kode_node: string; base_url: string; secrets_h_line: string }>(
      `/devices/${nodeId}/ota/manifest-url`,
    ),
};

export interface User {
  id: string | number;
  name: string;
  email: string;
  role: string;
  email_verified_at?: string | null;
  avatar?: string | null;
  photo_url?: string | null;
}

export interface Node {
  id: string | number;
  kode_node: string;
  nama_lokasi: string;
  status: string;
  is_online: boolean;
  last_seen_at: string | null;
}

export interface SensorData {
  id: string | number;
  node: string;
  ph: number | string;
  temp: number | string;
  humidity: number | string;
  turbidity: number | string;
  water_level: number | string;
  vibration: boolean | number;
  ai_status?: string | null;
  mpu_x?: number | null;
  mpu_y?: number | null;
  mpu_z?: number | null;
  roll?: number | null;
  pitch?: number | null;
  yaw?: number | null;
  stability_status?: string;
  created_at: string;
}

export interface LocationItem {
  id: string | number;
  name: string;
  code?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  created_at?: string;
}

export interface SensorTypeItem {
  id: string | number;
  code: string;
  name: string;
  unit: string;
  default_min?: number;
  default_max?: number;
  icon?: string;
  chart_type?: string;
  config_schema?: Record<string, any>;
}

export interface SensorItem {
  id: string | number;
  node_id: string | number;
  sensor_type_id: string | number;
  name: string;
  code: string;
  pin?: string;
  unit?: string;
  min_value?: number;
  max_value?: number;
  warning_threshold_min?: number;
  warning_threshold_max?: number;
  critical_threshold_min?: number;
  critical_threshold_max?: number;
  calibration_data?: Record<string, any>;
  config?: Record<string, any>;
  is_active: boolean;
  sensor_type?: SensorTypeItem;
  created_at?: string;
}

export interface DeviceTypeItem {
  id: string | number;
  name: string;
  description?: string;
  user_id?: string;
  created_at?: string;
}

export interface DeviceItem {
  id: string | number;
  kode_node: string;
  device_name: string;
  nama_lokasi: string;
  location_id?: string | number | null;
  device_type_id?: string | number | null;
  device_role?: 'node' | 'gateway' | string;
  model_type?: string;
  firmware_version?: string;
  capabilities?: string[] | null;
  ip_address?: string | null;
  hardware_id?: string | null;
  status: string;
  is_online: boolean;
  connection?: 'ONLINE' | 'STALE' | 'OFFLINE' | string;
  seconds_ago?: number | null;
  sensor_count: number;
  sensors?: SensorItem[];
  last_seen_at?: string | null;
}

// Perangkat menunggu registrasi — sumber section "Perangkat Baru Ditemukan" (§5.5)
export interface PendingDevice extends DeviceItem {
  connection: 'ONLINE' | 'STALE' | 'OFFLINE' | string;
  seconds_ago: number | null;
}

export interface FirmwareItem {
  id: string | number;
  version: string;
  active_ota_count?: number;
  name: string;
  file_path?: string | null;
  file_size: number;
  file_size_formatted?: string;
  binary_deleted?: boolean;
  checksum_sha256?: string;
  target_device_model?: string;
  changelog?: string;
  is_active: boolean;
  created_at?: string;
  last_flashed_at?: string | null;
  latest_ota?: {
    id: string | number;
    node_id: string | number;
    status: 'pending' | 'downloading' | 'installing' | 'success' | 'failed';
    progress_percent: number;
    error_message?: string | null;
    scheduled_at?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
    node_name?: string | null;
    kode_node?: string | null;
  } | null;
}

export interface OtaStatusItem {
  id: string | number;
  node_id: string | number;
  firmware_id: string | number;
  status: 'pending' | 'downloading' | 'installing' | 'success' | 'failed';
  progress_percent: number;
  error_message?: string;
  scheduled_at?: string;
  completed_at?: string;
  firmware?: FirmwareItem;
}

export interface AlertData {
  id: string | number;
  node_id?: string | number;
  type?: string;
  severity?: string;
  title?: string;
  message?: string;
  description?: string;
  is_read: boolean;
  created_at: string;
  node?: { id: number; kode_node: string; nama_lokasi: string };
}

export interface AIDiagnosticTrigger {
  param: string;
  value: string;
  level: 'normal' | 'warning' | 'critical';
}

export interface AIRadarItem {
  subject: string;
  nilai_aktual: number;
  skor: number;
  batas_aman: number;
  unit: string;
}

export interface AIDiagnosticCurrent {
  status: 'Normal' | 'Anomali' | 'Bahaya';
  confidence: number;
  diagnosis: string;
  triggers: AIDiagnosticTrigger[];
  latency_us: number;
  radar: AIRadarItem[];
  raw_reading: {
    ph: number;
    turbidity: number;
    temp: number;
    water_level: number;
    vibration: number;
  };
  timestamp: string;
}

export interface AIDiagnosticHistoryItem {
  timestamp: string;
  status: string;
  confidence: string;
  trigger: string;
  note: string;
}

export interface AIComparisonItem {
  skenario: string;
  threshold_biasa: string;
  edge_ai: string;
  keuntungan: string;
}

export interface AIDiagnosticResponse {
  data: {
    current: AIDiagnosticCurrent;
    history: AIDiagnosticHistoryItem[];
    comparison: AIComparisonItem[];
  };
}

