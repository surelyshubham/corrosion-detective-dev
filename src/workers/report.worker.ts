import { generateInspectionReport } from '../report/docx/ReportBuilder';
import type { ReportInput } from '../report/docx/types';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'GENERATE_REPORT_DATA') {
    try {
      // This worker now only handles data preparation, not DOCX generation
      self.postMessage({ type: 'PROGRESS', stage: 'Preparing report data...', percent: 25 });
      
      // In a real scenario, you might do heavy data-only prep here.
      // For now, we assume the main thread has already done this.
      // The payload IS the reportInput data.

      self.postMessage({ type: 'DATA_READY', reportInput: payload });

    } catch (error: any) {
      console.error('Error in report worker (data prep):', error);
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
};

export {};
