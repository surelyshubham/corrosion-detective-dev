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

/**
 * Color & Condition Legend Section
 */
export function buildLegend() {
  return [
    /* ---------------- TITLE ---------------- */
    new Paragraph({
      text: "Legend & Color Interpretation",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    }),

    /* ---------------- LEGEND TABLE ---------------- */
    new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      rows: [
        headerRow(),
        legendRow("Blue", "90 – 100%", "Acceptable / Healthy"),
        legendRow("Green", "80 – 90%", "Moderate Condition"),
        legendRow("Yellow", "70 – 80%", "Marginal Condition"),
        legendRow("Red", "< 70%", "Severe / Critical Condition"),
        legendRow("Grey", "N/A", "Non-Inspected Area (ND)"),
      ],
    }),

    /* ---------------- NOTE ---------------- */
    new Paragraph({
      spacing: { before: 200 },
      children: [
        new TextRun({
          text:
            "Note: Thickness percentages are calculated with respect to nominal thickness. " +
            "Grey regions represent areas where thickness measurements could not be obtained.",
          italics: true,
        }),
      ],
    }),
  ];
}

/* ---------------- HELPERS ---------------- */

function headerRow() {
  return new TableRow({
    children: [
      headerCell("Color"),
      headerCell("Thickness (%)"),
      headerCell("Interpretation"),
    ],
  });
}

function legendRow(color: string, range: string, meaning: string) {
  return new TableRow({
    children: [
      cell(color),
      cell(range),
      cell(meaning),
    ],
  });
}

function headerCell(text: string) {
  return new TableCell({
    width: { size: 33, type: WidthType.PERCENTAGE },
    borders: border(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold: true,
          }),
        ],
      }),
    ],
  });
}

function cell(text: string) {
  return new TableCell({
    borders: border(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
          }),
        ],
      }),
    ],
  });
}

function border() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1 },
    bottom: { style: BorderStyle.SINGLE, size: 1 },
    left: { style: BorderStyle.SINGLE, size: 1 },
    right: { style: BorderStyle.SINGLE, size: 1 },
  };
}
