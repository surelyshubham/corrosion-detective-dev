// src/report/patchHelpers.ts
export type Severity = 'low' | 'medium' | 'high' | 'critical' | string;

export type PatchMeta = {
  id: string;
  area_m2?: number;
  avgDepth_mm?: number;
  maxDepth_mm?: number;
  severity?: Severity;
  shortInsight?: string;
  detectionIndex?: number;
};

export type PatchEntry = {
  meta?: {
    area_m2?: number;
    avgDepth_mm?: number;
    maxDepth_mm?: number;
    severity?: Severity;
    shortInsight?: string;
  };
  images?: { top?: string; side?: string; iso?: string; heat?: string };
  buffers?: Array<{ name: string; url?: string }>;
};

function severityScore(sev?: Severity) {
  if (!sev) return 0;
  if (sev === 'critical') return 1;
  if (sev === 'high') return 0.85;
  if (sev === 'medium') return 0.5;
  if (sev === 'low') return 0.2;
  return 0;
}

// Get all patch IDs from window.PatchVault
export function getAllPatchIdsFromVault(): string[] {
  const w: any = window as any;
  const vault = w.PatchVault;
  if (!vault) return [];

  // If it's a Map
  if (vault instanceof Map) {
    return Array.from(vault.keys());
  }
  // If it has .patches Map
  if (vault.patches instanceof Map) {
    return Array.from(vault.patches.keys());
  }
  // If it has .patches object
  if (vault.patches && typeof vault.patches === 'object') {
    return Object.keys(vault.patches);
  }
  // If it's a plain object keyed by id
  if (typeof vault === 'object') {
    return Object.keys(vault);
  }
  return [];
}

// Get single patch entry by id from PatchVault
export function getPatchFromVault(id: string): PatchEntry | undefined {
  const w: any = window as any;
  const vault = w.PatchVault;
  if (!vault) return undefined;

  if (vault instanceof Map) return vault.get(id);
  if (vault.patches instanceof Map) return vault.patches.get(id);
  if (vault.patches && typeof vault.patches === 'object') return vault.patches[id];
  if (typeof vault === 'object') return vault[id];
  return undefined;
}

// Extract up to 4 view URLs (top, side, iso, heat)
export function getPatchViewUrls(entry: PatchEntry): string[] {
  const urls: string[] = [];

  if (entry.images) {
    const { top, side, iso, heat } = entry.images;
    if (top) urls.push(top);
    if (side) urls.push(side);
    if (iso) urls.push(iso);
    if (heat) urls.push(heat);
  }

  if (urls.length < 4 && Array.isArray(entry.buffers)) {
    const preferred = ['top', 'side', 'iso', 'heat', 'heatmap'];
    for (const name of preferred) {
      const b = entry.buffers.find(x => x.name === name && x.url);
      if (b && b.url && !urls.includes(b.url)) urls.push(b.url);
      if (urls.length >= 4) break;
    }
    // Fill with any remaining if <4
    if (urls.length < 4) {
      for (const b of entry.buffers) {
        if (b.url && !urls.includes(b.url)) {
          urls.push(b.url);
          if (urls.length >= 4) break;
        }
      }
    }
  }

  return urls.slice(0, 4);
}

// Build scoring meta for all patches
export function buildPatchMetaList(): PatchMeta[] {
  const ids = getAllPatchIdsFromVault();
  return ids.map((id, index) => {
    const entry = getPatchFromVault(id) || {};
    const m = entry.meta || {};
    return {
      id,
      area_m2: m.area_m2,
      avgDepth_mm: m.avgDepth_mm,
      maxDepth_mm: m.maxDepth_mm,
      severity: m.severity,
      shortInsight: m.shortInsight,
      detectionIndex: index,
    };
  });
}

// Pick top N patches by simple severity+area+depth score
export function pickTopNPatches(n: number): PatchMeta[] {
  const all = buildPatchMetaList();
  if (!all.length) return [];

  const maxArea = Math.max(...all.map(p => p.area_m2 ?? 0), 1);
  const maxDepth = Math.max(...all.map(p => p.avgDepth_mm ?? 0), 1);

  const scored = all.map(p => {
    const score =
      0.5 * severityScore(p.severity) +
      0.25 * ((p.area_m2 ?? 0) / maxArea) +
      0.2 * ((p.avgDepth_mm ?? 0) / maxDepth);
    return { ...p, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.maxDepth_mm ?? 0) !== (a.maxDepth_mm ?? 0)) return (b.maxDepth_mm ?? 0) - (a.maxDepth_mm ?? 0);
    if ((b.area_m2 ?? 0) !== (a.area_m2 ?? 0)) return (b.area_m2 ?? 0) - (a.area_m2 ?? 0);
    return (a.detectionIndex ?? 0) - (b.detectionIndex ?? 0);
  });

  return scored.slice(0, n);
}
