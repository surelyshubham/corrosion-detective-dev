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

export function canvasToArrayBuffer(canvas: HTMLCanvasElement, mime = 'image/png', quality?: any): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    // Use toBlob if available (preferred)
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('toBlob returned null'));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(blob);
      }, mime, quality);
      return;
    }
    // Fallback: dataURL -> fetch -> arrayBuffer
    try {
      const dataUrl = canvas.toDataURL(mime, quality);
      fetch(dataUrl).then(res => res.arrayBuffer()).then(buf => resolve(buf)).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}
