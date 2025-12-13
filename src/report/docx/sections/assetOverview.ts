import { Paragraph, HeadingLevel } from "docx";
import type { ReportInput } from "../types";

export function createAssetOverview(input: ReportInput) {
  return [
    new Paragraph({
      text: "Asset Overview",
      heading: HeadingLevel.HEADING_1,
    }),

    // Image grid will go here (2D + 3D)
    // AI Insight box will go here
  ];
}
