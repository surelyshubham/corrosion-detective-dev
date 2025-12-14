
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
  if (!patches || patches.length === 0) {
    return [
      new Paragraph({
        text: "Corrosion Patch Details",
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
      }),
      new Paragraph("No corrosion patches were identified in this inspection."),
    ];
  }

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
        columnWidths: [35, 65],
        rows: [
          metaRow("Patch Type", "Corrosion"),
          metaRow("Location (X Range)", patch.meta.xRange),
          metaRow("Location (Y Range)", patch.meta.yRange),
          metaRow("Area (Points)", patch.meta.area),
          metaRow("Minimum Thickness", `${patch.meta.minThickness} mm`),
          metaRow("Average Thickness", `${patch.meta.avgThickness} mm`),
          metaRow("Severity", patch.meta.severity),
        ],
      })
    );

    /* -------- IMAGE GRID (2 × 2) -------- */
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    
    if (patch.images) {
        children.push(
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
    }


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
            size: 20
          }),
        ],
      }),
    ],
  });
}

function imageCell(base64?: string, caption?: string) {
  const children = [];
  const imageData = base64 ? base64ToUint8Array(base64) : null;

  if (imageData) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: imageData,
          transformation: {
            width: 280,
            height: 200,
          },
        }),
      ],
    }));
  } else {
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        text: "Image not available"
    }));
  }

  if (caption) {
     children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [
          new TextRun({
            text: caption,
            size: 18,
            italics: true
          }),
        ],
      }));
  }
  
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: border(),
    children,
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
