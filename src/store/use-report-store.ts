import { create } from 'zustand';
import type { IdentifiedPatch } from '@/reporting/patch-detector';
import type { ReportMetadata } from '@/lib/types';

type CaptureFunctions = {
  capture: () => string;
  focus: (x: number, y: number) => void;
  resetCamera: () => void;
};

interface ReportState {
  // 3D View readiness
  captureFunctions: CaptureFunctions | null;
  is3dViewReady: boolean;
  setCaptureFunctions: (functions: { capture: () => string; focus: (x: number, y: number) => void; resetCamera: () => void; isReady: boolean }) => void;

  // Step 1: Screenshot Generation
  isGeneratingScreenshots: boolean;
  setIsGeneratingScreenshots: (isGenerating: boolean) => void;
  screenshotsReady: boolean;
  overviewScreenshot: string | null;
  patchScreenshots: Record<string, string>;
  patches: IdentifiedPatch[];
  setScreenshotData: (data: { overview: string | null; patches: Record<string, string>, patchData: IdentifiedPatch[] }) => void;

  // Step 2: Metadata Submission
  reportMetadata: ReportMetadata | null;
  detailsSubmitted: boolean;
  setReportMetadata: (metadata: ReportMetadata) => void;

  // Global reset
  resetReportState: () => void;
}

const initialState = {
  captureFunctions: null,
  is3dViewReady: false,
  isGeneratingScreenshots: false,
  screenshotsReady: false,
  overviewScreenshot: null,
  patchScreenshots: {},
  patches: [],
  reportMetadata: null,
  detailsSubmitted: false,
};

export const useReportStore = create<ReportState>()(
  (set) => ({
    ...initialState,
    setCaptureFunctions: (functions) => set({ 
      captureFunctions: { capture: functions.capture, focus: functions.focus, resetCamera: functions.resetCamera },
      is3dViewReady: functions.isReady 
    }),
    setIsGeneratingScreenshots: (isGenerating) => set({ isGeneratingScreenshots: isGenerating }),
    setScreenshotData: (data) => set({
      overviewScreenshot: data.overview,
      patchScreenshots: data.patches,
      patches: data.patchData,
      screenshotsReady: !!data.overview,
      isGeneratingScreenshots: false,
    }),
    setReportMetadata: (metadata) => set({
        reportMetadata: metadata,
        detailsSubmitted: true,
    }),
    resetReportState: () => set(initialState),
  })
);
