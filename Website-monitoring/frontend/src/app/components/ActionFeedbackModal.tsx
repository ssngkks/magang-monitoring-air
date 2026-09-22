import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export type ActionFeedbackStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ActionFeedbackModalProps {
  isOpen: boolean;
  status: ActionFeedbackStatus;
  title?: string;
  message?: string;
  onClose: () => void;
  autoCloseMs?: number;
}

export const ActionFeedbackModal: React.FC<ActionFeedbackModalProps> = ({
  isOpen,
  status,
  title,
  message,
  onClose,
  autoCloseMs = 1800,
}) => {
  useEffect(() => {
    if (isOpen && status === 'success' && autoCloseMs > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseMs);
      return () => clearTimeout(timer);
    }
  }, [isOpen, status, autoCloseMs, onClose]);

  if (!isOpen || status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-2xl p-6 sm:p-8 text-center transform animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* State: LOADING */}
        {status === 'loading' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 shadow-inner">
              <Loader2 className="w-9 h-9 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {title || 'Sedang Memproses...'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {message || 'Mohon tunggu sebentar, sistem sedang menghubungkan ke server.'}
            </p>
          </div>
        )}

        {/* State: SUCCESS (Router Confirmation Style) */}
        {status === 'success' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-sm animate-in zoom-in duration-300">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
              {title || 'Berhasil'}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed max-w-[260px]">
              {message || 'Operasi berhasil dieksekusi dan disimpan.'}
            </p>
            <div className="mt-6 w-full">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* State: ERROR */}
        {status === 'error' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/60 border-2 border-red-500/30 flex items-center justify-center text-red-600 dark:text-red-400 mb-4 shadow-sm animate-in zoom-in duration-300">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
              {title || 'Gagal'}
            </h3>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2 leading-relaxed max-w-[260px] break-words font-medium">
              {message || 'Terjadi kesalahan saat memproses data. Silakan coba lagi.'}
            </p>
            <div className="mt-6 w-full">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-gray-900 hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
