
'use server';
/**
 * @fileOverview A Genkit flow to generate a summary for a specific corrosion patch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { SegmentBox } from '@/lib/types';


export interface PatchAiInput {
  patchId: number;
  // sizeMm: { width: number; height: number };
  minThickness: number;
  avgThickness: number;
  minPercentage: number;
  pointCount: number;
}


export async function generatePatchInsight(
  input: PatchAiInput,
): Promise<string> {
  try {

    const { patchId, minThickness, avgThickness, minPercentage } = input;
    const loss = 100 - minPercentage;

    return (
      `Patch #${patchId} shows a minimum remaining wall of ` +
      `${minThickness.toFixed(2)} mm and an average of ${avgThickness.toFixed(
        2,
      )} mm. Local wall loss is approximately ${loss.toFixed(
        1,
      )}%. ` +
      `Recommended: schedule targeted repair and re-check this location in the next maintenance window.`
    );
  } catch (err) {
    console.error('generatePatchInsight failed', err);
    return 'Unable to generate AI observation for this patch. Please review thickness and location manually.';
  }
}


const PatchSummaryInputSchema = z.object({
    patchId: z.number().describe('The ID of the corrosion patch.'),
    xMin: z.number(),
    xMax: z.number(),
    yMin: z.number(),
    yMax: z.number(),
    patchArea: z.string(),
    minThickness: z.string(),
    avgThickness: z.string(),
    severity: z.string(),
    nominalThickness: z.number().describe('The nominal thickness of the asset in mm.'),
    assetType: z.string().describe('The type of asset, e.g., "Pipe" or "Tank".'),
    defectThreshold: z.number().describe('The user-defined threshold for what constitutes a critical defect.')
});


const PatchSummaryOutputSchema = z.object({
  summary: z.string().describe('A concise, professional summary of the patch condition, location, severity, and a recommendation. Use NDT-style language.')
});

export async function generatePatchSummary(
    patch: SegmentBox, 
    nominalThickness: number, 
    assetType: string,
    defectThreshold: number,
): Promise<string> {
    const input = {
        patchId: patch.id,
        xMin: patch.coordinates.xMin,
        xMax: patch.coordinates.xMax,
        yMin: patch.coordinates.yMin,
        yMax: patch.coordinates.yMax,
        patchArea: "N/A", // This data is not available on SegmentBox
        minThickness: patch.worstThickness.toFixed(2),
        avgThickness: patch.avgThickness.toFixed(2),
        severity: patch.tier,
        nominalThickness,
        assetType,
        defectThreshold,
    };
    const result = await patchSummaryFlow(input);
    return result.summary;
}

const prompt = ai.definePrompt({
    name: 'patchSummaryPrompt',
    input: { schema: PatchSummaryInputSchema },
    output: { schema: PatchSummaryOutputSchema },
    prompt: `You are an expert NDT analyst. Generate a concise engineering summary for the provided corrosion patch data.
The user has defined the critical defect threshold at {{defectThreshold}}% remaining thickness.
Focus on corrosion severity, remaining thickness, patch location, and a clear recommendation. Use professional, direct NDT-style language.

Example Output:
"Corrosion Patch #{{patchId}} shows significant localized thinning around X={{xMin}}-{{xMax}} / Y={{yMin}}-{{yMax}}. Minimum thickness is {{minThickness}}mm. Recommended immediate localized repair and monitoring."

Data:
- Patch ID: {{patchId}}
- Asset Type: {{{assetType}}}
- Nominal Thickness: {{{nominalThickness}}}mm
- Patch Bounding Box: X={{xMin}}-{{xMax}}, Y={{yMin}}-{{yMax}}
- Patch Area: {{patchArea}}mm²
- Minimum Thickness in Patch: {{minThickness}}mm
- Average Thickness in Patch: {{avgThickness}}mm
- Severity: {{severity}}

Generate the summary now.`,
});


const patchSummaryFlow = ai.defineFlow(
  {
    name: 'patchSummaryFlow',
    inputSchema: PatchSummaryInputSchema,
    outputSchema: PatchSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
