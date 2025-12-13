import { Paragraph, HeadingLevel } from "docx";
import type { ReportInput } from "../types";

export function createInspectionSummary(input: ReportInput) {
  return [
    new Paragraph({
      text: "Inspection Summary",
      heading: HeadingLevel.HEADING_1,
    }),
    // Statistics table will go here
  ];
}
