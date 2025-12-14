
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from "docx";

import {
  heading,
  pageBreak,
  spacer,
} from "./docx-base";

import {
  buildCoverPage,
  buildAssetOverview,
  build2x2ImageGrid,
  buildHeader,
  buildFooter,
} from "./docx-sections";

import {
  buildCorrosionPatchSection,
  buildNDPatchSection,
  buildConclusionPage,
} from "./docx-patches";


/* ---------------------------------------------------------
   MAIN INPUT TYPE
--------------------------------------------------------- */
export interface ReportInput {
  assetId: string;
  inspector: string;
  date: string;
  overview2D: string;
  overviewIso: string;
  overviewTop: string;
  overviewSide: string;
  minPercentage: number;
  condition: string;
  aiSummary: string;
  corrosionPatches: any[];
  ndPatches: any[];
  logo: string;
}

/* ---------------------------------------------------------
   REPORT BUILDER
--------------------------------------------------------- */
export async function generateInspectionReport(input: ReportInput) {
  const {
    assetId,
    inspector,
    date,
    overview2D,
    overviewIso,
    overviewTop,
    overviewSide,
    corrosionPatches,
    ndPatches,
    aiSummary,
    minPercentage,
    condition,
    logo,
  } = input;

  /* ---------------------- PAGE: COVER ---------------------- */
  const coverPage = buildCoverPage({
    assetId,
    clientName: "Client", // Placeholder
    location: "Location", // Placeholder
    date,
  });

  /* ---------------------- PAGE: ASSET OVERVIEW ---------------------- */
  const overviewPage = buildAssetOverview({
    nominalThickness: 0, // Placeholder, should come from stats
    minThickness: 0,
    maxThickness: 0,
    avgThickness: 0,
    gridWidth: 0,
    gridHeight: 0,
    percentBelow80: 0,
    percentBelow70: 0,
    percentBelow60: 0,
  });

  const overviewImages = build2x2ImageGrid("Asset Views", [
    overview2D,
    overviewIso,
    overviewTop,
    overviewSide,
  ]);

  /* ---------------------- PAGE: AI SUMMARY ---------------------- */
  const aiSummaryPage = [
    heading("AI Insight Summary", 1),
    spacer(40),
    new Paragraph({
      children: [new TextRun({ text: aiSummary, size: 24 })],
      alignment: AlignmentType.LEFT,
    }),
    spacer(200),
    pageBreak(),
  ];

  /* ---------------------- PAGE: CORROSION PATCHES ---------------------- */
  const corrosionPatchSection = buildCorrosionPatchSection(corrosionPatches);

  /* ---------------------- PAGE: ND PATCHES ---------------------- */
  const ndPatchSection = buildNDPatchSection(ndPatches);

  /* ---------------------- PAGE: CONCLUSION ---------------------- */
  const conclusionPage = buildConclusionPage({
    minPercentage,
    condition,
  });

  /* ---------------------------------------------------------
     COMBINE EVERYTHING INTO FINAL DOCX DOCUMENT
  --------------------------------------------------------- */
  const header = await buildHeader();
  const footer = buildFooter();

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
          },
        },
      },
    },
    sections: [
      {
        headers: { default: header },
        footers: { default: footer },
        children: [
          ...coverPage,
          ...overviewPage,
          ...overviewImages,
          ...aiSummaryPage,
          ...corrosionPatchSection,
          ...ndPatchSection,
          ...conclusionPage,
        ],
      },
    ],
  });

  /* ---------------------- GENERATE FILE ---------------------- */
  const blob = await Packer.toBlob(doc);
  return blob;
}
