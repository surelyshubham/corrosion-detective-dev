
import type { InspectionStats } from "@/lib/types";

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

  corrosionPatches: PatchImageSet[];
  ndPatches: PatchImageSet[];
}

export interface PatchImageSet {
  patchId: string;
  type: "CORROSION" | "ND";
  meta: Record<string, any>;
  images: {
    view2D: string;
    view3DTop: string;
    view3DSide: string;
    view3DIso: string;
  };
}
