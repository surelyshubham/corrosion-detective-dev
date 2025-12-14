
export function base64ToUint8Array(base64?: string): Uint8Array | null {
  if (!base64 || typeof base64 !== 'string') {
    return null;
  }

  const cleanBase64 = base64.includes(',')
    ? base64.split(',')[1]
    : base64;

  try {
    const binary = atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Failed to decode base64 string:", e);
    return null;
  }
}
