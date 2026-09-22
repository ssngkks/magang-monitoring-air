import React from 'react';
import { X, Droplet, AlertTriangle, CheckCircle2, AlertCircle, Info, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

interface PHDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  phValue: number;
  lastUpdated: string;
  minLimit?: number;
  maxLimit?: number;
}

export const PHDetailModal: React.FC<PHDetailModalProps> = ({
  isOpen,
  onClose,
  phValue,
  lastUpdated,
  minLimit = 6.5,
  maxLimit = 8.5,
}) => {
  if (!isOpen) return null;

  // Evaluasi status dan deviasi/kekurangan
  let status: 'normal' | 'warning' | 'critical' = 'normal';
  let conditionText = 'Ideal & Netral (Sesuai Standar Baku Mutu Air)';
  let deviationText = 'Tidak ada penyimpangan. Nilai pH berada dalam rentang ideal.';
  let deviationType: 'none' | 'acid' | 'alkaline' = 'none';
  let deviationValue = 0;

  if (phValue < minLimit) {
    status = phValue < 5.0 ? 'critical' : 'warning';
    deviationType = 'acid';
    deviationValue = +(minLimit - phValue).toFixed(2);
    conditionText = `Asam (Terlalu Rendah) — Kurang ${deviationValue} pH dari batas minimum ${minLimit}`;
    deviationText = `Terjadi kekurangan ${deviationValue} pH untuk mencapai ambang batas netral minimum. Berpotensi menyebabkan korosi pipa logam dan rasa asam.`;
  } else if (phValue > maxLimit) {
    status = phValue > 9.5 ? 'critical' : 'warning';
    deviationType = 'alkaline';
    deviationValue = +(phValue - maxLimit).toFixed(2);
    conditionText = `Basa (Terlalu Tinggi) — Melebihi ${deviationValue} pH dari batas maksimum ${maxLimit}`;
    deviationText = `Terjadi kelebihan ${deviationValue} pH di atas ambang batas maksimum. Berpotensi memicu kerak mineral dan rasa pahit/kesat.`;
  }

  const getStatusBadge = () => {
    switch (status) {
      case 'critical':
        return (
          <span className="text-xs font-bold text-red-600 dark:text-red-400">Bahaya</span>
        );
      case 'warning':
        return (
          <span className="text-xs font-bold text-yellow-500 dark:text-yellow-400">Warning</span>
        );
      default:
        return (
          <span className="text-xs font-bold text-green-600 dark:text-green-400">Normal</span>
        );
    }
  };

  // Persentase posisi indikator bar pH (0 - 14)
  const positionPercent = Math.min(Math.max((phValue / 14) * 100, 0), 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Droplet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Rincian Lengkap & Analisis pH Air</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Unit Sensor Kualitas Air Tandon</p>
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
        <div className="p-6 space-y-6">
          {/* Main Reading Card */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Nilai pH Terkini</span>
              <div className="text-3xl font-extrabold text-gray-900 dark:text-white mt-0.5">
                {phValue.toFixed(2)} <span className="text-base font-normal text-gray-500">pH</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Status Kualitas</span>
              {getStatusBadge()}
            </div>
          </div>

          {/* Visual pH Range Gauge Bar */}
          <div>
            <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              <span className="text-red-500 font-semibold">0 Asam Kuat</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Normal ({minLimit} - {maxLimit})</span>
              <span className="text-purple-600 font-semibold">14 Basa Kuat</span>
            </div>
            <div className="relative h-4 w-full rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-emerald-400 to-purple-600 shadow-inner">
              {/* Highlight range aman */}
              <div 
                className="absolute top-0 bottom-0 bg-white/30 dark:bg-white/20 border-x border-white"
                style={{
                  left: `${(minLimit / 14) * 100}%`,
                  width: `${((maxLimit - minLimit) / 14) * 100}%`,
                }}
              />
            </div>
            {/* Pointer jarum */}
            <div className="relative w-full h-4 mt-1">
              <div 
                className="absolute -top-1 -translate-x-1/2 flex flex-col items-center transition-all duration-500"
                style={{ left: `${positionPercent}%` }}
              >
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[6px] border-b-gray-900 dark:border-b-white" />
                <span className="text-[10px] font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-1 rounded shadow-xs">
                  {phValue.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Analisis Kekurangan & Kondisi */}
          <div className={`p-4 rounded-xl border ${
            deviationType !== 'none'
              ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/60'
              : 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/60'
          }`}>
            <div className="flex items-start gap-2.5">
              {deviationType === 'acid' && <ArrowDownRight className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
              {deviationType === 'alkaline' && <ArrowUpRight className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
              {deviationType === 'none' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                  Kondisi & Evaluasi Mutu
                </h4>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-1">
                  {conditionText}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  {deviationText}
                </p>
              </div>
            </div>
          </div>

          {/* Rincian Teknis & Parameter Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <span className="text-gray-400 block">Batas Aman Minimum</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm mt-0.5 block">{minLimit} pH</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <span className="text-gray-400 block">Batas Aman Maksimum</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm mt-0.5 block">{maxLimit} pH</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <span className="text-gray-400 block">Standar Regulasi</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm mt-0.5 block">Permenkes No. 2 Tahun 2023</span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <span className="text-gray-400 block flex items-center gap-1">
                <Clock className="w-3 h-3" /> Terakhir Diperbarui
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm mt-0.5 block">{lastUpdated || 'Menunggu data'}</span>
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
