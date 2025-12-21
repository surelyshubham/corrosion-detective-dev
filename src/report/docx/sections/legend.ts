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
  ShadingType,
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
      width: { size: 80, type: WidthType.PERCENTAGE },
      columnWidths: [10, 20, 35, 35],
      rows: [
        headerRow(),
        legendRow({ hex: "1f77b4" }, "Blue", "90 – 100%", "Acceptable / Healthy"),
        legendRow({ hex: "2ca02c" }, "Green", "80 – 90%", "Moderate Condition"),
        legendRow({ hex: "ff7f0e" }, "Yellow", "70 – 80%", "Marginal Condition"),
        legendRow({ hex: "d62728" }, "Red", "< 70%", "Severe / Critical Condition"),
        legendRow({ hex: "bdbdbd" }, "Grey", "N/A", "Non-Inspected Area (ND)"),
      ],
    }),
  ];
}

/* ---------------- HELPERS ---------------- */

function headerRow() {
  return new TableRow({
    children: [
      headerCell(""), // For color box
      headerCell("Color"),
      headerCell("Thickness (%)"),
      headerCell("Interpretation"),
    ],
  });
}

function legendRow(color: { hex: string }, name: string, range: string, meaning: string) {
  return new TableRow({
    children: [
      colorCell(color.hex),
      textCell(name),
      textCell(range),
      textCell(meaning),
    ],
  });
}

function headerCell(text: string) {
  return new TableCell({
    borders: border(),
    shading: { fill: "EAEAEA", type: ShadingType.CLEAR },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20
          }),
        ],
      }),
    ],
  });
}

function colorCell(hex: string) {
  return new TableCell({
    shading: {
      fill: hex,
      type: ShadingType.CLEAR,
    },
    borders: border(),
    children: [new Paragraph(" ")], // Must have content
  });
}

function textCell(text: string) {
  return new TableCell({
    borders: border(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            size: 20,
          }),
        ],
      }),
    ],
  });
}

function border() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "D3D3D3" },
  };
}
