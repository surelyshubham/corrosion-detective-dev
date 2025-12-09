import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
} from "docx";
import type { MergedInspectionResult, ReportMetadata } from '@/lib/types';
import { format } from 'date-fns';
import type { IdentifiedPatch } from '@/reporting/patch-detector';


export interface ReportData {
  metadata: ReportMetadata & { defectThreshold: number };
  inspection: MergedInspectionResult;
  segments: IdentifiedPatch[];
  images: {
    fullModel3D?: string;
    fullHeatmap2D?: string;
    segmentShots?: { segmentId: number; imageDataUrl: string }[];
  };
}

function base64ToUint8Array(base64DataUrl: string): Uint8Array {
  const base64 = base64DataUrl.split(",")[1];
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function generateReportDocx(data: ReportData) {
  const { metadata, inspection, segments, images } = data;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Corrosion Inspection Report",
                bold: true,
                size: 36,
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 300, after: 300 },
            children: [
              new TextRun({ text: `Client: ${metadata.companyName || "-"}`, bold: true }),
              new TextRun({ text: `\nProject: ${metadata.projectName || "-"}`}),
              new TextRun({ text: `\nAsset ID: ${metadata.assetName || "-"}`}),
              new TextRun({ text: `\nDate: ${metadata.reportDate ? format(metadata.reportDate, 'PP') : "-"}`}),
            ],
          }),

          new Paragraph({
            text: "Inspection Summary",
            heading: HeadingLevel.HEADING_2,
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Minimum Thickness")] }),
                  new TableCell({ children: [new Paragraph(String(inspection.stats.minThickness?.toFixed(2) || "-"))] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Maximum Thickness")] }),
                  new TableCell({ children: [new Paragraph(String(inspection.stats.maxThickness?.toFixed(2) || "-"))] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Average Thickness")] }),
                  new TableCell({ children: [new Paragraph(String(inspection.stats.avgThickness?.toFixed(2) || "-"))] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Area Below Threshold")] }),
                  new TableCell({
                    children: [new Paragraph(String(segments?.length || "-"))],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "", spacing: { before: 400 } }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("3D Surface View")],
          }),

          ...(images.fullModel3D
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: base64ToUint8Array(images.fullModel3D),
                      transformation: { width: 500, height: 250 },
                    }),
                  ],
                }),
              ]
            : []),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("2D Heatmap View")],
          }),

          ...(images.fullHeatmap2D
            ? [
                new Paragraph({
                   alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: base64ToUint8Array(images.fullHeatmap2D),
                      transformation: { width: 500, height: 250 },
                    }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Report_${metadata.assetName.replace(/ /g, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
