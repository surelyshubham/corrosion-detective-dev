
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
 * - Full 2D Heatmap
 * - Full 3D Isometric View
 */
export function buildAssetOverview(input: ReportInput) {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "Overall Asset Thickness Mapping",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    })
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            imageCell(input.fullAssetImages.view2D, "Full Asset 2D Heatmap"),
            imageCell(input.fullAssetImages.view3DIso, "Full Asset 3D Isometric View"),
          ],
        }),
      ],
    })
  );

  return children;
}


function imageCell(base64: string, caption: string) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
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
            italics: true,
          }),
        ],
      }),
    ],
  });
}
