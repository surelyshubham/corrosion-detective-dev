
export function base64ToUint8Array(base64?: string): Uint8Array | null {
  if (!base64 || typeof base64 !== 'string') {
    return null;
  }

  try {
    const cleanBase64 = base64.includes(',')
      ? base64.split(',')[1]
      : base64;

    if (typeof atob === 'function') {
      // Browser environment
      const binaryString = atob(cleanBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } else if (typeof Buffer === 'function') {
      // Node.js or Web Worker environment with Buffer support
      return new Uint8Array(Buffer.from(cleanBase64, 'base64'));
    } else {
        // Fallback for environments without atob or Buffer
        // This is a simple polyfill, might not be performant for large strings.
        const binaryString = decodeBase64(cleanBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
  } catch (e) {
    console.error("Failed to decode base64 string:", e);
    return null;
  }
}


// Simple polyfill for atob in non-browser environments
function decodeBase64(str: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    str = String(str).replace(/=+$/, '');
    if (str.length % 4 === 1) {
        throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (
        let bc = 0, bs = 0, buffer, i = 0;
        (buffer = str.charAt(i++));
        ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
            ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
            : 0
    ) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}
