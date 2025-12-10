import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { type Condition } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function downloadFile(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export const getConditionClass = (condition: Condition) => {
  switch (condition) {
    case 'Healthy':
      return 'text-green-500';
    case 'Moderate':
      return 'text-yellow-500';
    case 'Severe':
      return 'text-orange-500';
    case 'Critical':
      return 'text-red-500 font-bold';
    default:
      return 'text-muted-foreground';
  }
};
