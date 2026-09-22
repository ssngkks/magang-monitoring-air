import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return dateString;
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    case "warning": return "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
    case "info": return "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
    default: return "text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700";
  }
}
