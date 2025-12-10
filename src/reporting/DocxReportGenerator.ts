
// This file is now a placeholder for type definitions used by the client
// and the server-side API route. The actual DOCX generation logic has
// been moved to `src/app/api/generate-report/route.ts`.

import type { SegmentBox } from '@/lib/types';


export interface GlobalStatsForDocx {
  assetName: string;
  projectName?: string;
  inspectionDate?: string;
  nominalThickness: number;
  minThickness: number;
  maxThickness: number;
  avgThickness: number;
  corrodedAreaBelow80: number;
  corrodedAreaBelow70: number;
  corrodedAreaBelow60: number;
}

export interface ReportPatchSegment extends SegmentBox {
  isoViewUrl?: string;
  topViewUrl?: string;
  sideViewUrl?: string;
  heatmapUrl?: string;
  aiObservation?: string;
}

export interface FinalReportPayload {
  global: GlobalStatsForDocx;
  segments: ReportPatchSegment[];
  remarks?: string;
}
