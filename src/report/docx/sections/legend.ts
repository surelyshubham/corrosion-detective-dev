import { Paragraph, HeadingLevel } from "docx";

export function createLegend() {
  return [
    new Paragraph({
      text: "Legend",
      heading: HeadingLevel.HEADING_1,
    }),
    // Legend table/image will go here
  ];
}
