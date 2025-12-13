import type { InspectionStats } from "@/lib/types";

export interface PatchImageSet {
  patchId: string;
  type: "CORROSION" | "ND";
  images: {
    view2D: string;
    view3DTop: string;
    view3DSide: string;
    view3DIso: string;
  };
  // You can add more metadata here if needed from the original patch
  worstThickness?: number;
  tier?: string;
  pointCount?: number;
}

export interface ReportInput {
  assetInfo: {
    clientName: string;
    assetTag: string;
    inspectionDate: string;
    method: string;
  };
  fullAssetImages: {
    view2D: string;
    view3DIso: string;
    view3DTop?: string;
    view3DSide?: string;
  };
  stats: InspectionStats;
  aiSummary: string;
  corrosionPatches: PatchImageSet[];
  ndPatches: PatchImageSet[];
}
