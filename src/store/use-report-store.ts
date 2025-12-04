import { create } from 'zustand';
import type { IdentifiedPatch } from '@/reporting/patch-detector';
import type { ReportMetadata } from '@/lib/types';

type CaptureFunctions = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface ReportState {
  // 3D View readiness
  captureFunctions: CaptureFunctions | null;
  is3dViewReady: boolean;
  setCaptureFunctions: (functions: { 
    capture: () => string; 
    focus: (x: number, y: number, zoomIn: boolean) => void; 
    resetCamera: () => void;
    setView: (view: 'iso' | 'top' | 'side') => void;
    isReady: boolean 
  }) => void;

  // Step 1: Screenshot Generation
  isGeneratingScreenshots: boolean;
  setIsGeneratingScreenshots: (isGenerating: boolean) => void;
  screenshotsReady: boolean;
  globalScreenshots: { iso: string, top: string, side: string } | null;
  patchScreenshots: Record<string, { iso: string, top: string }>;
  patches: IdentifiedPatch[];
  setScreenshotData: (data: { 
    global: { iso: string, top: string, side: string } | null; 
    patches: Record<string, { iso: string, top: string }>; 
    patchData: IdentifiedPatch[] 
  }) => void;

  // Step 2: Metadata Submission
  reportMetadata: ReportMetadata | null;
  detailsSubmitted: boolean;
  setReportMetadata: (metadata: ReportMetadata) => void;

  // Progress Tracking
  captureProgress: { current: number, total: number } | null;
  setCaptureProgress: (progress: { current: number, total: number } | null) => void;

  // Global reset
  resetReportState: () => void;
}

const initialState = {
  captureFunctions: null,
  is3dViewReady: false,
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
    setCaptureFunctions: (functions) => set({ 
      captureFunctions: { 
        capture: functions.capture, 
        focus: functions.focus, 
        resetCamera: functions.resetCamera,
        setView: functions.setView,
      },
      is3dViewReady: functions.isReady 
    }),
    setIsGeneratingScreenshots: (isGenerating) => set({ isGeneratingScreenshots: isGenerating }),
    setScreenshotData: (data) => set({
      globalScreenshots: data.global,
      patchScreenshots: data.patches,
      patches: data.patchData,
      screenshotsReady: !!data.global,
      isGeneratingScreenshots: false,
    }),
    setReportMetadata: (metadata) => set({
        reportMetadata: metadata,
        detailsSubmitted: true,
    }),
    setCaptureProgress: (progress) => set({ captureProgress: progress }),
    resetReportState: () => set(initialState),
  })
);
