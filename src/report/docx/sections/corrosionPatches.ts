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

/**
 * Builds Corrosion Patch Details section
 */
export function buildCorrosionPatches(patches: PatchImageSet[]) {
  const children: any[] = [];

  /* ---------------- SECTION TITLE ---------------- */
  children.push(
    new Paragraph({
      text: "Corrosion Patch Details",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
    })
  );

  patches.forEach((patch, index) => {
    /* -------- PATCH HEADER -------- */
    children.push(
      new Paragraph({
        text: `Patch ID: ${patch.patchId}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 },
      })
    );

    /* -------- METADATA TABLE -------- */
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          metaRow("Patch Type", "Corrosion"),
          metaRow("X Range", patch.meta.xRange),
          metaRow("Y Range", patch.meta.yRange),
          metaRow("Area (mm²)", patch.meta.area),
          metaRow("Minimum Thickness (mm)", patch.meta.minThickness),
          metaRow("Average Thickness (mm)", patch.meta.avgThickness),
          metaRow("Severity", patch.meta.severity),
        ],
      })
    );

    /* -------- IMAGE GRID (2 × 2) -------- */
    children.push(
      new Paragraph({ text: "", spacing: { after: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              imageCell(patch.images.view2D, "2D Patch View"),
              imageCell(patch.images.view3DTop, "3D Top View"),
            ],
          }),
          new TableRow({
            children: [
              imageCell(patch.images.view3DSide, "3D Side View"),
              imageCell(patch.images.view3DIso, "3D Isometric View"),
            ],
          }),
        ],
      })
    );

    /* -------- PAGE BREAK (EXCEPT LAST) -------- */
    if (index !== patches.length - 1) {
      children.push(new PageBreak());
    }
  });

  return children;
}

/* ---------------- HELPERS ---------------- */

function metaRow(label: string, value: any) {
  return new TableRow({
    children: [
      metaCell(label, true),
      metaCell(String(value ?? "N/A")),
    ],
  });
}

function metaCell(text: string, bold = false) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: border(),
    children: [
      new Paragraph({
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

function imageCell(base64: string, caption: string) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: border(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: base64ToUint8Array(base64),
            transformation: {
              width: 260,
              height: 180,
            },
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [
          new TextRun({
            text: caption,
            size: 18,
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
