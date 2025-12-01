import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InspectionResult, AssetType } from '@/lib/types';

interface InspectionState {
  inspectionResult: InspectionResult | null;
  setInspectionResult: (result: InspectionResult | null) => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: InspectionResult['aiInsight']) => void;
}

export const useInspectionStore = create<InspectionState>()(
  persist(
    (set, get) => ({
      inspectionResult: null,
      isLoading: false,
      selectedPoint: null,
      setInspectionResult: (result) => set({ inspectionResult: result }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setSelectedPoint: (point) => set({ selectedPoint: point }),
      updateAIInsight: (aiInsight) => {
        const currentResult = get().inspectionResult;
        if (currentResult) {
          set({
            inspectionResult: {
              ...currentResult,
              aiInsight,
            },
          });
        }
      },
    }),
    {
      name: 'sigma-corrosion-detective-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
