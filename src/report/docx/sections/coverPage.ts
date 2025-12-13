import { Paragraph, HeadingLevel } from "docx";
import type { ReportInput } from "../types";

export function buildCoverPage(input: ReportInput) {
  return [
    new Paragraph({
      text: "Corrosion Inspection Report",
      heading: HeadingLevel.HEADING_1,
    }),
    // Cover page content will go here
  ];
}
