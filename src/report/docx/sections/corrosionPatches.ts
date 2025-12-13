import { Paragraph, HeadingLevel } from "docx";
import type { PatchImageSet } from "../types";

export function createCorrosionPatchesSection(patches: PatchImageSet[]) {
  return [
    new Paragraph({
      text: "Corrosion Patch Details",
      heading: HeadingLevel.HEADING_1,
    }),
    // Loop over patches and create a section for each
  ];
}
