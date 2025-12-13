import { SectionType, Paragraph, TextRun, AlignmentType } from "docx";
import type { ReportInput } from "../types";
import { HEADING_1, HEADING_2 } from "../styles";

export async function createCoverPage(assetInfo: ReportInput["assetInfo"]) {

  // In a real implementation, you might fetch a logo image here
  // const logo = await fetch("/logo.png").then(res => res.arrayBuffer());

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
    },
    children: [
      new Paragraph({
        text: "Corrosion Inspection Report",
        style: HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: " ", spacing: { after: 2000 } }),
      new Paragraph({
        children: [
          new TextRun({ text: "Asset Tag:", bold: true }),
          new TextRun({ text: `\t${assetInfo.assetTag}`, break: 1 }),
          new TextRun({ text: "Client:", bold: true }),
          new TextRun({ text: `\t\t${assetInfo.clientName}`, break: 1 }),
          new TextRun({ text: "Inspection Date:", bold: true }),
          new TextRun({ text: `\t${assetInfo.inspectionDate}`, break: 1 }),
          new TextRun({ text: "Method:", bold: true }),
          new TextRun({ text: `\t\t${assetInfo.method}`, break: 1 }),
        ],
        style: HEADING_2,
        alignment: AlignmentType.LEFT,
      }),
    ],
  };
}
