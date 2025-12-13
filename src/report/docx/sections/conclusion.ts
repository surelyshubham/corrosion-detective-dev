import {
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type { ReportInput } from "../types";

export function buildConclusion(input: ReportInput) {
  const { stats, aiSummary } = input;

  let recommendation = "Continue routine monitoring as per inspection schedule.";

  if (stats.minPercentage < 60) {
    recommendation =
      "Immediate repair or detailed follow-up inspection is strongly recommended.";
  } else if (stats.minPercentage < 70) {
    recommendation =
      "Repair planning and closer monitoring are recommended.";
  } else if (stats.minPercentage < 80) {
    recommendation =
      "Monitor affected regions during the next inspection cycle.";
  }

  return [
    new Paragraph({
      text: "Conclusion & Recommendations",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text:
            aiSummary ??
            "Based on the inspection data, the overall condition of the asset has been evaluated considering minimum thickness, corrosion distribution, and non-inspected regions.",
        }),
      ],
      spacing: { after: 200 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: "Overall Condition: ",
          bold: true,
        }),
        new TextRun({
          text: stats.condition,
        }),
      ],
      spacing: { after: 150 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: "Recommendation: ",
          bold: true,
        }),
        new TextRun({
          text: recommendation,
        }),
      ],
      spacing: { after: 300 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text:
            "This report is generated based on available inspection data. Non-inspected areas should be considered while making integrity management decisions.",
          italics: true,
        }),
      ],
    }),
  ];
}
