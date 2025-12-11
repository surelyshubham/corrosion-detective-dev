
// src/utils/capturePatchImages.ts

type ViewKind = "iso" | "top" | "side" | "heatmap";

const viewRegistry: Partial<Record<ViewKind, HTMLCanvasElement>> = {};

/**
 * Register canvases from your React components.
 * Call these once when the viewer mounts.
 */
export function registerIsoCanvas(el: HTMLCanvasElement | null) {
  if (el) {
    viewRegistry.iso = el;
    console.log("ISO canvas registered", el);
  }
}

export function registerTopCanvas(el: HTMLCanvasElement | null) {
  if (el) {
    viewRegistry.top = el;
    console.log("TOP canvas registered", el);
  }
}

export function registerSideCanvas(el: HTMLCanvasElement | null) {
  if (el) {
    viewRegistry.side = el;
    console.log("SIDE canvas registered", el);
  }
}

export function registerHeatmapCanvas(el: HTMLCanvasElement | null) {
  if (el) {
    viewRegistry.heatmap = el;
    console.log("HEATMAP canvas registered", el);
  }
}

/**
 * This is what your store calls after FINALIZE.
 * For now it just captures the current canvases as PNGs.
 * The same 4 views are reused for every patch (simplest stable version).
 */
export async function capturePatchImagesForSegment(_segId: string) {
  const result: {
    isoViewDataUrl?: string;
    topViewDataUrl?: string;
    sideViewDataUrl?: string;
    heatmapDataUrl?: string;
  } = {};

  const capture = (kind: ViewKind, key: keyof typeof result) => {
    const canvas = viewRegistry[kind];
    if (!canvas) return;
    try {
      result[key] = canvas.toDataURL("image/png");
    } catch (e) {
      console.error(`Failed to capture ${kind} view`, e);
    }
  };

  capture("iso", "isoViewDataUrl");
  capture("top", "topViewDataUrl");
  capture("side", "sideViewDataUrl");
  capture("heatmap", "heatmapDataUrl");

  return result;
}

    