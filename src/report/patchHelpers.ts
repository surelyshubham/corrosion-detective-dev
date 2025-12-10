
// src/report/patchHelpers.ts
import { jsPDF } from 'jspdf';

export type Severity = 'low' | 'medium' | 'high' | 'critical' | string;

export type PatchMeta = {
  id: string;
  area_m2?: number;
  avgDepth_mm?: number;
  maxDepth_mm?: number;
  severity?: Severity;
  shortInsight?: string;
  detectionIndex?: number;
  worstThickness?: number;
  tier?: string;
};

export type PatchEntry = {
  meta?: {
    area_m2?: number;
    avgDepth_mm?: number;
    maxDepth_mm?: number;
    severity?: Severity;
    shortInsight?: string;
    worstThickness?: number;
    tier?: string;
  };
  images?: { isoViewDataUrl?: string; topViewDataUrl?: string; sideViewDataUrl?: string; heatmapDataUrl?: string; };
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

// Get all patch IDs from the vault object
export function getAllPatchIdsFromVault(vault: {[key: string]: any} | null): string[] {
  if (!vault) return [];
  return Object.keys(vault);
}

// Get single patch entry by id from the vault object
export function getPatchFromVault(vault: {[key: string]: any} | null, id: string): PatchEntry | undefined {
  if (!vault) return undefined;
  return vault[id];
}

// Extract up to 4 view URLs
export function getPatchViewUrls(entry: PatchEntry): string[] {
  const urls: string[] = [];
  if (entry.images) {
    const { isoViewDataUrl, topViewDataUrl, sideViewDataUrl, heatmapDataUrl } = entry.images;
    if (isoViewDataUrl) urls.push(isoViewDataUrl);
    if (topViewDataUrl) urls.push(topViewDataUrl);
    if (sideViewDataUrl) urls.push(sideViewDataUrl);
    if (heatmapDataUrl) urls.push(heatmapDataUrl);
  }
  return urls.slice(0, 4);
}

// Build scoring meta for all patches
export function buildPatchMetaList(vault: {[key: string]: any} | null): PatchMeta[] {
  if (!vault) return [];
  const ids = getAllPatchIdsFromVault(vault);
  return ids.map((id, index) => {
    const entry = getPatchFromVault(vault, id) || {};
    const m = entry.meta || {};
    return {
      id,
      area_m2: m.area_m2,
      avgDepth_mm: m.avgDepth_mm,
      maxDepth_mm: m.maxDepth_mm,
      severity: m.severity,
      shortInsight: m.shortInsight,
      detectionIndex: index,
      worstThickness: m.worstThickness,
      tier: m.tier,
    };
  });
}

// Pick top N patches by simple severity+area+depth score
export function pickTopNPatches(vault: {[key: string]: any} | null, n: number): PatchMeta[] {
  const all = buildPatchMetaList(vault);
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
    if ((b.worstThickness ?? Infinity) < (a.worstThickness ?? Infinity)) return -1;
    if ((b.worstThickness ?? Infinity) > (a.worstThickness ?? Infinity)) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return (a.detectionIndex ?? 0) - (b.detectionIndex ?? 0);
  });

  return scored.slice(0, n);
}

    