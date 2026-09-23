import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Building2,
  Plus,
  Radio,
  Settings2,
  Trash2,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Gauge,
  Droplet,
  Thermometer,
  CloudRain,
  Activity,
  Zap,
  Compass,
  ArrowUpCircle,
  FileCode,
  Layers,
  SlidersHorizontal,
  Search,
  Pencil,
  Send,
  XCircle,
  X,
  Tag,
  Filter,
  CheckSquare,
  Square,
  Users,
  HardDrive,
  Info,
  ArrowLeft,
} from 'lucide-react';
import {
  api,
  DeviceItem,
  DeviceTypeItem,
  LocationItem,
  PendingDevice,
  SensorItem,
  SensorTypeItem,
  FirmwareItem,
  OtaStatusItem,
} from '../lib/api';
import { ActionFeedbackModal, ActionFeedbackStatus } from '../components/ActionFeedbackModal';

export function DevicesManagement() {
  const [activeTab, setActiveTab] = useState<'devices' | 'device-types' | 'locations' | 'firmware'>('devices');

  // Lists state
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceTypeItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [sensorTypes, setSensorTypes] = useState<SensorTypeItem[]>([]);
  const [firmwares, setFirmwares] = useState<FirmwareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Selected device for Detail view
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [deviceSensors, setDeviceSensors] = useState<SensorItem[]>([]);
  const [deviceOtaStatus, setDeviceOtaStatus] = useState<OtaStatusItem | null>(null);
  const [otaManifestUrl, setOtaManifestUrl] = useState<string>('');
  const [isForceCheckLoading, setIsForceCheckLoading] = useState(false);

  // Action Feedback Modal State
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    status: ActionFeedbackStatus;
    title?: string;
    message?: string;
  }>({
    isOpen: false,
    status: 'idle',
  });

  const showFeedback = (status: ActionFeedbackStatus, title: string, message: string) => {
    setFeedback({ isOpen: true, status, title, message });
  };

  const closeFeedback = () => {
    setFeedback((prev) => ({ ...prev, isOpen: false, status: 'idle' }));
  };

  // Modal open states
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [isAddDeviceTypeOpen, setIsAddDeviceTypeOpen] = useState(false);
  const [isEditDeviceTypeOpen, setIsEditDeviceTypeOpen] = useState(false);
  const [editingDeviceType, setEditingDeviceType] = useState<DeviceTypeItem | null>(null);
  const [editDeviceTypeForm, setEditDeviceTypeForm] = useState({ name: '', description: '' });
  const [isAddSensorOpen, setIsAddSensorOpen] = useState(false);
  const [isUploadFirmwareOpen, setIsUploadFirmwareOpen] = useState(false);
  const [isEditFirmwareOpen, setIsEditFirmwareOpen] = useState(false);
  const [editingFirmware, setEditingFirmware] = useState<FirmwareItem | null>(null);
  const [editFirmwareForm, setEditFirmwareForm] = useState({
    name: '',
    version: '',
    target_device_model: '',
    changelog: '',
  });

  // Sector Device Assignment Modal
  const [assignSectorModal, setAssignSectorModal] = useState<LocationItem | null>(null);
  const [sectorSelectedDeviceIds, setSectorSelectedDeviceIds] = useState<string[]>([]);
  const [sectorFilterType, setSectorFilterType] = useState<string>('all');
  const [sectorSearch, setSectorSearch] = useState<string>('');

  // Upgrade Firmware Multi-Device Modal
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [targetFirmwareForUpgrade, setTargetFirmwareForUpgrade] = useState<FirmwareItem | null>(null);
  const [upgradeSelectedDeviceIds, setUpgradeSelectedDeviceIds] = useState<string[]>([]);
  const [upgradeSearchQuery, setUpgradeSearchQuery] = useState<string>('');
  const [isUpgradingFromRepo, setIsUpgradingFromRepo] = useState(false);

  // Upload Firmware Multi-Device Selection
  const [uploadFirmwareTargetDevices, setUploadFirmwareTargetDevices] = useState<string[]>([]);
  const [uploadSearchQuery, setUploadSearchQuery] = useState<string>('');
  const [isUploadingFirmware, setIsUploadingFirmware] = useState(false);

  // Perangkat Baru Ditemukan — antrean pending dari hello (§5.5)
  const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([]);
  const [registerTarget, setRegisterTarget] = useState<PendingDevice | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    device_name: '',
    device_type_id: '',
    location_id: '',
    sensor_mode: 'auto' as 'auto' | 'manual',
  });

  // Auto-detect & device addition modes
  const [deviceAddMode, setDeviceAddMode] = useState<'auto' | 'manual'>('auto');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredPreview, setDiscoveredPreview] = useState<any>(null);
  const [detectedDevices, setDetectedDevices] = useState<any[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Sensor auto-detect & calibration modal states
  const [isAutoDetectingSensors, setIsAutoDetectingSensors] = useState(false);
  const [calibratingSensor, setCalibratingSensor] = useState<SensorItem | null>(null);
  const [calibrationForm, setCalibrationForm] = useState({
    offset: 0,
    scale: 1,
    warning_threshold_min: 0,
    warning_threshold_max: 100,
    critical_threshold_min: 0,
    critical_threshold_max: 100,
  });

  // Form states
  const [locationForm, setLocationForm] = useState({ name: '', code: '', description: '', address: '' });
  const [deviceTypeForm, setDeviceTypeForm] = useState({ name: '', description: '' });
  const [deviceForm, setDeviceForm] = useState({
    kode_node: '',
    device_name: '',
    model_type: '',
    location_id: '',
  });
  const [sensorForm, setSensorForm] = useState({
    sensor_type_id: '',
    name: '',
    code: '',
    pin: '',
    unit: '',
    min_value: 0,
    max_value: 100,
    warning_threshold_min: 0,
    warning_threshold_max: 100,
    critical_threshold_min: 0,
    critical_threshold_max: 100,
  });
  const [firmwareForm, setFirmwareForm] = useState({
    version: '',
    name: '',
    target_device_model: '',
    changelog: '',
    file: null as File | null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Safe Close Handlers with Unsaved Changes Confirmation (Tugas 3b)
  const handleCloseAddDevice = () => {
    const isDirty = Boolean(deviceForm.kode_node.trim() || deviceForm.device_name.trim());
    if (isDirty && !window.confirm('Ada data yang belum disimpan di form perangkat. Yakin ingin menutup form?')) {
      return;
    }
    setIsAddDeviceOpen(false);
  };

  const handleCloseAddDeviceType = () => {
    const isDirty = Boolean(deviceTypeForm.name.trim() || deviceTypeForm.description.trim());
    if (isDirty && !window.confirm('Ada data yang belum disimpan di form jenis perangkat. Yakin ingin menutup form?')) {
      return;
    }
    setIsAddDeviceTypeOpen(false);
  };

  const handleCloseEditDeviceType = () => {
    setIsEditDeviceTypeOpen(false);
    setEditingDeviceType(null);
  };

  const handleCloseAddLocation = () => {
    const isDirty = Boolean(locationForm.name.trim() || locationForm.code.trim());
    if (isDirty && !window.confirm('Ada data yang belum disimpan di form sektor. Yakin ingin menutup form?')) {
      return;
    }
    setIsAddLocationOpen(false);
  };

  const handleCloseAssignSector = () => {
    setAssignSectorModal(null);
  };

  const handleCloseAddSensor = () => {
    const isDirty = Boolean(sensorForm.name.trim() || sensorForm.code.trim());
    if (isDirty && !window.confirm('Ada data yang belum disimpan di form sensor. Yakin ingin menutup form?')) {
      return;
    }
    setIsAddSensorOpen(false);
  };

  const handleCloseCalibrateSensor = () => {
    setCalibratingSensor(null);
  };

  const handleCloseUploadFirmware = () => {
    // §10: jangan tutup paksa saat upload berjalan (tombol juga ter-disable).
    if (isUploadingFirmware) return;
    const isDirty = Boolean(firmwareForm.name.trim() || firmwareForm.version.trim() || firmwareForm.file);
    if (isDirty && !window.confirm('Ada data yang belum disimpan di form upload firmware. Yakin ingin menutup form?')) {
      return;
    }
    setIsUploadFirmwareOpen(false);
  };

  const handleCloseEditFirmware = () => {
    setIsEditFirmwareOpen(false);
    setEditingFirmware(null);
  };

  const handleCloseUpgradeModal = () => {
    setIsUpgradeModalOpen(false);
    setTargetFirmwareForUpgrade(null);
  };

  // Global ESC Key Listener (Tugas 3b)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddDeviceOpen) {
          handleCloseAddDevice();
        } else if (isAddDeviceTypeOpen) {
          handleCloseAddDeviceType();
        } else if (isEditDeviceTypeOpen) {
          handleCloseEditDeviceType();
        } else if (isAddLocationOpen) {
          handleCloseAddLocation();
        } else if (assignSectorModal) {
          handleCloseAssignSector();
        } else if (isAddSensorOpen) {
          handleCloseAddSensor();
        } else if (calibratingSensor) {
          handleCloseCalibrateSensor();
        } else if (isUploadFirmwareOpen) {
          handleCloseUploadFirmware();
        } else if (registerTarget) {
          handleCloseRegister();
        } else if (isEditFirmwareOpen) {
          handleCloseEditFirmware();
        } else if (isUpgradeModalOpen) {
          handleCloseUpgradeModal();
        } else if (selectedDevice) {
          setSelectedDevice(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isAddDeviceOpen,
    isAddDeviceTypeOpen,
    isEditDeviceTypeOpen,
    isAddLocationOpen,
    assignSectorModal,
    isAddSensorOpen,
    calibratingSensor,
    isUploadFirmwareOpen,
    registerTarget,
    isEditFirmwareOpen,
    isUpgradeModalOpen,
    selectedDevice,
    deviceForm,
    deviceTypeForm,
    locationForm,
    sensorForm,
    firmwareForm,
  ]);

  // Load all initial data
  const loadData = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [devRes, locRes, typesRes, firmRes, devTypesRes, pendRes] = await Promise.all([
        api.devices().catch(() => ({ data: [] })),
        api.locations().catch(() => ({ data: [] })),
        api.sensorTypes().catch(() => ({ data: [] })),
        api.firmwares().catch(() => ({ data: [] })),
        api.deviceTypes().catch(() => ({ data: [] })),
        api.pendingDevices().catch(() => ({ data: [] })),
      ]);

      setDevices(devRes.data || []);
      setLocations(locRes.data || []);
      setSensorTypes(typesRes.data || []);
      setFirmwares(firmRes.data || []);
      setDeviceTypes(devTypesRes.data || []);
      setPendingDevices(pendRes.data || []);
      setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      console.error('Gagal memuat data manajemen perangkat:', e);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Sinkronisasi otomatis berkala tiap 6 detik dengan database MySQL
    const intervalId = setInterval(() => {
      loadData(true);
    }, 6000);
    return () => clearInterval(intervalId);
  }, []);

  // Load sensors for selected device
  const handleSelectDevice = async (device: DeviceItem) => {
    setSelectedDevice(device);
    setOtaManifestUrl('');
    try {
      const [sensRes, otaRes] = await Promise.all([
        api.deviceSensors(device.id).catch(() => ({ data: [] })),
        api.otaStatus(device.id).catch(() => ({ data: null })),
      ]);
      setDeviceSensors(sensRes.data || []);
      setDeviceOtaStatus(otaRes.data || null);
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================
  // HANDLERS: JENIS PERANGKAT (FITUR BARU)
  // ==========================================

  const handleSubmitDeviceType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceTypeForm.name.trim()) return;

    showFeedback('loading', 'Menyimpan Jenis Perangkat...', 'Sedang mendaftarkan jenis perangkat baru ke server...');
    try {
      const res = await api.createDeviceType(deviceTypeForm);
      showFeedback('success', 'Berhasil', `Jenis perangkat "${res.data.name}" berhasil ditambahkan.`);
      setIsAddDeviceTypeOpen(false);
      setDeviceTypeForm({ name: '', description: '' });
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menambahkan', err.message || 'Gagal menambahkan jenis perangkat.');
    }
  };

  const handleDeleteDeviceType = async (type: DeviceTypeItem) => {
    if (!confirm(`Hapus jenis perangkat "${type.name}"?`)) return;

    showFeedback('loading', 'Menghapus Jenis Perangkat...', 'Sedang memproses penghapusan...');
    try {
      await api.deleteDeviceType(type.id);
      showFeedback('success', 'Berhasil', `Jenis perangkat "${type.name}" berhasil dihapus.`);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menghapus', err.message || 'Gagal menghapus jenis perangkat.');
    }
  };

  const handleOpenEditDeviceType = (dt: DeviceTypeItem) => {
    setEditingDeviceType(dt);
    setEditDeviceTypeForm({ name: dt.name, description: dt.description || '' });
    setIsEditDeviceTypeOpen(true);
  };

  const handleSaveEditDeviceType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeviceType) return;
    if (!editDeviceTypeForm.name.trim()) return;

    showFeedback('loading', 'Menyimpan Perubahan...', 'Sedang memperbarui jenis perangkat...');
    try {
      await api.updateDeviceType(editingDeviceType.id, {
        name: editDeviceTypeForm.name.trim(),
        description: editDeviceTypeForm.description.trim(),
      });
      showFeedback('success', 'Berhasil', `Jenis perangkat "${editDeviceTypeForm.name}" berhasil diperbarui.`);
      setIsEditDeviceTypeOpen(false);
      setEditingDeviceType(null);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Memperbarui', err.message || 'Gagal mengubah jenis perangkat.');
    }
  };

  const handleOpenAddDeviceForType = (dt?: DeviceTypeItem) => {
    setDeviceAddMode('manual');
    setDeviceForm((prev) => ({
      ...prev,
      model_type: dt ? dt.name : (prev.model_type || deviceTypes[0]?.name || ''),
    }));
    setDiscoveredPreview(null);
    setDiscoveryError(null);
    setIsAddDeviceOpen(true);
  };

  // ==========================================
  // HANDLERS: LOKASI & SEKTOR
  // ==========================================

  const handleSubmitLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    showFeedback('loading', 'Menyimpan Sektor...', 'Sedang membuat data Sektor lokasi baru...');
    try {
      await api.createLocation(locationForm);
      showFeedback('success', 'Berhasil', `Sektor ${locationForm.name} berhasil ditambahkan.`);
      setIsAddLocationOpen(false);
      setLocationForm({ name: '', code: '', description: '', address: '' });
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menambah Sektor', err.message || 'Gagal menambahkan sektor.');
    }
  };

  const handleDeleteLocation = async (loc: LocationItem) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus sektor "${loc.name}"? Perangkat yang terhubung akan dilepas status lokasinya.`)) return;

    showFeedback('loading', 'Menghapus Sektor...', 'Sedang memproses...');
    try {
      await api.deleteLocation(loc.id);
      showFeedback('success', 'Berhasil', `Sektor "${loc.name}" berhasil dihapus.`);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menghapus Sektor', err.message || 'Gagal menghapus sektor.');
    }
  };

  const handleOpenAssignSector = (loc: LocationItem) => {
    setAssignSectorModal(loc);
    // Cari device yang saat ini berlokasi di sektor ini
    const assignedIds = devices
      .filter((d) => String(d.location_id) === String(loc.id) || d.nama_lokasi === loc.name)
      .map((d) => String(d.id));
    setSectorSelectedDeviceIds(assignedIds);
    setSectorFilterType('all');
    setSectorSearch('');
  };

  const handleSaveSectorAssignment = async () => {
    if (!assignSectorModal) return;

    showFeedback('loading', 'Menugaskan Perangkat...', `Sedang menempatkan ${sectorSelectedDeviceIds.length} perangkat ke sektor ${assignSectorModal.name}...`);
    try {
      await api.assignDevicesToLocation(assignSectorModal.id, sectorSelectedDeviceIds);
      showFeedback('success', 'Berhasil', `Penugasan perangkat ke sektor "${assignSectorModal.name}" berhasil disimpan.`);
      setAssignSectorModal(null);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menugaskan', err.message || 'Gagal menugaskan perangkat ke sektor.');
    }
  };

  // ==========================================
  // HANDLERS: PERANGKAT ESP32
  // ==========================================

  const handleDiscover = async () => {
    try {
      setIsDiscovering(true);
      setDiscoveryError(null);
      const res = await api.discoverDevice();
      if (res.detected) {
        if (res.detected_devices && Array.isArray(res.detected_devices)) {
          setDetectedDevices(res.detected_devices);
        }
        if (res.preview) {
          setDiscoveredPreview(res.preview);
          if (!res.preview.already_registered) {
            setDeviceForm((prev) => ({
              ...prev,
              kode_node: res.preview.kode_node,
              device_name: res.preview.device_name,
              model_type: res.preview.model_type || (deviceTypes[0]?.name || ''),
            }));
          }
        }
      } else {
        setDiscoveredPreview(null);
        setDetectedDevices([]);
        setDiscoveryError(res.message || 'Belum ada transmisi data dari ESP32 yang terdeteksi.');
      }
    } catch (err: any) {
      setDiscoveredPreview(null);
      setDetectedDevices([]);
      setDiscoveryError(err.message || 'Gagal memindai ESP32.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmitDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.kode_node.trim() || isSubmitting) return;

    setIsSubmitting(true);
    showFeedback('loading', 'Mendaftarkan Perangkat...', 'Menyimpan identitas perangkat ESP32 ke sistem...');
    try {
      const res = await api.createDevice({
        kode_node: deviceForm.kode_node.trim(),
        device_name: deviceForm.device_name.trim() || 'ESP32 Device',
        model_type: deviceForm.model_type || null,
        location_id: deviceForm.location_id ? Number(deviceForm.location_id) : null,
      });
      showFeedback('success', 'Berhasil', `Perangkat ${res.data.kode_node} berhasil didaftarkan. Anda dapat menugaskan sektornya di tab Lokasi.`);
      setIsAddDeviceOpen(false);
      setDiscoveredPreview(null);
      setDiscoveryError(null);
      setDeviceForm({ kode_node: '', device_name: '', model_type: '', location_id: '' });
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Mendaftar', err.message || 'Perangkat dengan kode ini sudah terdaftar atau input tidak valid.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDeviceType = async (deviceId: string | number, newType: string) => {
    showFeedback('loading', 'Memperbarui Jenis Perangkat...', 'Sedang menyimpan perubahan...');
    try {
      await api.updateDevice(deviceId, { model_type: newType });
      showFeedback('success', 'Berhasil', `Jenis perangkat berhasil diperbarui menjadi "${newType}".`);
      loadData();
      if (selectedDevice && selectedDevice.id === deviceId) {
        setSelectedDevice({ ...selectedDevice, model_type: newType });
      }
    } catch (err: any) {
      showFeedback('error', 'Gagal Memperbarui', err.message || 'Gagal mengubah jenis perangkat.');
    }
  };

  // ==========================================
  // HANDLERS: PERANGKAT BARU DITEMUKAN (§5.5)
  // ==========================================

  const handleOpenRegister = (dev: PendingDevice) => {
    setRegisterTarget(dev);
    setRegisterForm({
      device_name: dev.device_name && !dev.device_name.startsWith('Perangkat Baru')
        ? dev.device_name
        : '',
      device_type_id: dev.device_type_id ? String(dev.device_type_id) : '',
      location_id: dev.location_id ? String(dev.location_id) : '',
      sensor_mode: 'auto',
    });
  };

  const handleCloseRegister = () => {
    if (isRegistering) return;
    setRegisterTarget(null);
  };

  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerTarget || isRegistering) return;

    setIsRegistering(true);
    showFeedback('loading', 'Mendaftarkan Perangkat...', `Mengaktifkan ${registerTarget.kode_node}...`);
    try {
      await api.registerDevice(registerTarget.id, {
        device_name: registerForm.device_name.trim() || registerTarget.device_name,
        device_type_id: registerForm.device_type_id ? Number(registerForm.device_type_id) : null,
        location_id: registerForm.location_id ? Number(registerForm.location_id) : null,
        sensor_mode: registerForm.sensor_mode,
      });
      showFeedback(
        'success',
        'Berhasil',
        registerForm.sensor_mode === 'auto'
          ? `Perangkat ${registerTarget.kode_node} aktif. Sensor otomatis direkonsiliasi dari capability device.`
          : `Perangkat ${registerTarget.kode_node} aktif (mode sensor manual).`,
      );
      setRegisterTarget(null);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Mendaftar', err.message || 'Gagal mendaftarkan perangkat.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleIgnoreDevice = async (dev: PendingDevice) => {
    if (!confirm(`Abaikan perangkat ${dev.kode_node}? Perangkat dinonaktifkan (bisa diaktifkan lagi), bukan dihapus.`)) return;
    showFeedback('loading', 'Mengabaikan...', `Menonaktifkan ${dev.kode_node}...`);
    try {
      await api.ignoreDevice(dev.id);
      showFeedback('success', 'Berhasil', `Perangkat ${dev.kode_node} diabaikan (nonaktif).`);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Mengabaikan', err.message || 'Gagal mengabaikan perangkat.');
    }
  };

  const handleDeleteDevice = async (deviceId: string | number, deviceCode: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus perangkat ${deviceCode}? Seluruh sensor dan data terkait akan ikut dihapus.`)) {
      return;
    }
    showFeedback('loading', 'Menghapus Perangkat...', `Sedang menghapus perangkat ${deviceCode}...`);
    try {
      await api.deleteDevice(deviceId);
      showFeedback('success', 'Berhasil', `Perangkat ${deviceCode} berhasil dihapus.`);
      if (selectedDevice?.id === deviceId) {
        setSelectedDevice(null);
      }
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menghapus', err.message || 'Gagal menghapus perangkat.');
    }
  };

  // ==========================================
  // HANDLERS: SENSOR
  // ==========================================

  const handleAutoDetectSensors = async () => {
    if (!selectedDevice) return;
    showFeedback('loading', 'Mendeteksi Sensor...', `Menganalisis transmisi parameter aktif dari ${selectedDevice.kode_node}...`);
    try {
      setIsAutoDetectingSensors(true);
      const res = await api.autoDetectSensors(selectedDevice.id);
      showFeedback('success', 'Berhasil', res.message);
      handleSelectDevice(selectedDevice);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Deteksi', err.message || 'Gagal mendeteksi sensor otomatis.');
    } finally {
      setIsAutoDetectingSensors(false);
    }
  };

  const handleSensorTypeChange = (typeId: string) => {
    const found = sensorTypes.find((t) => String(t.id) === typeId);
    if (found) {
      setSensorForm((prev) => ({
        ...prev,
        sensor_type_id: typeId,
        name: found.name,
        code: `${found.code}_${Date.now().toString().slice(-4)}`,
        unit: found.unit,
        min_value: found.default_min ?? 0,
        max_value: found.default_max ?? 100,
      }));
    } else {
      setSensorForm((prev) => ({ ...prev, sensor_type_id: typeId }));
    }
  };

  const handleSubmitSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    showFeedback('loading', 'Menambahkan Sensor...', `Menyimpan sensor ${sensorForm.name}...`);
    try {
      await api.createSensor(selectedDevice.id, sensorForm);
      showFeedback('success', 'Berhasil', `Sensor ${sensorForm.name} berhasil ditambahkan ke ${selectedDevice.kode_node}.`);
      setIsAddSensorOpen(false);
      handleSelectDevice(selectedDevice);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menambah Sensor', err.message || 'Gagal menambahkan sensor.');
    }
  };

  const handleOpenCalibration = (sensor: SensorItem) => {
    setCalibratingSensor(sensor);
    const calData = (sensor.calibration_data as any) || {};
    setCalibrationForm({
      offset: calData.offset ?? 0,
      scale: calData.scale ?? 1,
      warning_threshold_min: sensor.warning_threshold_min ?? sensor.min_value ?? 0,
      warning_threshold_max: sensor.warning_threshold_max ?? sensor.max_value ?? 100,
      critical_threshold_min: sensor.critical_threshold_min ?? sensor.min_value ?? 0,
      critical_threshold_max: sensor.critical_threshold_max ?? sensor.max_value ?? 100,
    });
  };

  const handleSaveCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingSensor || !selectedDevice) return;
    showFeedback('loading', 'Menyimpan Kalibrasi...', 'Menerapkan penyesuaian digital dan ambang batas...');
    try {
      await api.updateSensor(calibratingSensor.id, {
        calibration_data: {
          offset: Number(calibrationForm.offset),
          scale: Number(calibrationForm.scale),
          calibrated_at: new Date().toISOString(),
        },
        warning_threshold_min: Number(calibrationForm.warning_threshold_min),
        warning_threshold_max: Number(calibrationForm.warning_threshold_max),
        critical_threshold_min: Number(calibrationForm.critical_threshold_min),
        critical_threshold_max: Number(calibrationForm.critical_threshold_max),
      });
      showFeedback('success', 'Berhasil', `Kalibrasi dan ambang batas sensor ${calibratingSensor.name} berhasil disimpan.`);
      setCalibratingSensor(null);
      handleSelectDevice(selectedDevice);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menyimpan', err.message || 'Gagal memperbarui kalibrasi sensor.');
    }
  };

  // ==========================================
  // HANDLERS: FIRMWARE & OTA MULTI-DEVICE
  // ==========================================

  const handleOpenUploadFirmware = () => {
    const defaultModel = deviceTypes[0]?.name || 'Node Sensor';
    setFirmwareForm({
      version: '',
      name: '',
      target_device_model: defaultModel,
      changelog: '',
      file: null,
    });
    // Pra-pilih semua device yang sesuai target model awal
    const matchingDevs = devices
      .filter((d) => !defaultModel || (d.model_type || '').toLowerCase() === defaultModel.toLowerCase())
      .map((d) => String(d.id));
    setUploadFirmwareTargetDevices(matchingDevs);
    setUploadSearchQuery('');
    setIsUploadFirmwareOpen(true);
  };

  const handleUploadTargetModelChange = (modelName: string) => {
    setFirmwareForm((prev) => ({ ...prev, target_device_model: modelName }));
    const matching = devices
      .filter((d) => (d.model_type || '').toLowerCase() === modelName.toLowerCase())
      .map((d) => String(d.id));
    setUploadFirmwareTargetDevices(matching);
  };

  const handleSubmitFirmware = async (e: React.FormEvent) => {
    e.preventDefault();
    // BUG-8 fix: cegah double-submit — abaikan bila upload sedang berjalan.
    if (isUploadingFirmware) return;
    if (!firmwareForm.file) {
      showFeedback('error', 'File Belum Dipilih', 'Pilih file biner firmware (.bin) terlebih dahulu.');
      return;
    }

    if (uploadFirmwareTargetDevices.length === 0) {
      showFeedback('error', 'Perangkat Belum Dipilih', 'WAJIB centang minimal 1 perangkat tujuan untuk firmware ini.');
      return;
    }

    showFeedback('loading', 'Mengunggah Firmware...', 'Sedang mengunggah biner firmware dan mendaftarkan jadwal update...');
    setIsUploadingFirmware(true);
    try {
      const formData = new FormData();
      formData.append('firmware_file', firmwareForm.file);
      formData.append('version', firmwareForm.version);
      formData.append('name', firmwareForm.name);
      formData.append('target_device_model', firmwareForm.target_device_model);
      formData.append('changelog', firmwareForm.changelog);

      const res = await api.uploadFirmware(formData);
      const newFw = res.data;

      // Jadwalkan OTA multi-device untuk node yang dicentang
      if (newFw?.id && uploadFirmwareTargetDevices.length > 0) {
        try {
          await api.triggerOtaMulti(newFw.id, uploadFirmwareTargetDevices);
        } catch (otaErr: any) {
          // Label sama dengan versi berjalan → tawarkan paksa (anti jebakan label).
          if (otaErr?.data?.code === 'same_version') {
            const occupied = otaErr?.data?.blocked?.map((b: any) => b.kode_node).join(', ') || 'perangkat target';
            if (!window.confirm(`${otaErr.message || 'Perangkat sudah versi ini.'}\n\nPaksa flash ulang ${occupied}?`)) {
              throw otaErr;
            }
            await api.triggerOtaMulti(newFw.id, uploadFirmwareTargetDevices, true);
          } else {
            throw otaErr;
          }
        }
        for (const devId of uploadFirmwareTargetDevices) {
          api.forceOtaCheck(devId).catch(() => {});
        }
      }

      showFeedback('success', 'Berhasil', `Firmware ${firmwareForm.version} berhasil diunggah dan dijadwalkan ke ${uploadFirmwareTargetDevices.length} perangkat.`);
      setIsUploadFirmwareOpen(false);
      setUploadFirmwareTargetDevices([]);
      loadData();
    } catch (err: any) {
      // Modal tetap terbuka agar user bisa coba lagi (§10).
      showFeedback('error', 'Gagal Mengunggah', err.message || 'Gagal mengunggah firmware.');
    } finally {
      setIsUploadingFirmware(false);
    }
  };

  const handleOpenUpgradeFromRepo = (fw: FirmwareItem) => {
    setTargetFirmwareForUpgrade(fw);
    // Otomatis pilih perangkat yang tipe jenisnya cocok
    const targetModel = (fw.target_device_model || '').toLowerCase();
    const matchingDevIds = devices
      .filter((d) => {
        if (!targetModel || targetModel === 'esp32' || targetModel === 'all') return true;
        return (d.model_type || '').toLowerCase() === targetModel;
      })
      .map((d) => String(d.id));

    setUpgradeSelectedDeviceIds(matchingDevIds.length > 0 ? matchingDevIds : devices.map((d) => String(d.id)));
    setUpgradeSearchQuery('');
    setIsUpgradeModalOpen(true);
  };

  const handleExecuteUpgradeMulti = async (instant: boolean, force = false) => {
    if (!targetFirmwareForUpgrade) return;
    if (upgradeSelectedDeviceIds.length === 0) {
      showFeedback('error', 'Perangkat Belum Dipilih', 'WAJIB centang minimal 1 perangkat tujuan untuk melakukan upgrade.');
      return;
    }

    showFeedback('loading', 'Mengirim Instruksi OTA...', `Sedang menyiapkan orkestrasi firmware ke ${upgradeSelectedDeviceIds.length} perangkat...`);
    try {
      setIsUpgradingFromRepo(true);
      const res = await api.triggerOtaMulti(targetFirmwareForUpgrade.id, upgradeSelectedDeviceIds, force);

      if (instant) {
        for (const devId of upgradeSelectedDeviceIds) {
          api.forceOtaCheck(devId).catch(() => {});
        }
        showFeedback('success', 'Berhasil', `⚡ Upgrade firmware v${targetFirmwareForUpgrade.version} langsung dikirim ke ${upgradeSelectedDeviceIds.length} perangkat! ESP32 akan download dalam ≤10 detik.`);
      } else {
        showFeedback('success', 'Berhasil', `🕐 Upgrade firmware v${targetFirmwareForUpgrade.version} dijadwalkan ke ${upgradeSelectedDeviceIds.length} perangkat.`);
      }

      if (res.blocked && res.blocked.length > 0) {
        showFeedback('success', 'Sebagian Dilewati', `${res.blocked.length} perangkat sudah versi ini: ${res.blocked.map((b) => b.kode_node).join(', ')}.`);
      }

      setIsUpgradeModalOpen(false);
      setTargetFirmwareForUpgrade(null);
      setUpgradeSelectedDeviceIds([]);
      loadData();
    } catch (err: any) {
      // Blokir label-sama: tawarkan paksa flash ulang (kasus curiga flash corrupt).
      if (err?.data?.code === 'same_version' && !force) {
        const occupied = err?.data?.blocked?.map((b: any) => b.kode_node).join(', ') || 'perangkat target';
        if (window.confirm(`${err.message || 'Perangkat sudah versi ini.'}\n\nPaksa flash ulang ${occupied}?`)) {
          setIsUpgradingFromRepo(false);
          await handleExecuteUpgradeMulti(instant, true);
          return;
        }
      }
      showFeedback('error', 'Gagal Memulai Upgrade', err.message || 'Gagal memulai upgrade firmware.');
    } finally {
      setIsUpgradingFromRepo(false);
    }
  };

  const handleOpenEditFirmware = (fw: FirmwareItem) => {
    setEditingFirmware(fw);
    setEditFirmwareForm({
      name: fw.name,
      version: fw.version,
      target_device_model: fw.target_device_model || '',
      changelog: fw.changelog || '',
    });
    setIsEditFirmwareOpen(true);
  };

  const handleSaveEditFirmware = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFirmware) return;

    showFeedback('loading', 'Menyimpan Firmware...', 'Sedang memperbarui metadata firmware...');
    try {
      await api.updateFirmware(editingFirmware.id, editFirmwareForm);
      showFeedback('success', 'Berhasil', 'Informasi metadata firmware berhasil diperbarui.');
      setIsEditFirmwareOpen(false);
      setEditingFirmware(null);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Memperbarui', err.message || 'Gagal memperbarui informasi firmware.');
    }
  };

  const handleDeleteFirmware = async (fw: FirmwareItem) => {
    if (!confirm(`Hapus firmware ${fw.version}? File biner akan dibersihkan dari penyimpanan.`)) return;

    showFeedback('loading', 'Menghapus Firmware...', 'Sedang memproses...');
    try {
      await api.deleteFirmware(fw.id);
      showFeedback('success', 'Berhasil', `Firmware ${fw.version} berhasil dihapus.`);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Gagal Menghapus', err.message || 'Gagal menghapus firmware.');
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '-';
    try {
      const dt = new Date(isoString);
      return dt.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Global Feedback Modal (Router Style Dialog) */}
      <ActionFeedbackModal
        isOpen={feedback.isOpen}
        status={feedback.status}
        title={feedback.title}
        message={feedback.message}
        onClose={closeFeedback}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white border-l-4 border-blue-600 pl-3">
            Manajemen Perangkat & Sensor IoT
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 pl-3">
            Konfigurasi dinamis Perangkat ESP32, Jenis Perangkat, Sektor Lokasi, dan Firmware OTA
          </p>
        </div>

        {/* Action Buttons & Sync (Hanya tombol Sinkronisasi) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
            title="Muat ulang seluruh data dari server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{lastSyncTime ? `Sinkron: ${lastSyncTime}` : 'Sinkronisasi'}</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation (4 Tabs sesuai Alur Wajib) */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar">
        <button
          onClick={() => {
            setActiveTab('devices');
            setSelectedDevice(null);
          }}
          className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'devices'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Perangkat ESP32 ({devices.length})
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('device-types');
            setSelectedDevice(null);
          }}
          className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'device-types'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <Tag className="w-4 h-4" /> Jenis Perangkat ({deviceTypes.length})
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('locations');
            setSelectedDevice(null);
          }}
          className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'locations'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Lokasi Sektor ({locations.length})
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('firmware');
            setSelectedDevice(null);
          }}
          className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'firmware'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span className="flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4" /> Firmware Repository & OTA ({firmwares.length})
          </span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: DAFTAR PERANGKAT ESP32                            */}
      {/* ======================================================== */}
      {activeTab === 'devices' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Banner Card with + Tambah Perangkat Button */}
          <div className="p-5 rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Perangkat ESP32 & Node Monitoring
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Kelola unit ESP32, sensor aktif terpasang, sektor penempatan, dan status konektivitas transmisi data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenAddDeviceForType()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-all shrink-0"
            >
              <Plus className="w-4 h-4" /> + Tambah Perangkat
            </button>
          </div>

          {/* Perangkat Baru Ditemukan — antrean pending dari hello (§5.5) */}
          {pendingDevices.length > 0 && (
            <div className="p-5 rounded-3xl border border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20 shadow-xs">
              <div className="flex items-center gap-2 mb-1">
                <Radio className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  🔵 Perangkat Baru Ditemukan ({pendingDevices.length})
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Perangkat ini mengumumkan diri via <span className="font-mono">hello</span> tapi belum diregistrasi. Klik <strong>Daftarkan</strong> untuk mengaktifkan, atau <strong>Abaikan</strong> untuk menonaktifkan.
              </p>
              <div className="space-y-2">
                {pendingDevices.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 dark:text-white font-mono">
                        {dev.kode_node}
                        <span className="ml-2 text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                          {dev.device_role === 'gateway' ? 'Gateway' : 'Node Sensor'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {dev.device_name} · Firmware {dev.firmware_version || '1.0.0'}
                        {dev.ip_address ? ` · IP ${dev.ip_address}` : ''}
                        {dev.connection === 'ONLINE' ? ' · ● Online' : dev.connection === 'STALE' ? ' · ◐ Stale' : ' · ○ Offline'}
                        {typeof dev.seconds_ago === 'number' ? ` · terlihat ${dev.seconds_ago < 60 ? `${dev.seconds_ago} dtk` : `${Math.round(dev.seconds_ago / 60)} mnt`} lalu` : ''}
                      </div>
                      {Array.isArray(dev.capabilities) && dev.capabilities.length > 0 && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                          capability: {dev.capabilities.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenRegister(dev)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-all"
                      >
                        Daftarkan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleIgnoreDevice(dev)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer transition-all"
                      >
                        Abaikan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* List Table of Devices */}
            <div className={`${selectedDevice ? 'lg:col-span-1' : 'lg:col-span-3'} rounded-3xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden`}>
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Daftar Node Perangkat
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Lokasi berasal dari penempatan Sektor di Tab Lokasi. Jenis dapat disetel bebas.
                  </p>
                </div>
                <button
                  onClick={loadData}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Kotak tinggi tetap yang scroll di dalamnya (fixed-height scroll) */}
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3">Device & Jenis</th>
                      <th className="px-4 py-3">Lokasi (Sektor)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Firmware</th>
                      <th className="px-4 py-3">Sensor</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {devices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                          Belum ada perangkat terdaftar. Klik "+ Tambah Perangkat (ESP32)".
                        </td>
                      </tr>
                    ) : (
                      devices.map((dev) => (
                        <tr
                          key={dev.id}
                          onClick={() => handleSelectDevice(dev)}
                          className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors cursor-pointer ${
                            selectedDevice?.id === dev.id ? 'bg-blue-50/60 dark:bg-blue-950/40' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              <Cpu className="w-3.5 h-3.5 text-blue-500" />
                              {dev.kode_node}
                            </div>
                            <span className="text-[11px] text-gray-400 block">{dev.device_name}</span>
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                                {dev.model_type || '-'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                            {dev.nama_lokasi && dev.nama_lokasi !== '' && dev.nama_lokasi !== '-' ? (
                              <span className="inline-flex items-center gap-1 text-gray-800 dark:text-gray-200">
                                <Building2 className="w-3 h-3 text-gray-400" />
                                {dev.nama_lokasi}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">- (Belum Ditempatkan)</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {dev.status !== 'active' && (
                                <span
                                  className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    dev.status === 'pending'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50'
                                      : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                                  }`}
                                >
                                  {dev.status === 'pending' ? 'Menunggu' : 'Nonaktif'}
                                </span>
                              )}
                              <span
                                className={`text-[11px] font-bold ${
                                  (dev.connection || (dev.is_online ? 'ONLINE' : 'OFFLINE')) === 'ONLINE'
                                    ? 'text-green-600 dark:text-green-400'
                                    : (dev.connection || '') === 'STALE'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-gray-400 dark:text-gray-500'
                                }`}
                              >
                                {(dev.connection || (dev.is_online ? 'ONLINE' : 'OFFLINE')) === 'ONLINE'
                                  ? '● Online'
                                  : (dev.connection || '') === 'STALE'
                                    ? '◐ Stale'
                                    : '○ Offline'}
                              </span>
                              {typeof dev.seconds_ago === 'number' && (
                                <span className="text-[10px] text-gray-400">
                                  terlihat {dev.seconds_ago < 60 ? `${dev.seconds_ago} dtk` : `${Math.round(dev.seconds_ago / 60)} mnt`} lalu
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                            {dev.firmware_version || 'v1.0.0'}
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">
                            {dev.sensor_count || 0} Sensor
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectDevice(dev);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 transition-colors cursor-pointer"
                              >
                                Detail →
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDevice(dev.id, dev.kode_node);
                                }}
                                className="p-1 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                title="Hapus Perangkat"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Device Detail Panel */}
            {selectedDevice && (
              <div className="lg:col-span-2 space-y-6 animate-in fade-in duration-200">
                {/* Device Overview Card */}
                <div className="p-6 rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedDevice(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer shrink-0"
                        title="Tutup panel detail dan kembali ke daftar perangkat"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Kembali</span>
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {selectedDevice.device_name || selectedDevice.kode_node}
                          </h3>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {selectedDevice.kode_node}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            selectedDevice.is_online
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {selectedDevice.is_online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Sektor: <strong>{selectedDevice.nama_lokasi || '-'}</strong> • Firmware: <strong className="font-mono">{selectedDevice.firmware_version}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Dropdown Ganti Jenis Perangkat */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 font-semibold whitespace-nowrap">Jenis Perangkat:</span>
                      <select
                        value={selectedDevice.model_type || ''}
                        onChange={(e) => handleUpdateDeviceType(selectedDevice.id, e.target.value)}
                        className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-xs font-medium text-gray-800 dark:text-gray-200 cursor-pointer"
                      >
                        <option value="">-- Pilih Jenis --</option>
                        {deviceTypes.map((dt) => (
                          <option key={dt.id} value={dt.name}>{dt.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                {/* Sensor List in this Device */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Sensor Terpasang ({deviceSensors.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAutoDetectSensors}
                        disabled={isAutoDetectingSensors}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        <Radio className={`w-3.5 h-3.5 ${isAutoDetectingSensors ? 'animate-spin' : ''}`} />
                        Deteksi Sensor dari ESP32
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddSensorOpen(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Sensor
                      </button>
                    </div>
                  </div>

                  {deviceSensors.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-xs text-gray-500">
                      Belum ada sensor yang terpasang di perangkat ini. Klik "Deteksi Sensor" atau "Tambah Sensor".
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {deviceSensors.map((s) => (
                        <div
                          key={s.id}
                          className="p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 flex items-center justify-between"
                        >
                          <div>
                            <strong className="text-xs text-gray-900 dark:text-white block font-semibold">{s.name}</strong>
                            <span className="text-[10px] text-gray-400 font-mono">Kode: {s.code} • Pin: {s.pin || 'A0'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenCalibration(s)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer"
                            title="Kalibrasi & Ambang Batas"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: JENIS PERANGKAT (FITUR BARU BEBAS DIKETIK)        */}
      {/* ======================================================== */}
      {activeTab === 'device-types' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-5 rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Katalog Jenis Perangkat
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Ketik nama jenis perangkat secara bebas (tidak ada daftar tetap & tidak dibatasi 2 jenis). Contoh: <em>Node Sensor Air</em>, <em>Gateway LoRa TinyML</em>, <em>Repeater Estafet</em>, dll.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddDeviceTypeOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-all shrink-0"
            >
              <Plus className="w-4 h-4" /> + Tambah Jenis Perangkat
            </button>
          </div>

          {/* Tabel Jenis Perangkat */}
          <div className="rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3.5">Nama Jenis Perangkat</th>
                    <th className="px-5 py-3.5">Keterangan / Fungsi</th>
                    <th className="px-5 py-3.5">Perangkat Terdaftar</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {deviceTypes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-gray-500">
                        Belum ada jenis perangkat yang dibuat. Klik "+ Tambah Jenis Perangkat" untuk mulai menambahkan.
                      </td>
                    </tr>
                  ) : (
                    deviceTypes.map((dt) => {
                      const count = devices.filter((d) => (d.model_type || '').toLowerCase() === dt.name.toLowerCase()).length;
                      return (
                        <tr key={dt.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-gray-900 dark:text-white">
                            <span className="inline-flex items-center gap-2">
                              <Tag className="w-3.5 h-3.5 text-indigo-500" />
                              {dt.name}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                            {dt.description || '-'}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              <Cpu className="w-3 h-3" /> {count} ESP32
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenAddDeviceForType(dt)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 transition cursor-pointer"
                                title={`Tambah perangkat baru dengan jenis ${dt.name}`}
                              >
                                <Plus className="w-3.5 h-3.5" /> + Perangkat
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditDeviceType(dt)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                                title="Edit Jenis Perangkat"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDeviceType(dt)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                                title="Hapus Jenis Perangkat"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: LOKASI & PENUGASAN SEKTOR                         */}
      {/* ======================================================== */}
      {activeTab === 'locations' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-5 rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Sektor Lokasi & Penempatan Perangkat
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Buat Sektor (misal: <em>Sektor 1</em>, <em>Sektor 2</em>, radius ±200m). Tempatkan perangkat ESP32 ke tiap sektor dengan filter Jenis Perangkat.
              </p>
            </div>
            <button
              onClick={() => setIsAddLocationOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-all shrink-0"
            >
              <Plus className="w-4 h-4" /> + Tambah Sektor Baru
            </button>
          </div>

          {/* Tabel Sektor */}
          <div className="rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3.5">Nama Sektor</th>
                    <th className="px-5 py-3.5">Kode</th>
                    <th className="px-5 py-3.5">Keterangan</th>
                    <th className="px-5 py-3.5">Perangkat Terpasang di Sektor</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {locations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                        Belum ada Sektor lokasi terdaftar. Klik "+ Tambah Sektor Baru".
                      </td>
                    </tr>
                  ) : (
                    locations.map((loc) => {
                      const assignedDevices = devices.filter(
                        (d) => String(d.location_id) === String(loc.id) || d.nama_lokasi === loc.name
                      );
                      return (
                        <tr key={loc.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-gray-900 dark:text-white">
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-blue-500" />
                              {loc.name}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-gray-500">{loc.code || '-'}</td>
                          <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{loc.description || '-'}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {assignedDevices.length === 0 ? (
                                <span className="text-gray-400 italic text-[11px]">Belum ada perangkat ditugaskan</span>
                              ) : (
                                assignedDevices.map((d) => (
                                  <span
                                    key={d.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                                  >
                                    <Cpu className="w-2.5 h-2.5 text-blue-500" />
                                    {d.device_name || d.kode_node}
                                    {d.model_type && <span className="text-gray-400 font-normal">({d.model_type})</span>}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenAssignSector(loc)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 transition cursor-pointer"
                              >
                                <Users className="w-3 h-3" /> Tugaskan ESP32
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLocation(loc)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition cursor-pointer"
                                title="Hapus Sektor"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: FIRMWARE REPOSITORY & OTA                          */}
      {/* ======================================================== */}
      {activeTab === 'firmware' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-5 rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Firmware Repository & Multi-Device OTA
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Pembaruan firmware per Jenis Perangkat ke beberapa ESP32 sekaligus. File biner (.bin) tersimpan di server agar dapat digunakan kembali untuk pembaruan perangkat lain atau diunduh langsung.
              </p>
            </div>
            <button
              onClick={handleOpenUploadFirmware}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-all shrink-0"
            >
              <Upload className="w-4 h-4" /> Unggah Firmware .bin
            </button>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3.5">Versi & Nama</th>
                    <th className="px-4 py-3.5">Status OTA / Penyebaran</th>
                    <th className="px-4 py-3.5">Target Model (Jenis)</th>
                    <th className="px-4 py-3.5">Ukuran File Asli</th>
                    <th className="px-4 py-3.5">Changelog</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {firmwares.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        Belum ada file firmware tersimpan. Klik "Unggah Firmware .bin" untuk menambahkan firmware baru.
                      </td>
                    </tr>
                  ) : (
                    firmwares.map((fw) => (
                      <tr key={fw.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">{fw.version}</div>
                          <div className="font-semibold text-gray-900 dark:text-white mt-0.5">{fw.name}</div>
                          {fw.file_path && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <HardDrive className="w-2.5 h-2.5" /> Biner Tersedia di Server
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {fw.latest_ota ? (
                            <div className="space-y-1">
                              {fw.latest_ota.status === 'pending' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                  <Clock className="w-3 h-3" /> Menunggu Eksekusi
                                </span>
                              )}
                              {(fw.latest_ota.status === 'downloading' || fw.latest_ota.status === 'installing') && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Sedang Flashing... ({fw.latest_ota.progress_percent}%)
                                </span>
                              )}
                              {fw.latest_ota.status === 'success' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" /> Selesai (100%)
                                </span>
                              )}
                              {fw.latest_ota.status === 'failed' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
                                  <XCircle className="w-3 h-3" /> Gagal Flashing
                                </span>
                              )}

                              {(fw.latest_ota.status === 'downloading' || fw.latest_ota.status === 'installing') && (
                                <div className="w-full max-w-[220px] h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-blue-600 transition-all"
                                    style={{ width: `${Math.min(100, Math.max(0, fw.latest_ota.progress_percent || 0))}%` }}
                                  />
                                </div>
                              )}

                              <div className="text-[10px] text-gray-400">
                                <div className="font-mono">#{fw.latest_ota.id} → {fw.latest_ota.kode_node || fw.latest_ota.node_name || fw.latest_ota.node_id}</div>
                                {(fw.active_ota_count || 0) > 1 && (
                                  <div className="font-semibold text-indigo-500 dark:text-indigo-300">
                                    +{(fw.active_ota_count || 0) - 1} job lain mengantre
                                  </div>
                                )}
                                {fw.latest_ota.completed_at && <div>Selesai: {formatDateTime(fw.latest_ota.completed_at)}</div>}
                                {fw.latest_ota.scheduled_at && !fw.latest_ota.completed_at && <div>Dijadwalkan: {formatDateTime(fw.latest_ota.scheduled_at)}</div>}
                                {fw.latest_ota.updated_at && !fw.latest_ota.completed_at && (
                                  <div>
                                    Progress terakhir: {formatDateTime(fw.latest_ota.updated_at)}
                                    {Date.now() - new Date(fw.latest_ota.updated_at).getTime() > 3 * 60 * 1000 && (
                                      <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">
                                        (tampak macet — cek Serial/device)
                                      </span>
                                    )}
                                  </div>
                                )}
                                {fw.latest_ota.status === 'failed' && fw.latest_ota.error_message && (
                                  <div className="text-red-500 dark:text-red-400">Alasan: {fw.latest_ota.error_message}</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                              Siap Disebarkan
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                            {fw.target_device_model || 'Semua Jenis'}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 font-mono text-gray-600 dark:text-gray-300 font-medium">
                          {fw.file_size_formatted || `${(fw.file_size / 1024).toFixed(1)} KB`}
                        </td>

                        <td className="px-4 py-3.5 text-gray-500 max-w-xs truncate">{fw.changelog || '-'}</td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenUpgradeFromRepo(fw)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
                              title="Terapkan dan upgrade firmware ini ke multi-perangkat"
                            >
                              <Zap className="w-3.5 h-3.5 text-amber-300" /> Upgrade
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditFirmware(fw)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                              title="Edit metadata firmware"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteFirmware(fw)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition cursor-pointer"
                              title="Hapus firmware"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TAMBAH JENIS PERANGKAT (FITUR BARU)               */}
      {/* ======================================================== */}
      {isAddDeviceTypeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseAddDeviceType}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseAddDeviceType}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
              <Tag className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Tambah Jenis Perangkat Baru
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Ketik nama jenis secara manual tanpa batasan pilihan tetap (contoh: <em>Node Sensor Air</em>, <em>Gateway Estafet</em>, dll).
            </p>

            <form onSubmit={handleSubmitDeviceType} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  Nama Jenis Perangkat *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Node Sensor Air"
                  value={deviceTypeForm.name}
                  onChange={(e) => setDeviceTypeForm({ ...deviceTypeForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  Deskripsi / Keterangan (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan peruntukan modul perangkat ini..."
                  value={deviceTypeForm.description}
                  onChange={(e) => setDeviceTypeForm({ ...deviceTypeForm, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAddDeviceType}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  Simpan Jenis Perangkat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT JENIS PERANGKAT                              */}
      {/* ======================================================== */}
      {isEditDeviceTypeOpen && editingDeviceType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseEditDeviceType}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseEditDeviceType}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
              <Pencil className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Edit Jenis Perangkat
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Ubah nama jenis atau keterangan peruntukan modul ini.
            </p>

            <form onSubmit={handleSaveEditDeviceType} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  Nama Jenis Perangkat *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Node Sensor Air"
                  value={editDeviceTypeForm.name}
                  onChange={(e) => setEditDeviceTypeForm({ ...editDeviceTypeForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  Deskripsi / Keterangan (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan peruntukan modul perangkat ini..."
                  value={editDeviceTypeForm.description}
                  onChange={(e) => setEditDeviceTypeForm({ ...editDeviceTypeForm, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseEditDeviceType}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TAMBAH LOKASI / SEKTOR                            */}
      {/* ======================================================== */}
      {isAddLocationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseAddLocation}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseAddLocation}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400">
              <Building2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Tambah Sektor Lokasi Baru
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Sektor merupakan area penempatan perangkat (misal: <em>Sektor 1</em>, <em>Sektor 2</em>, radius ±200m).
            </p>

            <form onSubmit={handleSubmitLocation} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Nama Sektor *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sektor 1 (Area Tandon Utama)"
                  value={locationForm.name}
                  onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Kode Sektor</label>
                <input
                  type="text"
                  placeholder="Contoh: SEK-01"
                  value={locationForm.code}
                  onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Keterangan / Radius</label>
                <textarea
                  rows={2}
                  placeholder="Radius ±200 m, tandon air bersih gedung barat..."
                  value={locationForm.description}
                  onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAddLocation}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Simpan Sektor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TUGASKAN PERANGKAT ESP32 KE SEKTOR                */}
      {/* ======================================================== */}
      {assignSectorModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseAssignSector}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseAssignSector}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 pr-8">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Tugaskan Perangkat ke {assignSectorModal.name}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Centang perangkat ESP32 yang ditempatkan di sektor ini. Filter per jenis perangkat.
                </p>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="py-3 flex flex-col sm:flex-row items-center gap-2">
              <div className="w-full sm:w-1/2">
                <select
                  value={sectorFilterType}
                  onChange={(e) => setSectorFilterType(e.target.value)}
                  className="w-full text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 dark:text-white font-medium"
                >
                  <option value="all">Semua Jenis Perangkat</option>
                  {deviceTypes.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative w-full sm:w-1/2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari kode / nama..."
                  value={sectorSearch}
                  onChange={(e) => setSectorSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>

            {/* Scrollable Device Checklist */}
            <div className="flex-1 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-2xl p-2 space-y-1 my-2 max-h-[300px]">
              {devices.length === 0 ? (
                <p className="p-4 text-center text-xs text-gray-400">Belum ada perangkat terdaftar.</p>
              ) : (
                devices
                  .filter((d) => {
                    if (sectorFilterType !== 'all' && (d.model_type || '').toLowerCase() !== sectorFilterType.toLowerCase()) {
                      return false;
                    }
                    if (sectorSearch) {
                      const q = sectorSearch.toLowerCase();
                      return (d.kode_node.toLowerCase().includes(q) || d.device_name.toLowerCase().includes(q));
                    }
                    return true;
                  })
                  .map((d) => {
                    const isChecked = sectorSelectedDeviceIds.includes(String(d.id));
                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          const sid = String(d.id);
                          setSectorSelectedDeviceIds((prev) =>
                            isChecked ? prev.filter((x) => x !== sid) : [...prev, sid]
                          );
                        }}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isChecked
                            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100'
                            : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <div>
                            <strong className="block font-bold">{d.device_name || d.kode_node}</strong>
                            <span className="text-[10px] text-gray-400 font-mono">{d.kode_node}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                            {d.model_type || 'Tanpa Jenis'}
                          </span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-500 font-medium">
                {sectorSelectedDeviceIds.length} perangkat dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCloseAssignSector}
                  className="px-4 py-2 rounded-xl text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveSectorAssignment}
                  className="px-4 py-2 rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Simpan Penugasan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TAMBAH PERANGKAT (IDENTITAS SAJA TANPA LOKASI)    */}
      {/* ======================================================== */}
      {isAddDeviceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseAddDevice}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseAddDevice}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-4 pr-8">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Register Perangkat ESP32
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Langkah 1: Isi identitas perangkat. Sektor lokasi bersifat opsional.
                </p>
              </div>
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDeviceAddMode('auto');
                    handleDiscover();
                  }}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    deviceAddMode === 'auto'
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  ⚡ Deteksi Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceAddMode('manual')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    deviceAddMode === 'manual'
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  ✏️ Input Manual
                </button>
              </div>
            </div>

            {/* TAB OTOMATIS */}
            {deviceAddMode === 'auto' && (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-start gap-2.5">
                  <Radio className="w-4 h-4 text-blue-600 mt-0.5 shrink-0 animate-pulse" />
                  <div className="text-blue-900 dark:text-blue-200">
                    <strong className="block font-semibold">Pemindaian Transmisi Sinyal ESP32</strong>
                    Sistem mendeteksi perangkat ESP32 Gateway / Node Sensor yang sedang aktif mentransmisikan sinyal data sensor ke sistem.
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Status Pemindaian:</span>
                  <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={isDiscovering}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                    {isDiscovering ? 'Memindai...' : 'Pindai Ulang'}
                  </button>
                </div>

                {discoveryError && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Perangkat Belum Terdeteksi
                    </div>
                    <p className="text-[11px] leading-relaxed">{discoveryError}</p>
                  </div>
                )}

                {detectedDevices.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Unit ESP32 yang Terdeteksi dari Jalur Transmisi ({detectedDevices.length} Perangkat):
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {detectedDevices.map((d, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (!d.already_registered) {
                              setDeviceForm({
                                kode_node: d.kode_node,
                                device_name: d.device_name,
                                model_type: d.model_type || (deviceTypes[0]?.name || ''),
                                location_id: '',
                              });
                            }
                          }}
                          className={`p-3 rounded-xl border text-left transition ${
                            deviceForm.kode_node === d.kode_node
                              ? 'border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/40'
                              : d.already_registered
                                ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-950/10'
                                : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800 hover:border-blue-300 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">
                              {d.kode_node}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              d.already_registered
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                            }`}>
                              {d.already_registered ? 'Terdaftar' : 'Siap Ditambahkan'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{d.device_name}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{d.role}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {discoveredPreview && (
                  <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                        <strong className="font-bold text-emerald-900 dark:text-emerald-300">
                          {deviceForm.kode_node
                            ? `Formulir: ${deviceForm.kode_node}`
                            : discoveredPreview.already_registered
                              ? '✅ Perangkat Sudah Terdaftar'
                              : 'Perangkat Ditemukan & Mengirim Data!'}
                        </strong>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {deviceForm.kode_node || discoveredPreview.kode_node}
                      </span>
                    </div>

                    {!discoveredPreview.already_registered && (
                      <form onSubmit={handleSubmitDevice} className="space-y-3 pt-2 border-t border-emerald-100 dark:border-emerald-900/30">
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Nama Perangkat *</label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: ESP32 Tandon A"
                            value={deviceForm.device_name}
                            onChange={(e) => setDeviceForm({ ...deviceForm, device_name: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Jenis Perangkat (Opsional)</label>
                          <select
                            value={deviceForm.model_type}
                            onChange={(e) => setDeviceForm({ ...deviceForm, model_type: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          >
                            <option value="">-- Pilih Jenis Perangkat --</option>
                            {deviceTypes.map((t) => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Lokasi Sektor (Opsional)</label>
                          <select
                            value={deviceForm.location_id}
                            onChange={(e) => setDeviceForm({ ...deviceForm, location_id: e.target.value })}
                            className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          >
                            <option value="">-- Belum Ditempatkan (Bisa disetel di Tab Lokasi) --</option>
                            {locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>{loc.name} {loc.code ? `(${loc.code})` : ''}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleCloseAddDevice}
                            className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            {isSubmitting ? 'Menyimpan...' : 'Simpan Identitas Perangkat'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB MANUAL */}
            {deviceAddMode === 'manual' && (
              <form onSubmit={handleSubmitDevice} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                    Kode Node / Device ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: ESP32-WATER-01"
                    value={deviceForm.kode_node}
                    onChange={(e) => setDeviceForm({ ...deviceForm, kode_node: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                    Nama Perangkat *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: ESP32 Monitor Tandon"
                    value={deviceForm.device_name}
                    onChange={(e) => setDeviceForm({ ...deviceForm, device_name: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                    Jenis Perangkat (Opsional)
                  </label>
                  <select
                    value={deviceForm.model_type}
                    onChange={(e) => setDeviceForm({ ...deviceForm, model_type: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Pilih Jenis (Bisa disetel nanti) --</option>
                    {deviceTypes.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                    Lokasi Sektor (Opsional)
                  </label>
                  <select
                    value={deviceForm.location_id}
                    onChange={(e) => setDeviceForm({ ...deviceForm, location_id: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Belum Ditempatkan (Bisa disetel di Tab Lokasi) --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name} {loc.code ? `(${loc.code})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseAddDevice}
                    className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Menyimpan...' : 'Simpan Perangkat'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TAMBAH SENSOR KE DEVICE                           */}
      {/* ======================================================== */}
      {isAddSensorOpen && selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseAddSensor}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseAddSensor}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 pr-8">
              Tambah Sensor ke {selectedDevice.kode_node}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Pilih tipe sensor standar atau isi parameter sensor kustom.
            </p>

            <form onSubmit={handleSubmitSensor} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Tipe Sensor</label>
                <select
                  value={sensorForm.sensor_type_id}
                  onChange={(e) => handleSensorTypeChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">-- Kustom / Lainnya --</option>
                  {sensorTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Nama Sensor *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sensor pH Air Tandon"
                  value={sensorForm.name}
                  onChange={(e) => setSensorForm({ ...sensorForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Kode *</label>
                  <input
                    type="text"
                    required
                    placeholder="ph_meter"
                    value={sensorForm.code}
                    onChange={(e) => setSensorForm({ ...sensorForm, code: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Pin ESP32</label>
                  <input
                    type="text"
                    placeholder="GPIO 36 / A0"
                    value={sensorForm.pin}
                    onChange={(e) => setSensorForm({ ...sensorForm, pin: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAddSensor}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Simpan Sensor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: KALIBRASI SENSOR                                  */}
      {/* ======================================================== */}
      {calibratingSensor && selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseCalibrateSensor}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseCalibrateSensor}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400 pr-8">
              <Settings2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Kalibrasi: {calibratingSensor.name}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Atur offset digital dan batas peringatan sensor pada perangkat {selectedDevice.kode_node}.
            </p>

            <form onSubmit={handleSaveCalibration} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Offset (+/-)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={calibrationForm.offset}
                    onChange={(e) => setCalibrationForm({ ...calibrationForm, offset: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Skala</label>
                  <input
                    type="number"
                    step="0.01"
                    value={calibrationForm.scale}
                    onChange={(e) => setCalibrationForm({ ...calibrationForm, scale: parseFloat(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Warning Min</label>
                  <input
                    type="number"
                    step="any"
                    value={calibrationForm.warning_threshold_min}
                    onChange={(e) => setCalibrationForm({ ...calibrationForm, warning_threshold_min: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Warning Max</label>
                  <input
                    type="number"
                    step="any"
                    value={calibrationForm.warning_threshold_max}
                    onChange={(e) => setCalibrationForm({ ...calibrationForm, warning_threshold_max: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseCalibrateSensor}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Simpan Kalibrasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DAFTARKAN PERANGKAT BARU (§5.5)                   */}
      {/* ======================================================== */}
      {registerTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseRegister}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseRegister}
              disabled={isRegistering}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer disabled:opacity-40"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400 pr-8">
              <Cpu className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Daftarkan {registerTarget.kode_node}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              {registerTarget.device_role === 'gateway' ? 'Gateway' : 'Node Sensor'}
              {' '}· Firmware {registerTarget.firmware_version || '1.0.0'}
              {registerTarget.ip_address ? ` · IP ${registerTarget.ip_address}` : ''}
              {Array.isArray(registerTarget.capabilities) && registerTarget.capabilities.length > 0
                ? ` · capability: ${registerTarget.capabilities.join(', ')}`
                : ''}
            </p>

            <form onSubmit={handleSubmitRegister} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Nama Perangkat *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Tandon Utara"
                  value={registerForm.device_name}
                  onChange={(e) => setRegisterForm({ ...registerForm, device_name: e.target.value })}
                  disabled={isRegistering}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Jenis Perangkat</label>
                  <select
                    value={registerForm.device_type_id}
                    onChange={(e) => setRegisterForm({ ...registerForm, device_type_id: e.target.value })}
                    disabled={isRegistering}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                  >
                    <option value="">— Pilih dari katalog —</option>
                    {deviceTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Lokasi</label>
                  <select
                    value={registerForm.location_id}
                    onChange={(e) => setRegisterForm({ ...registerForm, location_id: e.target.value })}
                    disabled={isRegistering}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50"
                  >
                    <option value="">— Belum ditempatkan —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Mode Sensor</label>
                <div className="flex gap-2">
                  {(['auto', 'manual'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRegisterForm({ ...registerForm, sensor_mode: mode })}
                      disabled={isRegistering}
                      className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                        registerForm.sensor_mode === mode
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {mode === 'auto' ? 'Otomatis (dari capability)' : 'Manual'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Otomatis: sensor direkonsiliasi dari capability yang dilaporkan device. Manual: tambah sendiri nanti.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseRegister}
                  disabled={isRegistering}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {isRegistering ? 'Mendaftarkan...' : 'Daftarkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: UNGGAH FIRMWARE (MULTI-DEVICE TARGET PER JENIS)   */}
      {/* ======================================================== */}
      {isUploadFirmwareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseUploadFirmware}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseUploadFirmware}
              disabled={isUploadingFirmware}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer disabled:opacity-40"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400 pr-8">
              <Upload className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Unggah Firmware .bin (Multi-Device OTA)
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Pilih <strong>Target Model</strong> (Jenis Perangkat), lalu centang minimal 1 perangkat yang akan menerima pembaruan ini.
            </p>

            <form onSubmit={handleSubmitFirmware} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Versi Firmware *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: v1.0.1"
                    value={firmwareForm.version}
                    onChange={(e) => setFirmwareForm({ ...firmwareForm, version: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Target Model (Jenis) *</label>
                  <select
                    value={firmwareForm.target_device_model}
                    onChange={(e) => handleUploadTargetModelChange(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-semibold text-indigo-600"
                    required
                  >
                    {deviceTypes.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Nama Firmware *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Firmware Sensor Tandon v1.0.1"
                  value={firmwareForm.name}
                  onChange={(e) => setFirmwareForm({ ...firmwareForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Checklist Perangkat Target Sesuai Jenis */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-700 dark:text-gray-300 font-semibold">
                    Centang ESP32 Target (Wajib ≥ 1) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const allMatching = devices
                        .filter((d) => (d.model_type || '').toLowerCase() === (firmwareForm.target_device_model || '').toLowerCase())
                        .map((d) => String(d.id));
                      if (uploadFirmwareTargetDevices.length === allMatching.length) {
                        setUploadFirmwareTargetDevices([]);
                      } else {
                        setUploadFirmwareTargetDevices(allMatching);
                      }
                    }}
                    className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    {uploadFirmwareTargetDevices.length > 0 ? 'Pilih Semua / Reset' : 'Pilih Semua'}
                  </button>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-2xl p-2 max-h-[160px] overflow-y-auto space-y-1">
                  {devices
                    .filter((d) => (d.model_type || '').toLowerCase() === (firmwareForm.target_device_model || '').toLowerCase())
                    .map((d) => {
                      const isChecked = uploadFirmwareTargetDevices.includes(String(d.id));
                      return (
                        <div
                          key={d.id}
                          onClick={() => {
                            const sid = String(d.id);
                            setUploadFirmwareTargetDevices((prev) =>
                              isChecked ? prev.filter((x) => x !== sid) : [...prev, sid]
                            );
                          }}
                          className={`p-2 rounded-xl flex items-center justify-between cursor-pointer text-xs transition-colors ${
                            isChecked
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-900'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400 shrink-0" />
                            )}
                            <span className="font-semibold">{d.device_name || d.kode_node}</span>
                            <span className="text-[10px] text-gray-400 font-mono">({d.kode_node})</span>
                          </div>
                          <span className="text-[10px] text-gray-400">{d.nama_lokasi || '-'}</span>
                        </div>
                      );
                    })}
                </div>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Terpilih: <strong>{uploadFirmwareTargetDevices.length}</strong> perangkat
                </span>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">File Binary (.bin) *</label>
                <input
                  type="file"
                  accept=".bin"
                  required
                  disabled={isUploadingFirmware}
                  onChange={(e) => setFirmwareForm({ ...firmwareForm, file: e.target.files?.[0] || null })}
                  className="w-full rounded-xl border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 cursor-pointer disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Catatan Perubahan (Changelog)</label>
                <textarea
                  rows={2}
                  placeholder="Perbaikan filter kalibrasi, penambahan telemetry..."
                  value={firmwareForm.changelog}
                  onChange={(e) => setFirmwareForm({ ...firmwareForm, changelog: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseUploadFirmware}
                  disabled={isUploadingFirmware}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploadingFirmware || uploadFirmwareTargetDevices.length === 0}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {isUploadingFirmware ? 'Mengunggah...' : 'Unggah & Tugaskan OTA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: UPGRADE FIRMWARE REPO (MULTI-DEVICE SELECTION)    */}
      {/* ======================================================== */}
      {isUpgradeModalOpen && targetFirmwareForUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseUpgradeModal}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseUpgradeModal}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2 pr-8">
              <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Upgrade Firmware v{targetFirmwareForUpgrade.version}
              </h3>
            </div>

            <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-1 mb-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Nama:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{targetFirmwareForUpgrade.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Target Model:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{targetFirmwareForUpgrade.target_device_model || 'Semua Model'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ukuran Biner:</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{targetFirmwareForUpgrade.file_size_formatted || `${(targetFirmwareForUpgrade.file_size / 1024).toFixed(1)} KB`}</span>
              </div>
            </div>

            {/* Checklist Multi-Device Selection */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-700 dark:text-gray-300 font-semibold text-xs">
                  Centang Perangkat Tujuan (WAJIB ≥ 1):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (upgradeSelectedDeviceIds.length === devices.length) {
                      setUpgradeSelectedDeviceIds([]);
                    } else {
                      setUpgradeSelectedDeviceIds(devices.map((d) => String(d.id)));
                    }
                  }}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                >
                  {upgradeSelectedDeviceIds.length > 0 ? 'Pilih Semua / Reset' : 'Pilih Semua'}
                </button>
              </div>

              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari kode atau nama perangkat..."
                  value={upgradeSearchQuery}
                  onChange={(e) => setUpgradeSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="border border-gray-200 dark:border-gray-800 rounded-2xl p-2 max-h-[180px] overflow-y-auto space-y-1">
                {devices
                  .filter((d) => {
                    if (upgradeSearchQuery) {
                      const q = upgradeSearchQuery.toLowerCase();
                      return d.kode_node.toLowerCase().includes(q) || d.device_name.toLowerCase().includes(q);
                    }
                    return true;
                  })
                  .map((d) => {
                    const isChecked = upgradeSelectedDeviceIds.includes(String(d.id));
                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          const sid = String(d.id);
                          setUpgradeSelectedDeviceIds((prev) =>
                            isChecked ? prev.filter((x) => x !== sid) : [...prev, sid]
                          );
                        }}
                        className={`p-2 rounded-xl flex items-center justify-between cursor-pointer text-xs transition-colors ${
                          isChecked
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-900'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <span className="font-semibold">{d.device_name || d.kode_node}</span>
                          <span className="text-[10px] text-gray-400 font-mono">({d.kode_node})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{d.nama_lokasi || '-'}</span>
                          <span className={`text-[10px] font-bold ${d.is_online ? 'text-emerald-500' : 'text-gray-400'}`}>
                            {d.is_online ? '● Online' : '○ Offline'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <span className="text-[11px] text-gray-500 mt-1 block">
                Terpilih: <strong>{upgradeSelectedDeviceIds.length}</strong> perangkat
              </span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => handleExecuteUpgradeMulti(true)}
                disabled={isUpgradingFromRepo || upgradeSelectedDeviceIds.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-50 cursor-pointer transition-all"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                ⚡ Upgrade Sekarang (Instan ≤10 Detik)
              </button>

              <button
                type="button"
                onClick={() => handleExecuteUpgradeMulti(false)}
                disabled={isUpgradingFromRepo || upgradeSelectedDeviceIds.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 disabled:opacity-50 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                🕐 Jadwalkan Saja (Otomatis Tiap 15 Menit)
              </button>

              <button
                type="button"
                onClick={handleCloseUpgradeModal}
                className="w-full py-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer text-center"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT FIRMWARE METADATA                            */}
      {/* ======================================================== */}
      {isEditFirmwareOpen && editingFirmware && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCloseEditFirmware}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 border border-gray-200 dark:border-gray-800 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseEditFirmware}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 pr-8">
              Edit Metadata Firmware
            </h3>
            <form onSubmit={handleSaveEditFirmware} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Versi Firmware *</label>
                <input
                  type="text"
                  required
                  value={editFirmwareForm.version}
                  onChange={(e) => setEditFirmwareForm({ ...editFirmwareForm, version: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Nama Firmware *</label>
                <input
                  type="text"
                  required
                  value={editFirmwareForm.name}
                  onChange={(e) => setEditFirmwareForm({ ...editFirmwareForm, name: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Target Model</label>
                <select
                  value={editFirmwareForm.target_device_model}
                  onChange={(e) => setEditFirmwareForm({ ...editFirmwareForm, target_device_model: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">-- Semua Model --</option>
                  {deviceTypes.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Changelog</label>
                <textarea
                  rows={2}
                  value={editFirmwareForm.changelog}
                  onChange={(e) => setEditFirmwareForm({ ...editFirmwareForm, changelog: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseEditFirmware}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-md shadow-blue-600/20"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
