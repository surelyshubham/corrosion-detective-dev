
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

  patches.forEach((patch, index) => {
    children.push(
      new Paragraph({
        text: `ND Region ID: ${patch.patchId}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 },
      }),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [35, 65],
        rows: [
          row("Patch Type", "Non-Inspected Area"),
          row("Location (X Range)", patch.meta.xRange),
          row("Location (Y Range)", patch.meta.yRange),
          row("Estimated Area (Points)", patch.meta.area),
          row("Reason", patch.meta.reason ?? "Region could not be scanned"),
        ],
      }),
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
          spacing: { before: 80, after: 80 },
          children: [new TextRun({ text, bold, size: 20 })]
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
