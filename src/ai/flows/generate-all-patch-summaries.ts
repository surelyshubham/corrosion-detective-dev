'use server';
/**
 * @fileOverview A Genkit flow to generate summaries for all corrosion patches in a single batch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Schema for a single patch's input data
const PatchInputSchema = z.object({
    patchId: z.number().describe('The ID of the corrosion patch.'),
    minThickness: z.string(),
    severity: z.string(),
    xMin: z.number(),
    xMax: z.number(),
    yMin: z.number(),
    yMax: z.number(),
});

// Schema for the overall flow input
const AllPatchesInputSchema = z.object({
  patches: z.array(PatchInputSchema),
  assetType: z.string().describe('The type of asset, e.g., "Pipe" or "Tank".'),
  nominalThickness: z.number().describe('The nominal thickness of the asset in mm.'),
  defectThreshold: z.number().describe('The user-defined threshold for what constitutes a critical defect.'),
});
export type AllPatchesInput = z.infer<typeof AllPatchesInputSchema>;

// Schema for a single patch's output summary
const PatchSummaryOutputSchema = z.object({
    patchId: z.number().describe('The ID of the patch this summary corresponds to.'),
    summary: z.string().describe('A concise, professional summary of the patch condition, location, severity, and a recommendation. Use NDT-style language.'),
});

// Schema for the overall flow output
const AllPatchesOutputSchema = z.object({
  summaries: z.array(PatchSummaryOutputSchema),
});
export type AllPatchesOutput = z.infer<typeof AllPatchesOutputSchema>;

export async function generateAllPatchSummaries(input: AllPatchesInput): Promise<AllPatchesOutput> {
  return allPatchSummariesFlow(input);
}

const prompt = ai.definePrompt({
    name: 'allPatchesSummaryPrompt',
    input: { schema: AllPatchesInputSchema },
    output: { schema: AllPatchesOutputSchema },
    prompt: `You are an expert NDT analyst. For each corrosion patch provided in the 'patches' array, generate a concise engineering summary.
The user has defined the critical defect threshold at {{defectThreshold}}% remaining thickness.
For each summary, focus on the corrosion severity, remaining thickness, patch location, and a clear recommendation. Use professional, direct NDT-style language.

Example Output for a single patch:
"Corrosion Patch #1 shows significant localized thinning around X=10-20 / Y=30-40. Minimum thickness is 2.50mm. Recommended immediate localized repair and monitoring."

Asset Type: {{{assetType}}}
Nominal Thickness: {{{nominalThickness}}}mm

Generate a summary for EACH of the following patches:
{{#each patches}}
- Patch ID: {{patchId}}
  - Bounding Box: X={{xMin}}-{{xMax}}, Y={{yMin}}-{{yMax}}
  - Minimum Thickness in Patch: {{minThickness}}mm
  - Severity: {{severity}}
{{/each}}

Return the response as a JSON object with a 'summaries' array, where each element contains the 'patchId' and its corresponding 'summary'.`,
});


const allPatchSummariesFlow = ai.defineFlow(
  {
    name: 'allPatchSummariesFlow',
    inputSchema: AllPatchesInputSchema,
    outputSchema: AllPatchesOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
