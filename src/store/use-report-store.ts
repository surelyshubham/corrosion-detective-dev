
import { create } from 'zustand';
import type { ReportMetadata } from '@/lib/types';

interface ReportImages {
  fullModel3D?: string;
  fullHeatmap2D?: string;
  segmentShots?: { segmentId: number; imageDataUrl: string }[];
}

interface ReportState {
  // Step 1: Configuration
  defectThreshold: number;
  setDefectThreshold: (threshold: number) => void;
  isThresholdLocked: boolean;
  setIsThresholdLocked: (isLocked: boolean) => void;

  // Step 2: Screenshot Generation
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
  reportImages: ReportImages;
  setReportImages: (images: ReportImages) => void;

  // Step 3: Metadata Submission
  reportMetadata: Omit<ReportMetadata, 'defectThreshold'> | null;
  detailsSubmitted: boolean;
  setReportMetadata: (metadata: Omit<ReportMetadata, 'defectThreshold'>) => void;

  // Progress Tracking
  generationProgress: { current: number, total: number, task: string } | null;
  setGenerationProgress: (progress: { current: number, total: number, task: string } | null) => void;

  // Global reset
  resetReportState: () => void;
}

const initialState = {
  defectThreshold: 80,
  isThresholdLocked: false,
  isGenerating: false,
  reportImages: {},
  reportMetadata: null,
  detailsSubmitted: false,
  generationProgress: null,
};

export const useReportStore = create<ReportState>()(
  (set) => ({
    ...initialState,
    setDefectThreshold: (threshold) => set({ defectThreshold: threshold }),
    setIsThresholdLocked: (isLocked) => {
        set({ isThresholdLocked: isLocked });
        if (!isLocked) {
            set({
                reportImages: {},
                detailsSubmitted: false,
                reportMetadata: null,
            });
        }
    },
    setIsGenerating: (isGenerating) => set({ isGenerating: isGenerating }),
    setReportImages: (images) => set({
      reportImages: images,
      isGenerating: false,
      generationProgress: null,
    }),
    setReportMetadata: (metadata) => set({
        reportMetadata: metadata,
        detailsSubmitted: true,
    }),
    setGenerationProgress: (progress) => set({ generationProgress: progress }),
    resetReportState: () => set(initialState),
  })
);
