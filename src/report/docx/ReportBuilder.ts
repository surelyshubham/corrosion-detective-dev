// src/report/docx/ReportBuilder.ts

import {
  Document,
  Packer,
  Paragraph,
  PageBreak,
} from "docx";

import type { ReportInput } from "./types";
import { buildCoverPage } from "./sections/coverPage";
import { buildAssetOverview } from "./sections/assetOverview";
import { buildInspectionSummary } from "./sections/inspectionSummary";
import { buildLegend } from "./sections/legend";
import { buildCorrosionPatches } from "./sections/corrosionPatches";
import { buildNDPatches } from "./sections/ndPatches";
import { createHeader, createFooter, STYLES } from "./styles";

export async function generateInspectionReport(
  input: ReportInput
): Promise<Blob> {

  const doc = new Document({
    styles: STYLES,
    sections: [
      {
        headers: {
          default: createHeader(input.assetInfo),
        },
        footers: {
          default: createFooter(),
        },
        children: [
          // 1. Cover Page
          ...buildCoverPage(input),
          new PageBreak(),

          // 2. Asset Overview (2D + 3D Isometric)
          ...buildAssetOverview(input),
          new PageBreak(),

          // 3. Inspection Summary
          ...buildInspectionSummary(input),
          new PageBreak(),

          // 4. Legend
          ...buildLegend(),
          new PageBreak(),

          // 5. Corrosion Patches (Summary Table + Individual Details)
          ...buildCorrosionPatches(input.corrosionPatches, input.stats.nominalThickness),
          ...(input.ndPatches.length > 0 && input.corrosionPatches.filter(p => p.representation === 'IMAGE').length > 0 ? [new PageBreak()] : []),

          // 6. ND Patches
          ...buildNDPatches(input.ndPatches),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
