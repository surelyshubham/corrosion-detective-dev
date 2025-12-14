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
import { STYLES } from "../styles";

/**
 * Inspection Summary Section
 */
export function buildInspectionSummary(input: ReportInput) {
  const stats = input.stats;

  return [
    /* ---------------- TITLE ---------------- */
    new Paragraph({
      text: "Inspection Summary",
      style: STYLES.paragraphStyles.find(s => s.id === "heading1")?.id, // Assumes you have defined styles
      spacing: { after: 300 },
    }),

    /* ---------------- SUMMARY TABLE ---------------- */
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row("Nominal Thickness (mm)", stats.nominalThickness),
        row("Minimum Thickness (mm)", stats.minThickness?.toFixed(2)),
        row("Average Thickness (mm)", stats.avgThickness?.toFixed(2)),
        row("Maximum Thickness (mm)", stats.maxThickness?.toFixed(2)),
        row("Total Scanned Area (m²)", stats.scannedArea.toFixed(2)),
        row(
          "Area Below 80% (%)",
          stats.areaBelow80?.toFixed(2)
        ),
        row(
          "Area Below 70% (%)",
          stats.areaBelow70?.toFixed(2)
        ),
        row(
          "Area Below 60% (%)",
          stats.areaBelow60?.toFixed(2)
        ),
        row(
          "Non-Inspected Area (%)",
          stats.countND
            ? ((stats.countND / stats.totalPoints) * 100).toFixed(2)
            : "0.00"
        ),
        row("Total Scan Points", stats.totalPoints),
        row("Overall Condition", stats.condition),
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
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold,
          }),
        ],
      }),
    ],
  });
}
