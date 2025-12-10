// src/vaults/patchVault.ts
export type PatchBuffer = { name: string; buffer: ArrayBuffer; mime: string };
export type PatchEntry = { buffers: PatchBuffer[]; previewUrl?: string; meta?: any };

class _PatchVault {
  patches: Map<string, PatchEntry> = new Map();

  get(id: string) { return this.patches.get(id); }
  set(id: string, entry: PatchEntry) { this.patches.set(id, entry); }
  has(id: string) { return this.patches.has(id); }
  delete(id: string) {
    const p = this.patches.get(id);
    if (p?.previewUrl) {
      try { URL.revokeObjectURL(p.previewUrl); } catch(e) {}
    }
    this.patches.delete(id);
  }
  clearAll() {
    for (const [k, v] of this.patches) {
      if (v?.previewUrl) try { URL.revokeObjectURL(v.previewUrl); } catch(e){}
    }
    this.patches.clear();
  }
}

export const PatchVault = new _PatchVault();
