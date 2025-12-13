import { SectionType, Paragraph } from "docx";

export function createLegend() {
  // Placeholder for legend section
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
    },
    children: [new Paragraph("Legend Section - To be implemented")],
  };
}
