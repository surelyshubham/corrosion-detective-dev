import { SectionType, Paragraph } from "docx";
import type { ReportInput } from "../types";

export function createNdPatchesSection(patches: ReportInput["ndPatches"]) {
  // Placeholder for ND patches section
  return {
    properties: {
      type: SectionType.NEXT_PAGE,
    },
    children: [new Paragraph("ND Patches Section - To be implemented")],
  };
}
