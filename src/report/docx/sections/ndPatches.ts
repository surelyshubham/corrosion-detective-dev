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
import type { EnrichedPatch } from "../types";

export function buildNDPatches(patches: EnrichedPatch[]) {
  if (!patches || patches.length === 0) {
    return [
      new Paragraph({
        text: "Non-Inspected Areas",
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: "No non-inspected areas were identified during this inspection.",
      }),
    ];
  }

  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "Non-Inspected Areas (ND)",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
    }),
    new Paragraph({
      text:
        "The following regions could not be inspected due to physical gaps between plates, access limitations, or data acquisition issues. These areas should be considered when making final integrity management decisions.",
      spacing: { after: 300 },
    })
  );

  const ndRows = patches.map(p => new TableRow({
    children: [
        tableCell(p.patchId),
        tableCell(p.meta.xRange),
        tableCell(p.meta.yRange),
        tableCell(p.meta.area.toString()),
        tableCell(p.meta.reason),
    ]
  }));

  children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
          new TableRow({
              children: [
                headerCell("Region ID"),
                headerCell("X-Range"),
                headerCell("Y-Range"),
                headerCell("Area (Points)"),
                headerCell("Reason"),
              ]
          }),
          ...ndRows,
      ]
  }));


  return children;
}

/* -------- HELPERS -------- */

function headerCell(text: string) {
  return new TableCell({
    borders: border(),
    shading: { fill: "EAEAEA" },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 20 })] })]
  });
}

function tableCell(text: string | undefined) {
    return new TableCell({
        borders: border(),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: text ?? 'N/A', size: 20 })]})]
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
