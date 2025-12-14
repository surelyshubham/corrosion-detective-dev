import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from "docx";

import {
  heading,
  spacer,
  embedImage,
  pageBreak,
  cell,
  COLORS,
  FONT,
} from "./docx-base";

/* -------------------------------------------------------------
   PATCH TABLE FOR A SINGLE PATCH
------------------------------------------------------------- */
export const buildPatchTable = (patch: any) => {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell([new Paragraph("Patch ID")]),
          cell([new Paragraph(`${patch.id}`)]),
        ],
      }),
      new TableRow({
        children: [
          cell([new Paragraph("Type")]),
          cell([new Paragraph(patch.type)]) // "Corrosion" or "ND"
        ],
      }),
      new TableRow({
        children: [
          cell([new Paragraph("Worst Thickness")]),
          cell([
            new Paragraph(
              patch.worstThickness != null
                ? `${patch.worstThickness.toFixed(2)} mm`
                : "N/A"
            ),
          ]),
        ],
      }),
      new TableRow({
        children: [
          cell([new Paragraph("Average Thickness")]),
          cell([
            new Paragraph(
              patch.avgThickness != null
                ? `${patch.avgThickness.toFixed(2)} mm`
                : "N/A"
            ),
          ]),
        ],
      }),
      new TableRow({
        children: [
          cell([new Paragraph("Size (Points)")]),
          cell([new Paragraph(`${patch.pointCount}`)]),
        ],
      }),
      new TableRow({
        children: [
          cell([new Paragraph("Coordinates")]),
          cell([
            new Paragraph(
              `X: ${patch.coordinates.xMin} → ${patch.coordinates.xMax}, ` +
                `Y: ${patch.coordinates.yMin} → ${patch.coordinates.yMax}`
            ),
          ]),
        ],
      }),
    ],
  });
};

/* -------------------------------------------------------------
   PATCH IMAGE GRID BUILDER (2×2 layout)
------------------------------------------------------------- */
export const buildPatchImageGrid = (patch: any) => {
  const { images } = patch;
  // expected: images = { img2D, imgIso, imgTop, imgSide }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell([embedImage(images.img2D, 250, 250)]),
          cell([embedImage(images.imgIso, 250, 250)]),
        ],
      }),
      new TableRow({
        children: [
          cell([embedImage(images.imgTop, 250, 250)]),
          cell([embedImage(images.imgSide, 250, 250)]),
        ],
      }),
    ],
  });
};

/* -------------------------------------------------------------
   CORROSION PATCH SECTION
------------------------------------------------------------- */
export const buildCorrosionPatchSection = (corrosionPatches: any[]) => {
  if (!corrosionPatches.length)
    return [
      heading("Corrosion Patches", 1),
      spacer(50),
      new Paragraph("No corrosion patches were detected in the scanned area."),
      pageBreak(),
    ];

  const sections: any[] = [];

  sections.push(heading("Corrosion Patches", 1));
  sections.push(spacer(50));

  corrosionPatches.forEach((p, index) => {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Patch ${p.id} (Severity: ${p.tier})`,
            bold: true,
            size: 32,
            font: FONT.header,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    // Patch table
    sections.push(buildPatchTable(p));
    sections.push(spacer(100));

    // Patch images
    sections.push(buildPatchImageGrid(p));
    sections.push(spacer(200));

    sections.push(pageBreak());
  });

  return sections;
};

/* -------------------------------------------------------------
   ND PATCH SECTION
------------------------------------------------------------- */
export const buildNDPatchSection = (ndPatches: any[]) => {
  if (!ndPatches.length)
    return [
      heading("Non-Inspected (ND) Patches", 1),
      spacer(50),
      new Paragraph("No ND areas were detected."),
      pageBreak(),
    ];

  const sections: any[] = [];

  sections.push(heading("Non-Inspected (ND) Patches", 1));
  sections.push(spacer(50));

  ndPatches.forEach((p) => {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `ND Patch ${p.id}`,
            bold: true,
            size: 32,
            font: FONT.header,
          }),
        ],
        spacing: { after: 200 },
      })
    );

    sections.push(buildPatchTable(p));
    sections.push(spacer(80));

    // ND areas may not have valid thickness, but still show image layout
    sections.push(buildPatchImageGrid(p));
    sections.push(spacer(200));

    sections.push(pageBreak());
  });

  return sections;
};

/* -------------------------------------------------------------
   CONCLUSION PAGE
------------------------------------------------------------- */
export const buildConclusionPage = (inputs: {
  minPercentage: number;
  condition: string; // "Healthy", "Moderate", "Severe", "Critical"
}) => {
  const { minPercentage, condition } = inputs;

  let conclusionText = "Based on the analysed dataset, the overall condition is considered ";

  if (condition === "Healthy") {
    conclusionText +=
      "HEALTHY. The minimum wall thickness percentage is within safe limits.";
  } else if (condition === "Moderate") {
    conclusionText +=
      "MODERATE. Some thinning is observed but does not pose immediate risk.";
  } else if (condition === "Severe") {
    conclusionText +=
      "SEVERE. Significant wall loss detected. Inspection team should consider repair planning.";
  } else if (condition === "Critical") {
    conclusionText +=
      "CRITICAL. Extreme thinning or heavy corrosion observed. Immediate action is recommended.";
  }

  return [
    heading("Conclusion", 1),
    spacer(40),

    new Paragraph({
      children: [
        new TextRun({
          text: `Overall Condition: ${condition}`,
          bold: true,
          size: 32,
          font: FONT.header,
          color: COLORS.primary,
        }),
      ],
      spacing: { after: 200 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: `Minimum Remaining Thickness Percentage: ${minPercentage.toFixed(
            2
          )}%`,
          size: 26,
          font: FONT.body,
        }),
      ],
      spacing: { after: 200 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: conclusionText,
          size: 24,
          font: FONT.body,
        }),
      ],
    }),

    pageBreak(),
  ];
};
