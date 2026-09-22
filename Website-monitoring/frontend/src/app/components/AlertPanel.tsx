import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'critical' | 'success';
  message: string;
  location: string;
  timestamp: string;
}

interface AlertPanelProps {
  alerts: Alert[];
}

export function AlertPanel({ alerts }: AlertPanelProps) {
  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'critical':
        return XCircle;
      case 'warning':
        return AlertTriangle;
      case 'success':
        return CheckCircle;
      default:
        return Info;
    }
  };

  const getAlertStyles = (type: Alert['type']) => {
    switch (type) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400';
      case 'success':
        return 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400';
      default:
        return 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400';
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-4 text-base font-bold text-gray-900 dark:text-white">Peringatan Sistem</h3>
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-700 dark:text-green-400">Semua Sistem Normal</p>
              <p className="text-xs text-green-600 dark:text-green-500">Tidak ada peringatan sensor saat ini</p>
            </div>
          </div>
        ) : (
          alerts.map((alert) => {
            const Icon = getAlertIcon(alert.type);
            return (
              <div
                key={alert.id}
                className={cn('flex items-start gap-3 rounded-lg border p-4', getAlertStyles(alert.type))}
              >
                <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{alert.message}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm opacity-80">
                    <span>{alert.location}</span>
                    <span>•</span>
                    <span>{alert.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
