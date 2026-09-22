import { AlertTriangle, Info, CheckCircle, X } from "lucide-react";

export type AlertType = "critical" | "warning" | "info" | "success";

export type AlertItem = {
  id: string | number;
  type: AlertType;
  message: string;
  location?: string;
  time?: string;
  read?: boolean;
};

function iconFor(type: AlertType) {
  if (type === "critical") return <AlertTriangle className="w-4 h-4 text-red-600" />;
  if (type === "warning") return <AlertTriangle className="w-4 h-4 text-amber-600" />;
  if (type === "info") return <Info className="w-4 h-4 text-blue-600" />;
  return <CheckCircle className="w-4 h-4 text-emerald-600" />;
}

function bgFor(type: AlertType) {
  if (type === "critical") return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900";
  if (type === "warning") return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900";
  if (type === "info") return "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900";
  return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900";
}

export function AlertPanel({
  alerts,
  onDismiss,
}: {
  alerts: AlertItem[];
  onDismiss?: (id: string | number) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Tidak ada peringatan
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${bgFor(a.type)}`}>
          <div className="mt-0.5">{iconFor(a.type)}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white">{a.message}</p>
            {(a.location || a.time) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {a.location ?? ""} {a.location && a.time ? "•" : ""} {a.time ?? ""}
              </p>
            )}
          </div>
          {onDismiss && (
            <button onClick={() => onDismiss(a.id)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
