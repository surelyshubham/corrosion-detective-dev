export function base64ToUint8Array(base64: string): Uint8Array {
  const base64Data = base64.split(",")[1];
  const binary = atob(base64Data);
  const len = binary.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i++) buffer[i] = binary.charCodeAt(i);
  return buffer;
}
