import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import type { InspectionResult, AIInsight, InspectionDataPoint } from '@/lib/types';

export type ColorMode = 'mm' | '%';

interface InspectionState {
  inspectionResult: InspectionResult | null;
  setInspectionResult: (result: InspectionResult | null) => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: InspectionResult['aiInsight']) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
}

type PersistedState = Omit<InspectionState, 'setInspectionResult' | 'setIsLoading' | 'setSelectedPoint' | 'updateAIInsight' | 'setColorMode'> & {
  inspectionResult: Omit<InspectionResult, 'processedData'> | null;
};

const persistOptions: PersistOptions<InspectionState, PersistedState> = {
  name: 'sigma-corrosion-detective-storage',
  storage: createJSONStorage(() => localStorage),
  partialize: (state): PersistedState => {
    const { processedData, ...restOfResult } = state.inspectionResult || {};
    
    return {
      inspectionResult: state.inspectionResult ? restOfResult as Omit<InspectionResult, 'processedData'> : null,
      isLoading: false,
      selectedPoint: state.selectedPoint,
      colorMode: state.colorMode,
    };
  },
  merge: (persistedState, currentState) => {
    const pState = persistedState as PersistedState;
    return {
      ...currentState,
      ...pState,
      inspectionResult: pState.inspectionResult
        ? { ...pState.inspectionResult, processedData: [] } as InspectionResult
        : null,
    };
  },
};


export const useInspectionStore = create<InspectionState>()(
  persist(
    (set, get) => ({
      inspectionResult: null,
      isLoading: false,
      selectedPoint: null,
      colorMode: 'mm',
      setInspectionResult: (result) => set({ inspectionResult: result }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setSelectedPoint: (point) => set({ selectedPoint: point }),
      setColorMode: (mode) => set({ colorMode: mode }),
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
    persistOptions
  )
);
