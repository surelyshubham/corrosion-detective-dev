import { create } from 'zustand';

type CaptureFunctions = {
  capture: () => string;
  focus: (x: number, y: number) => void;
};

interface ReportState {
  captureFunctions: CaptureFunctions | null;
  isReady: boolean;
  setCaptureFunctions: (functions: { capture: () => string; focus: (x: number, y: number) => void; isReady: boolean }) => void;
}

export const useReportStore = create<ReportState>()(
  (set) => ({
    captureFunctions: null,
    isReady: false,
    setCaptureFunctions: (functions) => set({ 
      captureFunctions: { capture: functions.capture, focus: functions.focus },
      isReady: functions.isReady 
    }),
  })
);
