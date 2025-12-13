// src/report/docx/ReportBuilder.ts

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  ImageRun,
  AlignmentType,
  WidthType,
  PageBreak,
  Header,
  Footer,
} from "docx";

import type { ReportInput } from "./types";
import { createCoverPage } from "./sections/coverPage";
import { buildAssetOverview } from "./sections/assetOverview";
import { buildInspectionSummary } from "./sections/inspectionSummary";
import { buildLegend } from "./sections/legend";
import { createCorrosionPatchesSection } from "./sections/corrosionPatches";
import { createNdPatchesSection } from "./sections/ndPatches";
import { createConclusion } from "./sections/conclusion";
import { createHeader, createFooter } from "./styles";

export async function generateInspectionReport(
  input: ReportInput
): Promise<Blob> {

  const doc = new Document({
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
          ...createCoverPage(input),
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
          ...createCorrosionPatchesSection(input.corrosionPatches),
          ...(input.ndPatches.length > 0 ? [new PageBreak()] : []),

          // 6️⃣ ND PATCHES
          ...createNdPatchesSection(input.ndPatches),

          // 7️⃣ CONCLUSION
          new PageBreak(),
          ...createConclusion(input),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
