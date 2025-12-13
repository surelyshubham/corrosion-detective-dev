'use server';
/**
 * @fileOverview A Genkit flow to generate a narrative summary for the entire inspection report.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { MergedInspectionResult } from '@/lib/types';
import type { SegmentBox } from '@/lib/types';

const ReportSummaryInputSchema = z.object({
  assetType: z.string(),
  nominalThickness: z.number(),
  minThickness: z.string(),
  minPercentage: z.string(),
  scannedArea: z.string(),
  patchCount: z.number(),
  overallCondition: z.string(),
  defectThreshold: z.number(),
});

const ReportSummaryOutputSchema = z.object({
  summary: z.string().describe('A narrative summary for the report\'s first page. It should be a professional, high-level overview of the inspection findings.')
});

export async function generateReportSummary(inspection: MergedInspectionResult, patches: SegmentBox[], defectThreshold: number): Promise<string> {
  const input = {
      assetType: inspection.assetType,
      nominalThickness: inspection.nominalThickness,
      minThickness: inspection.stats.minThickness.toFixed(2),
      minPercentage: inspection.stats.minPercentage.toFixed(1),
      scannedArea: inspection.stats.scannedArea.toFixed(2),
      patchCount: patches.length,
      overallCondition: inspection.condition,
      defectThreshold,
  };
  const result = await reportSummaryFlow(input);
  return result.summary;
}

const prompt = ai.definePrompt({
  name: 'reportSummaryPrompt',
  input: { schema: ReportSummaryInputSchema },
  output: { schema: ReportSummaryOutputSchema },
  prompt: `You are an expert NDT analyst. Generate a professional, high-level narrative summary for the first page of an inspection report based on the provided data.

Focus on the overall condition, the number of critical findings based on the user's threshold, and the most severe reading. Do not go into extreme detail on each patch.

Data:
- Asset Type: {{assetType}}
- Nominal Thickness: {{nominalThickness}}mm
- Minimum Thickness Found: {{minThickness}}mm ({{minPercentage}}% of nominal)
- Total Scanned Area: {{scannedArea}} m²
- Number of Defect Patches (<{{defectThreshold}}%): {{patchCount}}
- Overall Condition Assessment: {{overallCondition}}

Generate a concise summary suitable for a customer report.
Example: "The inspection of the {{assetType}} revealed a total of {{patchCount}} critical corrosion patches with wall thickness below {{defectThreshold}}% of nominal. The most severe finding was a measurement of {{minThickness}}mm. The overall condition is rated as {{overallCondition}}."
`,
});

const reportSummaryFlow = ai.defineFlow(
  {
    name: 'reportSummaryFlow',
    inputSchema: ReportSummaryInputSchema,
    outputSchema: ReportSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
