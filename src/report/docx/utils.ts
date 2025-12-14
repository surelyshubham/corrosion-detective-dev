
export function base64ToUint8Array(base64?: string): Uint8Array | null {
  if (!base64 || typeof base64 !== 'string') {
    return null;
  }

  const cleanBase64 = base64.includes(',')
    ? base64.split(',')[1]
    : base64;

  try {
    // Use Buffer for environment-agnostic base64 decoding
    const buffer = Buffer.from(cleanBase64, 'base64');
    return new Uint8Array(buffer);
  } catch (e) {
    console.error("Failed to decode base64 string:", e);
    return null;
  }
}
