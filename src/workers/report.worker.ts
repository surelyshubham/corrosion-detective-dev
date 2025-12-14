
import { generateInspectionReport } from '../report/docx/ReportBuilder';
import type { ReportInput } from '../report/docx/types';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'GENERATE_REPORT') {
    try {
      const reportInput = payload as ReportInput;
      
      // The generateInspectionReport function in this context is just the DOCX packer.
      // The heavy data processing (patch analysis, etc.) is assumed to have happened
      // on the main thread before this worker was called. This worker's main job
      // is to prevent the UI from freezing during the synchronous Packer.toBlob() call.
      
      self.postMessage({ type: 'PROGRESS', stage: 'Assembling DOCX structure...', percent: 50 });
      
      const blob = await generateInspectionReport(reportInput);
      
      self.postMessage({ type: 'PROGRESS', stage: 'Finalizing file...', percent: 100 });
      
      self.postMessage({ type: 'DONE', reportBlob: blob }, [blob]);
      
    } catch (error: any) {
      console.error('Error in report worker:', error);
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
};

export {};

    