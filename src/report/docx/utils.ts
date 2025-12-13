export function base64ToUint8Array(base64: string): Uint8Array {
  // FIX: strip data URL prefix if present
  const cleanBase64 = base64.includes(',')
    ? base64.split(',')[1]
    : base64;

  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
