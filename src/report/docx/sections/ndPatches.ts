import { Paragraph, HeadingLevel } from "docx";
import type { PatchImageSet } from "../types";

export function createNdPatchesSection(patches: PatchImageSet[]) {
    if (patches.length === 0) return [];
  return [
    new Paragraph({
      text: "Non-Inspected Area Details",
      heading: HeadingLevel.HEADING_1,
    }),
    // Loop over ND patches and create a section for each
  ];
}
