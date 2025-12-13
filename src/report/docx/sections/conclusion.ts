import { Paragraph, HeadingLevel } from "docx";
import type { ReportInput } from "../types";

export function createConclusion(input: ReportInput) {
  return [
    new Paragraph({
      text: "Conclusion",
      heading: HeadingLevel.HEADING_1,
    }),
    // AI-generated + rule-based recommendations will go here
  ];
}
