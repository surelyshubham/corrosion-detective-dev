
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
  ImageRun,
  PageBreak,
} from "docx";
import type { PatchImageSet } from "../types";
import { base64ToUint8Array } from "../utils";

export function buildNDPatches(patches: PatchImageSet[]) {
  if (!patches.length) {
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
        "The following regions could not be inspected due to physical, access, or data limitations. These areas require follow-up inspection where feasible.",
      spacing: { after: 300 },
    })
  );

  patches.forEach((patch, index) => {
    children.push(
      new Paragraph({
        text: `ND Patch ID: ${patch.patchId}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 },
      }),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row("Patch Type", "Non-Inspected Area"),
          row("X Range", patch.meta.xRange),
          row("Y Range", patch.meta.yRange),
          row("Estimated Area (Points)", patch.meta.area),
          row("Reason", patch.meta.reason ?? "Inspection not possible"),
        ],
      }),

      new Paragraph({ spacing: { after: 200 } }),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              imageCell(patch.images.view2D, "2D ND Region"),
              imageCell(patch.images.view3DTop, "3D Top View"),
            ],
          }),
        ],
      })
    );

    if (index !== patches.length - 1) {
      children.push(new PageBreak());
    }
  });

  return children;
}

/* -------- HELPERS -------- */

function row(label: string, value: any) {
  return new TableRow({
    children: [cell(label, true), cell(String(value ?? "N/A"))],
  });
}

function cell(text: string, bold = false) {
  return new TableCell({
    borders: border(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold })],
      }),
    ],
  });
}

function imageCell(base64: string, caption: string) {
  return new TableCell({
    borders: border(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: base64ToUint8Array(base64),
            transformation: { width: 260, height: 180 },
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: caption, size: 18 })],
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
