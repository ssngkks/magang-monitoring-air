import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Node } from './api';

export type NodeStatus = 'Normal' | 'Warning' | 'Bahaya' | 'Offline';

export interface LastReading {
  ph?: number | string | null;
  temp?: number | string | null;
  humidity?: number | string | null;
  turbidity?: number | string | null;
  water_level?: number | string | null;
  vibration?: boolean | number | string | null;
  mpu_x?: number | string | null;
  mpu_y?: number | string | null;
  mpu_z?: number | string | null;
  roll?: number | string | null;
  pitch?: number | string | null;
  yaw?: number | string | null;
  stability_status?: string | null;
  ai_status?: string | null;
  ai_confidence?: number | string | null;
  ai_diagnosis?: string | null;
  created_at?: string | null;
}

// Kapasitas maksimum tandon — sama dengan WaterPhysicalDetail & seeder.
export const TANK_CAPACITY_CM = 100;

const SELECTED_NODE_STORAGE_KEY = 'selected_node_id';

function toNumber(v: unknown, fallback = NaN): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

/** Ambil last_reading dari node apa pun bentuknya (Node dari /nodes atau DeviceItem). */
export function getLastReading(node: any): LastReading {
  return (node?.last_reading ?? {}) as LastReading;
}

/** Node dianggap online bila flag is_online true atau connection ONLINE/STALE. */
export function isNodeOnline(node: any): boolean {
  const conn = node?.connection as string | undefined;
  if (conn === 'ONLINE' || conn === 'STALE') return true;
  if (conn === 'OFFLINE') return false;
  return Boolean(node?.is_online);
}

export function getNodeId(node: any): string {
  return String(node?.id ?? node?.kode_node ?? '');
}

export function getNodeCode(node: any): string {
  return node?.kode_node ?? String(node?.id ?? '-');
}

export function getNodeName(node: any): string {
  return node?.device_name ?? node?.deviceName ?? `Unit ${getNodeCode(node)}`;
}

export function getNodeLocation(node: any): string {
  const loc = node?.nama_lokasi ?? node?.location;
  return loc && loc !== '' && loc !== '-' ? loc : '- (Belum Ditempatkan)';
}

export function getNodeTimestamp(node: any): string | null {
  const lr = getLastReading(node);
  return node?.last_seen_at || lr.created_at || node?.updated_at || null;
}

/** Kualitas Air: pH 6.5–8.5 (di luar = Bahaya), turbidity ≤5 Normal / ≤25 Warning / >25 Bahaya. */
export function getWaterQualityStatus(lr: LastReading): Exclude<NodeStatus, 'Offline'> {
  const ph = toNumber(lr.ph);
  const turb = toNumber(lr.turbidity);
  const phBad = !isNaN(ph) && (ph < 6.5 || ph > 8.5);
  const turbDanger = !isNaN(turb) && turb > 25;
  if (phBad || turbDanger) return 'Bahaya';
  if (!isNaN(turb) && turb > 5) return 'Warning';
  return 'Normal';
}

/** Lingkungan: suhu ≤30 Normal / ≤35 Warning / >35 Bahaya; humidity 40–70 Normal / 70–85 Warning / lainnya Bahaya. */
export function getEnvironmentStatus(lr: LastReading): Exclude<NodeStatus, 'Offline'> {
  const t = toNumber(lr.temp);
  const h = toNumber(lr.humidity);
  const tempStatus = isNaN(t) ? 'Normal' : t <= 30 ? 'Normal' : t <= 35 ? 'Warning' : 'Bahaya';
  const humStatus = isNaN(h)
    ? 'Normal'
    : h >= 40 && h <= 70
      ? 'Normal'
      : h > 70 && h <= 85
        ? 'Warning'
        : 'Bahaya';
  if (tempStatus === 'Bahaya' || humStatus === 'Bahaya') return 'Bahaya';
  if (tempStatus === 'Warning' || humStatus === 'Warning') return 'Warning';
  return 'Normal';
}

export interface TankWaterStatus {
  text: 'Normal' | 'Warning' | 'Bahaya';
  textClass: string;
  fill: string;
  surface: string;
}

// Threshold existing project — JANGAN diubah:
// kritis < 10 cm / > 92 cm, peringatan < 20 cm / > 85 cm.
export function getTankWaterStatus(level: number): TankWaterStatus {
  if (isNaN(level)) {
    return { text: 'Normal', textClass: 'text-gray-400', fill: '#9ca3af', surface: '#d1d5db' };
  }
  if (level < 10 || level > 92) {
    return { text: 'Bahaya', textClass: 'text-red-600 dark:text-red-400', fill: '#ef4444', surface: '#f87171' };
  }
  if (level < 20 || level > 85) {
    return { text: 'Warning', textClass: 'text-yellow-500 dark:text-yellow-400', fill: '#f59e0b', surface: '#fbbf24' };
  }
  return { text: 'Normal', textClass: 'text-green-600 dark:text-green-400', fill: '#3b82f6', surface: '#60a5fa' };
}

export function getStabilityStatus(lr: LastReading): Exclude<NodeStatus, 'Offline'> {
  const s = lr.stability_status ?? 'Stabil';
  if (s === 'Stabil') return 'Normal';
  if (s === 'Pergerakan ringan') return 'Warning';
  return 'Bahaya';
}

/** Fisik: terburuk dari status tandon, getaran (true = Warning), dan stabilitas. */
export function getPhysicalStatus(lr: LastReading): Exclude<NodeStatus, 'Offline'> {
  const level = toNumber(lr.water_level);
  const tank = getTankWaterStatus(level).text;
  const vib = lr.vibration === true || lr.vibration === 1 || lr.vibration === '1';
  const stab = getStabilityStatus(lr);
  if (tank === 'Bahaya' || stab === 'Bahaya') return 'Bahaya';
  if (tank === 'Warning' || stab === 'Warning' || vib) return 'Warning';
  return 'Normal';
}

