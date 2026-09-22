import React from 'react';
import { X, Compass, Activity, ShieldCheck, AlertTriangle, Disc, RotateCcw, Zap } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface GyroscopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accX?: number | null;
  accY?: number | null;
  accZ?: number | null;
  roll?: number | null;
  pitch?: number | null;
  yaw?: number | null;
  stabilityStatus?: string;
  historyData?: Array<{
    time: string;
    x: number;
    y: number;
    z: number;
    roll?: number;
    pitch?: number;
  }>;
}

export const GyroscopeModal: React.FC<GyroscopeModalProps> = ({
  isOpen,
  onClose,
  accX = 0.02,
  accY = -0.01,
  accZ = 0.99,
  roll = 1.2,
  pitch = -0.8,
  yaw = 0.0,
  stabilityStatus = 'Stabil',
  historyData = [],
}) => {
  if (!isOpen) return null;

  const currentX = +(accX ?? 0).toFixed(3);
  const currentY = +(accY ?? 0).toFixed(3);
  const currentZ = +(accZ ?? 1).toFixed(3);
  const currentRoll = +(roll ?? 0).toFixed(1);
  const currentPitch = +(pitch ?? 0).toFixed(1);
  const currentYaw = +(yaw ?? 0).toFixed(1);

  // Status kestabilan — teks saja (tanpa dot/capsule)
  const getStabilityBadge = () => {
    switch (stabilityStatus) {
      case 'Getaran tinggi':
        return (
          <span className="text-xs font-bold text-red-600 dark:text-red-400">Bahaya</span>
        );
      case 'Tidak stabil':
        return (
          <span className="text-xs font-bold text-red-600 dark:text-red-400">Bahaya</span>
        );
      case 'Pergerakan ringan':
        return (
          <span className="text-xs font-bold text-yellow-500 dark:text-yellow-400">Warning</span>
        );
      default:
        return (
          <span className="text-xs font-bold text-green-600 dark:text-green-400">Normal</span>
        );
    }
  };

  // Fallback demo chart jika historyData masih kosong
  const chartPoints = historyData.length > 0
    ? historyData
    : [
        { time: '10:00', x: 0.01, y: -0.02, z: 0.98 },
        { time: '10:02', x: 0.03, y: 0.01, z: 0.99 },
        { time: '10:04', x: -0.02, y: -0.01, z: 1.01 },
        { time: '10:06', x: 0.05, y: -0.03, z: 0.98 },
        { time: '10:08', x: currentX, y: currentY, z: currentZ },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Pemantauan Gyroscope & Kestabilan Fisik (MPU6050)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Orientasi Sudut & Sensor Getaran Tandon Air</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Top Status & 3D Horizon Visualizer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Visual Artificial Horizon / Gyroscope Disk */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 text-white border border-gray-800 shadow-inner">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Visualisasi Horizon Orientasi 3D
              </span>

              {/* 3D Horizon Sphere */}
              <div className="relative w-36 h-36 rounded-full border-4 border-indigo-500/40 bg-gray-900 overflow-hidden shadow-2xl flex items-center justify-center">
                {/* Sky & Ground split rotating by Roll and Pitch */}
                <div 
                  className="absolute inset-0 transition-transform duration-300 ease-out"
                  style={{
                    transform: `rotate(${currentRoll}deg) translateY(${currentPitch * 1.5}px)`,
                  }}
                >
                  <div className="h-1/2 w-full bg-blue-600/80 border-b border-amber-400/80" />
                  <div className="h-1/2 w-full bg-amber-800/80" />
                </div>

                {/* Pitch reference lines */}
                <div className="absolute inset-0 flex flex-col justify-between py-5 pointer-events-none opacity-40">
                  <div className="w-12 h-px bg-white mx-auto" />
                  <div className="w-8 h-px bg-white mx-auto" />
                  <div className="w-16 h-0.5 bg-yellow-400 mx-auto" />
                  <div className="w-8 h-px bg-white mx-auto" />
                  <div className="w-12 h-px bg-white mx-auto" />
                </div>

                {/* Center Reticle Crosshair */}
                <div className="absolute w-6 h-6 border-2 border-yellow-300 rounded-full flex items-center justify-center pointer-events-none shadow-xs">
                  <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                </div>
              </div>

              {/* Degrees Summary */}
              <div className="mt-3 flex items-center gap-4 text-xs">
                <span className="text-gray-300">Roll: <strong className="text-indigo-400">{currentRoll}°</strong></span>
                <span className="text-gray-300">Pitch: <strong className="text-amber-400">{currentPitch}°</strong></span>
                <span className="text-gray-300">Yaw: <strong className="text-emerald-400">{currentYaw}°</strong></span>
              </div>
            </div>

            {/* Metrics & Stability Evaluation */}
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Status Kestabilan Tandon</span>
                <div className="flex items-center justify-between">
                  {getStabilityBadge()}
                  <span className="text-xs font-mono text-gray-500">
                    |g| ≈ {Math.sqrt(currentX ** 2 + currentY ** 2 + currentZ ** 2).toFixed(2)} g
                  </span>
                </div>
              </div>

              {/* Accelerometer XYZ Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/60">
                  <span className="text-blue-600 font-bold block">Sumbu X</span>
                  <span className="text-base font-extrabold text-gray-900 dark:text-white mt-1 block">
                    {currentX} <span className="text-[10px] font-normal text-gray-500">g</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60">
                  <span className="text-emerald-600 font-bold block">Sumbu Y</span>
                  <span className="text-base font-extrabold text-gray-900 dark:text-white mt-1 block">
                    {currentY} <span className="text-[10px] font-normal text-gray-500">g</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/60">
                  <span className="text-purple-600 font-bold block">Sumbu Z</span>
                  <span className="text-base font-extrabold text-gray-900 dark:text-white mt-1 block">
                    {currentZ} <span className="text-[10px] font-normal text-gray-500">g</span>
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed px-1">
                Sensor mendeteksi kemiringan struktur tandon dan getaran mekanis pompa. Jika kemiringan melebihi 15° atau getaran akselerasi melonjak, sistem mengindikasikan anomali struktural.
              </p>
            </div>
          </div>

          {/* Historical Movement Chart (X/Y/Z) */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-500" /> Riwayat Pergerakan Sumbu Akselerasi (X/Y/Z)
            </h4>
            <div className="h-44 w-full rounded-xl p-2 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[-2, 2]} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="x" stroke="#3b82f6" name="Akselerasi X" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="y" stroke="#10b981" name="Akselerasi Y" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="z" stroke="#8b5cf6" name="Akselerasi Z" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
