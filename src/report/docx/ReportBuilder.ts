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
import { buildConclusion } from "./sections/conclusion";
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
          // 1️⃣ COVER PAGE
          ...buildCoverPage(input),
          new PageBreak(),

          // 2️⃣ ASSET OVERVIEW (FULL 2D + 3D + AI INSIGHT)
          ...buildAssetOverview(input),
          new PageBreak(),

          // 3️⃣ INSPECTION SUMMARY
          ...buildInspectionSummary(input),
          new PageBreak(),

          // 4️⃣ LEGEND
          ...buildLegend(),
          new PageBreak(),

          // 5️⃣ CORROSION PATCHES
          ...buildCorrosionPatches(input.corrosionPatches),
          ...(input.ndPatches.length > 0 && input.corrosionPatches.filter(p=>p.representation === 'IMAGE').length > 0 ? [new PageBreak()] : []),

          // 6️⃣ ND PATCHES
          ...buildNDPatches(input.ndPatches),

          // 7️⃣ CONCLUSION
          new PageBreak(),
          ...buildConclusion(input),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
