import { config } from 'dotenv';
config();

import '@/ai/flows/generate-corrosion-insight.ts';
import '@/ai/flows/generate-report-summary.ts';
import '@/ai/flows/generate-patch-summary.ts';
import '@/ai/flows/generate-all-patch-summaries.ts';
