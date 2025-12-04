
import { create } from 'zustand';
import type { IdentifiedPatch } from '@/reporting/patch-detector';
import type { ReportMetadata } from '@/lib/types';

interface ReportState {
  // Step 1: Configuration
  defectThreshold: number;
  setDefectThreshold: (threshold: number) => void;
  isThresholdLocked: boolean;
  setIsThresholdLocked: (isLocked: boolean) => void;

  // Step 2: Screenshot Generation
  isGeneratingScreenshots: boolean;
  setIsGeneratingScreenshots: (isGenerating: boolean) => void;
  screenshotsReady: boolean;
  globalScreenshots: { iso: string, top: string, side: string } | null;
  patchScreenshots: Record<string, { iso: string, top: string }>;
  patches: IdentifiedPatch[];
  setPatches: (patches: IdentifiedPatch[]) => void;
  setScreenshotData: (data: { 
    global: { iso: string, top: string, side: string } | null; 
    patches: Record<string, { iso: string, top: string }>; 
  }) => void;

  // Step 3: Metadata Submission
  reportMetadata: Omit<ReportMetadata, 'defectThreshold'> | null;
  detailsSubmitted: boolean;
  setReportMetadata: (metadata: Omit<ReportMetadata, 'defectThreshold'>) => void;

  // Progress Tracking
  captureProgress: { current: number, total: number } | null;
  setCaptureProgress: (progress: { current: number, total: number } | null) => void;

  // Global reset
  resetReportState: () => void;
}

const initialState = {
  defectThreshold: 50,
  isThresholdLocked: false,
  isGeneratingScreenshots: false,
  screenshotsReady: false,
  globalScreenshots: null,
  patchScreenshots: {},
  patches: [],
  reportMetadata: null,
  detailsSubmitted: false,
  captureProgress: null,
};

export const useReportStore = create<ReportState>()(
  (set) => ({
    ...initialState,
    setDefectThreshold: (threshold) => set({ defectThreshold: threshold }),
    setIsThresholdLocked: (isLocked) => {
        set({ isThresholdLocked: isLocked });
        // When unlocking, reset the subsequent steps
        if (!isLocked) {
            set({
                screenshotsReady: false,
                globalScreenshots: null,
                patchScreenshots: {},
                detailsSubmitted: false,
                reportMetadata: null,
            });
        }
    },
    setIsGeneratingScreenshots: (isGenerating) => set({ isGeneratingScreenshots: isGenerating }),
    setPatches: (patches) => set({ patches }),
    setScreenshotData: (data) => set({
      globalScreenshots: data.global,
      patchScreenshots: data.patches,
      screenshotsReady: !!data.global,
      isGeneratingScreenshots: false, // Ensure this is turned off on completion
      captureProgress: null,
    }),
    setReportMetadata: (metadata) => set({
        reportMetadata: metadata,
        detailsSubmitted: true,
    }),
    setCaptureProgress: (progress) => set({ captureProgress: progress }),
    resetReportState: () => set(initialState),
  })
);

    