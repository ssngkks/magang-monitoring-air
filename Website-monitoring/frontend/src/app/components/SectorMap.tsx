import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface SectorMapLocation {
  id: string | number;
  name: string;
  code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius_m?: number | null;
  deviceNames: string[];
}

interface SectorMapProps {
  locations: SectorMapLocation[];
  heightClass?: string;
  /** Mode pilih titik: klik map memindahkan marker & mengisi koordinat. */
  picker?: boolean;
  pickLat?: number | null;
  pickLng?: number | null;
  pickRadius?: number;
  onPick?: (lat: number, lng: number) => void;
}

const DEFAULT_CENTER: [number, number] = [-2.5, 118];
const DEFAULT_ZOOM = 5;

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dotIcon(): L.DivIcon {
  return L.divIcon({
    className: 'sector-dot-wrap',
    html: '<span class="sector-dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function SectorMap({
  locations,
  heightClass = 'h-72 sm:h-80',
  picker = false,
  pickLat = null,
  pickLng = null,
  pickRadius = 200,
  onPick,
}: SectorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Inisialisasi map sekali
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true,
    });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7)));
    });

    // Map di dalam modal butuh refresh ukuran setelah animasi buka
    const t = window.setTimeout(() => map.invalidateSize(), 300);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Gambar ulang marker / lingkaran saat data berubah
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (picker) {
      if (pickLat !== null && pickLng !== null && !isNaN(pickLat) && !isNaN(pickLng)) {
        const center: [number, number] = [pickLat, pickLng];
        L.circle(center, {
          radius: Math.max(Number(pickRadius) || 200, 1),
          color: '#2563eb',
          weight: 1.5,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
        }).addTo(layer);
        L.marker(center, { icon: dotIcon() }).addTo(layer);
        map.setView(center, Math.max(map.getZoom(), 13));
      }
      return;
    }

    const withCoords = locations.filter(
      (l) => l.latitude !== null && l.latitude !== undefined && l.longitude !== null && l.longitude !== undefined
    );

    withCoords.forEach((loc) => {
      const center: [number, number] = [Number(loc.latitude), Number(loc.longitude)];
      const radius = Math.max(Number(loc.radius_m) || 200, 1);

      L.circle(center, {
        radius,
        color: '#2563eb',
        weight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
      }).addTo(layer);

      const devices = loc.deviceNames.slice(0, 5).map((n) => `<li>${escapeHtml(n)}</li>`).join('');
      const more = loc.deviceNames.length > 5 ? `<li>… +${loc.deviceNames.length - 5} lainnya</li>` : '';
      const deviceBlock = loc.deviceNames.length > 0
        ? `<ul style="margin:4px 0 0;padding-left:16px;">${devices}${more}</ul>`
        : '<div style="color:#9ca3af;font-style:italic;">Belum ada perangkat ditugaskan</div>';

      L.marker(center, { icon: dotIcon() })
        .addTo(layer)
        .bindPopup(
          `<div style="font-size:12px;min-width:160px;">` +
            `<strong>${escapeHtml(loc.name)}</strong><br/>` +
            `<span style="color:#6b7280;">${escapeHtml(loc.code || '-')} • radius ${escapeHtml(radius)} m</span>` +
            `<div style="margin-top:4px;color:#374151;font-weight:600;">Perangkat terpasang:</div>${deviceBlock}` +
            `</div>`
        );
    });

    // Auto-frame ke semua marker saat pertama kali ada datanya
    if (withCoords.length > 0 && !fittedRef.current) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(withCoords.map((l) => [Number(l.latitude), Number(l.longitude)] as [number, number]));
      map.fitBounds(bounds.pad(0.25));
    }
    if (withCoords.length === 0) {
      fittedRef.current = false;
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [locations, picker, pickLat, pickLng, pickRadius]);

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 z-0`}>
      <style>{`.sector-dot-wrap{background:transparent;border:none}.sector-dot{display:block;width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}.leaflet-container{font-family:inherit}`}</style>
      <div ref={containerRef} className="h-full w-full" />
      {picker && (
        <div className="absolute left-2 top-2 z-[500] rounded-lg bg-white/90 dark:bg-gray-900/90 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 shadow pointer-events-none">
          Klik map untuk menentukan lokasi sektor
        </div>
      )}
    </div>
  );
}