/** Status koneksi + AI/threshold: offline bila tidak online, selebihnya terburuk dari AI & 3 kategori. */
export function getNodeOverallStatus(node: any): NodeStatus {
  if (!isNodeOnline(node)) return 'Offline';
  const lr = getLastReading(node);
  const ai = (lr.ai_status ?? 'Normal') as string;
  const aiBad = ai === 'Bahaya' || ai === 'Anomali' || ai === 'Warning';
  const aiDanger = ai === 'Bahaya';
  const wq = getWaterQualityStatus(lr);
  const env = getEnvironmentStatus(lr);
  const phy = getPhysicalStatus(lr);
  if (aiDanger || wq === 'Bahaya' || env === 'Bahaya' || phy === 'Bahaya') return 'Bahaya';
  if (aiBad || wq === 'Warning' || env === 'Warning' || phy === 'Warning') return 'Warning';
  return 'Normal';
}

export interface NodesSummary {
  total: number;
  online: number;
  offline: number;
  warning: number;
  waterQuality: Record<'Normal' | 'Warning' | 'Bahaya' | 'Offline', number>;
  environment: Record<'Normal' | 'Warning' | 'Bahaya' | 'Offline', number>;
  physical: Record<'Normal' | 'Warning' | 'Bahaya' | 'Offline', number>;
  tank: Record<'Normal' | 'Warning' | 'Bahaya' | 'Offline', number>;
}

function emptyCounts(): Record<'Normal' | 'Warning' | 'Bahaya' | 'Offline', number> {
  return { Normal: 0, Warning: 0, Bahaya: 0, Offline: 0 };
}

/** Agregasi seluruh node untuk System Overview + 4 summary cards. */
export function summarizeNodes(nodes: any[]): NodesSummary {
  const summary: NodesSummary = {
    total: nodes.length,
    online: 0,
    offline: 0,
    warning: 0,
    waterQuality: emptyCounts(),
    environment: emptyCounts(),
    physical: emptyCounts(),
    tank: emptyCounts(),
  };
  for (const n of nodes) {
    const online = isNodeOnline(n);
    if (online) summary.online += 1;
    else summary.offline += 1;
    const overall = getNodeOverallStatus(n);
    if (overall === 'Warning' || overall === 'Bahaya') summary.warning += 1;
    const lr = getLastReading(n);
    if (!online) {
      summary.waterQuality.Offline += 1;
      summary.environment.Offline += 1;
      summary.physical.Offline += 1;
      summary.tank.Offline += 1;
    } else {
      summary.waterQuality[getWaterQualityStatus(lr)] += 1;
      summary.environment[getEnvironmentStatus(lr)] += 1;
      summary.physical[getPhysicalStatus(lr)] += 1;
      summary.tank[getTankWaterStatus(toNumber(lr.water_level)).text] += 1;
    }
  }
  return summary;
}

/** Pilih node default: aktif duluan, fallback baris pertama (hanya untuk default). */
export function getDefaultNode(nodes: any[]): any | null {
  if (!nodes.length) return null;
  return nodes.find((n) => (n.status ?? 'active') === 'active') ?? nodes[0];
}

/** Resolve selected node: URL ?node= > localStorage > default aktif > pertama. */
export function resolveSelectedNode(nodes: any[], urlParam: string | null, stored: string | null): any | null {
  if (!nodes.length) return null;
  const byIdOrCode = (key: string | null) => {
    if (!key) return null;
    return nodes.find((n) => String(n.id) === key || n.kode_node === key) ?? null;
  };
  return byIdOrCode(urlParam) ?? byIdOrCode(stored) ?? getDefaultNode(nodes);
}

export function readStoredNodeId(): string | null {
  try {
    return localStorage.getItem(SELECTED_NODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredNodeId(id: string): void {
  try {
    localStorage.setItem(SELECTED_NODE_STORAGE_KEY, id);
  } catch {
    /* abaikan */
  }
}

/**
 * Hook seleksi node multi-halaman: sinkron URL ?node= + localStorage.
 * Mengembalikan daftar node, node terpilih, dan setter.
 */
export function useSelectedNode<T extends { id: string | number; kode_node?: string }>(nodes: T[]): {
  selectedNode: T | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const [storedId, setStoredId] = useState<string | null>(() => readStoredNodeId());

  const urlParam = searchParams.get('node');
  const selectedNode = (resolveSelectedNode(nodes, urlParam, storedId) as T | null) ?? null;
  const selectedNodeId = selectedNode ? String(selectedNode.id) : null;

  const setSelectedNodeId = useCallback(
    (id: string) => {
      writeStoredNodeId(id);
      setStoredId(id);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('node', id);
        return next;
      });
    },
    [setSearchParams],
  );

  // Saat daftar node tiba dan belum ada pilihan tersimpan/URL, kunci default agar URL bisa dibagikan.
  useEffect(() => {
    if (nodes.length > 0 && !urlParam && !storedId && selectedNode) {
      writeStoredNodeId(String(selectedNode.id));
      setStoredId(String(selectedNode.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  return { selectedNode, selectedNodeId, setSelectedNodeId };
}

export function statusTextClass(status: NodeStatus): string {
  switch (status) {
    case 'Normal':
      return 'text-green-600 dark:text-green-400';
    case 'Warning':
      return 'text-yellow-500 dark:text-yellow-400';
    case 'Bahaya':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-400 dark:text-gray-500';
  }
}

export type { Node };
