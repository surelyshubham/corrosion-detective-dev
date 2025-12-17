import type { InspectionStats, SegmentBox } from "@/lib/types";

export interface ReportInput {
  assetInfo: {
    clientName: string;
    assetTag: string;
    operatorName: string;
    inspectionDate: string;
    method: string;
    reportId: string;
    logoBase64: string;
  };

  fullAssetImages: {
    view2D: string;
    view3DIso: string;
    view3DTop?: string;
    view3DSide?: string;
  };

  stats: any; // your InspectionStats
  aiSummary: string;

  corrosionPatches: EnrichedPatch[];
  ndPatches: EnrichedPatch[];
}

export interface EnrichedPatch {
  patchId: string;
  type: "CORROSION" | "ND";
  representation: "IMAGE" | "TABLE_ONLY";
  meta: Record<string, any>;
  images: {
    view2D: string;
    view3DTop: string;
    view3DSide: string;
    view3DIso: string;
  } | null;
   cells?: {
    x: number;
    y: number;
    xMm: number;
    yMm: number;
    rawThickness: number | null;
    effectiveThickness: number | null;
  }[];
}
