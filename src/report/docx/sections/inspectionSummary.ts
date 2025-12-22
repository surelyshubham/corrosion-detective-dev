
import {
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";
import type { ReportInput } from "../types";

/**
 * Inspection Summary Section
 */
export function buildInspectionSummary(input: ReportInput) {
  const stats = input.stats;
  const ndPercentage = stats.totalPoints > 0 ? (stats.countND / stats.totalPoints) * 100 : 0;

  return [
    /* ---------------- TITLE ---------------- */
    new Paragraph({
      text: "Inspection Summary",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    }),

    /* ---------------- SUMMARY TABLE ---------------- */
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row("Nominal Thickness (mm)", stats.nominalThickness.toFixed(2)),
        row("Minimum Thickness (mm)", stats.minThickness?.toFixed(2)),
        row("Total Scanned Area (m²)", stats.scannedArea.toFixed(2)),
        row("Non-Inspected Area (%)", ndPercentage.toFixed(2)),
        row("Total Scan Points", stats.totalPoints.toLocaleString()),
        row("Total Patches Detected", stats.totalPatches.toLocaleString()),
        row("Patches Visualized", `${stats.visualizedPatches} / ${stats.totalPatches}`),
      ],
    }),
  ];
}

/* ---------------- HELPER ---------------- */

function row(label: string, value: any) {
  return new TableRow({
    children: [cell(label, true), cell(String(value ?? "N/A"))],
  });
}

function cell(text: string, bold = false) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold,
            size: 22,
          }),
        ],
      }),
    ],
  });
}
