
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

/**
 * Builds Corrosion Patch Details section
 */
export function buildCorrosionPatches(patches: EnrichedPatch[]) {
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

  const imagePatches = patches.filter(p => p.representation === 'IMAGE');
  const tableOnlyPatches = patches.filter(p => p.representation === 'TABLE_ONLY');

  // Add note about micro-patches
  if (tableOnlyPatches.length > 0) {
    children.push(new Paragraph({
        spacing: { after: 300 },
        children: [new TextRun({
            text: "Small corrosion patches consisting of limited data points ('micro-patches') are documented in the summary table below. Graphical representations are omitted due to their limited spatial extent.",
            italics: true,
            size: 18,
        })]
    }));
  }

  // Build table for micro-patches first
  if (tableOnlyPatches.length > 0) {
    const microPatchRows = tableOnlyPatches.flatMap(p => 
        p.cells?.map(cell => new TableRow({
            children: [
                tableCell(p.patchId),
                tableCell(p.meta.severity),
                tableCell(`${cell.x},${cell.y}`),
                tableCell(cell.effectiveThickness?.toFixed(2) ?? 'N/A'),
            ]
        })) || []
    );

    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    headerCell("Patch ID"),
                    headerCell("Severity"),
                    headerCell("Coords (X,Y)"),
                    headerCell("Thickness (mm)"),
                ]
            }),
            ...microPatchRows
        ]
    }));
  }
  
  if (imagePatches.length > 0 && tableOnlyPatches.length > 0) {
    children.push(new PageBreak());
  }

  // Build full page sections for larger patches
  imagePatches.forEach((patch, index) => {
    /* -------- PATCH HEADER -------- */
    children.push(
      new Paragraph({
        text: `Patch ID: ${patch.patchId}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 },
      })
    );

    /* -------- METADATA TABLE -------- */
    const { meta } = patch;
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [35, 65],
        rows: [
          metaRow("Patch Type", "Corrosion"),
          metaRow("Severity", meta.severity),
          metaRow("Location (X Range)", meta.xRange),
          metaRow("Location (Y Range)", meta.yRange),
          metaRow("Area (Points)", meta.area),
          metaRow("Minimum Thickness", `${meta.minThickness} mm`),
        ],
      })
    );

    /* -------- IMAGE GRID (2 × 2) -------- */
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    
    children.push(
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
            new TableRow({
                children: [
                    imageCell(patch.images?.view2D, "2D Patch View"),
                    imageCell(patch.images?.view3DTop, "3D Top View"),
                ],
            }),
            new TableRow({
                children: [
                    imageCell(patch.images?.view3DSide, "3D Side View"),
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

function tableCell(text: string | undefined) {
    return new TableCell({
        borders: border(),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: text ?? 'N/A', size: 20 })]})]
    });
}

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
