

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
import type { EnrichedPatch } from "../types";
import { base64ToUint8Array } from "../utils";

export const MIN_CELLS_FOR_VISUALIZATION = 20;

/**
 * Builds Corrosion Patch Details section
 */
export function buildCorrosionPatches(patches: EnrichedPatch[], nominalThickness: number) {
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
  const imagePatches = patches.filter(p => p.meta.area >= MIN_CELLS_FOR_VISUALIZATION);
  
  /* ---------------- SUMMARY TABLE ---------------- */
  children.push(
    new Paragraph({
      text: "Corrosion Patch Summary",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    })
  );

  const summaryRows = patches.map(p => {
    const wallLoss = (nominalThickness && typeof p.meta.minThickness === 'number') 
      ? ((nominalThickness - p.meta.minThickness) / nominalThickness) * 100
      : 0;

    return new TableRow({
        children: [
            tableCell(p.patchId),
            tableCell(`${p.meta.xRange}, ${p.meta.yRange}`),
            tableCell(p.meta.minThickness),
            tableCell(wallLoss, 1),
        ]
    })
  });

  children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
          new TableRow({
              children: [
                  headerCell("Patch ID"),
                  headerCell("Location (X, Y)"),
                  headerCell("Min Thickness (mm)"),
                  headerCell("Max Wall Loss (%)"),
              ]
          }),
          ...summaryRows
      ]
  }));
  
  if (imagePatches.length > 0) {
    children.push(new PageBreak());
  }

  // Build full page sections for larger patches
  imagePatches.forEach((patch, index) => {
    /* -------- PATCH HEADER -------- */
    children.push(
      new Paragraph({
        text: `Corrosion Patch Detail: ${patch.patchId}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 300 },
      })
    );

    /* -------- IMAGE GRID (2D + ISO) -------- */
    children.push(
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                  children: [
                      imageCell(patch.images?.view2D, "2D Patch View"),
                      imageCell(patch.images?.view3DIso, "3D Isometric View"),
                  ],
              }),
            ],
        })
    );


    /* -------- PAGE BREAK (EXCEPT LAST) -------- */
    if (index !== imagePatches.length - 1) {
      children.push(new PageBreak());
    }
  });

  return children;
}

/* ---------------- HELPERS ---------------- */

function headerCell(text: string) {
  return new TableCell({
    borders: border(),
    shading: { fill: "EAEAEA" },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 20 })] })]
  });
}

function tableCell(text: string | number | undefined | null, precision = 2) {
    let displayText = 'N/A';
    if (typeof text === 'number') {
        displayText = text.toFixed(precision);
    } else if (typeof text === 'string') {
        displayText = text;
    }

    return new TableCell({
        borders: border(),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: displayText, size: 20 })]})]
    });
}

function imageCell(base64?: string, caption?: string) {
  const children = [];
  const imageData = base64ToUint8Array(base64);

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
        spacing: {before: 1000, after: 1000},
        children: [new TextRun({ text: "Image not available", italics: true, color: "888888" })]
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
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
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
