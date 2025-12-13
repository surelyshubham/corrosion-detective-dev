import {
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ImageRun,
  BorderStyle,
} from "docx";
import type { ReportInput } from "../types";
import { base64ToUint8Array } from "../utils";

/**
 * Builds Asset Overview section:
 * - Full 2D + 3D images
 * - Optional Top & Side views
 * - AI Insight box
 */
export function buildAssetOverview(input: ReportInput) {
  const children: any[] = [];

  /* -------------------- TITLE -------------------- */
  children.push(
    new Paragraph({
      text: "Asset Overview",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    })
  );

  /* -------------------- FULL ASSET IMAGES (2D + ISO) -------------------- */
  children.push(
    new Paragraph({
      text: "Overall Plate Views",
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 200 },
    })
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            imageCell(input.fullAssetImages.view2D, "Full Plate 2D Thickness Map"),
            imageCell(input.fullAssetImages.view3DIso, "Full Plate 3D Isometric View"),
          ],
        }),
      ],
    })
  );

  /* -------------------- OPTIONAL TOP & SIDE VIEWS -------------------- */
  if (input.fullAssetImages.view3DTop && input.fullAssetImages.view3DSide) {
    children.push(
      new Paragraph({ text: "", spacing: { after: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              imageCell(input.fullAssetImages.view3DTop, "3D Top View"),
              imageCell(input.fullAssetImages.view3DSide, "3D Side View"),
            ],
          }),
        ],
      })
    );
  }

  /* -------------------- AI INSIGHT BOX -------------------- */
  children.push(
    new Paragraph({
      text: "AI-Based Inspection Insight",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 150 },
    })
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: "F2F2F2" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: input.aiSummary,
                      italics: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  return children;
}

/* -------------------- HELPERS -------------------- */

function imageCell(base64: string, caption: string) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: base64ToUint8Array(base64),
            transformation: {
              width: 320,
              height: 220,
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
