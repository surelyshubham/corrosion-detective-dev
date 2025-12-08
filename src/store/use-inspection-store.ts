
"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid } from '@/lib/types';
import { DataVault } from './data-vault';

export interface WorkerOutput {
  type: 'PROGRESS' | 'DONE' | 'ERROR';
  message?: string;
  progress?: number;
  displacementBuffer?: Float32Array;
  colorBuffer?: Uint8Array;
  gridMatrix?: MergedGrid;
  stats?: MergedInspectionResult['stats'];
  condition?: MergedInspectionResult['condition'];
}

export type ColorMode = 'mm' | '%';

interface InspectionState {
  inspectionResult: Omit<MergedInspectionResult, 'mergedGrid'> | null;
  setInspectionResult: (result: Omit<MergedInspectionResult, 'mergedGrid'> | null) => void;
  isLoading: boolean;
  loadingProgress: number;
  processFiles: (files: File[], nominalThickness: number, assetType: any, mergeConfig: any) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: AIInsight | null) => void;
  reprocessPlates: (newNominalThickness: number) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  dataVersion: number; // Used to trigger re-renders when data in the vault changes
}

let worker: Worker | null = null;
if (typeof window !== 'undefined') {
    worker = new Worker(new URL('../workers/data-processor.worker.ts', import.meta.url));
}

export const useInspectionStore = create<InspectionState>()(
    (set, get) => {
      if (worker) {
        worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
          const { type, message, progress, ...data } = event.data;
          
          if (type === 'PROGRESS') {
            set({ isLoading: true, loadingProgress: progress || 0 });
          } else if (type === 'ERROR') {
            console.error("Worker Error:", message);
            set({ isLoading: false });
            // Optionally, show a toast notification here
          } else if (type === 'DONE') {
             if (data.displacementBuffer && data.colorBuffer && data.gridMatrix && data.stats && data.condition) {
                DataVault.displacementBuffer = data.displacementBuffer;
                DataVault.colorBuffer = data.colorBuffer;
                DataVault.gridMatrix = data.gridMatrix;
                
                set(state => ({
                    inspectionResult: {
                        // All lightweight data goes into state
                        plates: [], // The worker now handles merging, so individual plates are abstracted
                        nominalThickness: data.stats!.nominalThickness, // Assuming worker sends this
                        assetType: state.inspectionResult?.assetType || 'Plate', // Persist asset type
                        pipeOuterDiameter: state.inspectionResult?.pipeOuterDiameter,
                        pipeLength: state.inspectionResult?.pipeLength,
                        stats: data.stats,
                        condition: data.condition,
                        aiInsight: null,
                    },
                    isLoading: false,
                    dataVersion: state.dataVersion + 1, // Trigger re-render
                }));
            }
          }
        };
      }

      return {
        inspectionResult: null,
        isLoading: false,
        loadingProgress: 0,
        selectedPoint: null,
        colorMode: 'mm',
        dataVersion: 0,
        
        setInspectionResult: (result) => {
          if (result === null) {
            DataVault.displacementBuffer = null;
            DataVault.colorBuffer = null;
            DataVault.gridMatrix = null;
            set({ inspectionResult: null, selectedPoint: null, isLoading: false, dataVersion: 0 });
          } else {
            set({ inspectionResult: result });
          }
        },
        
        setIsLoading: (isLoading) => set({ isLoading }),
        
        setSelectedPoint: (point) => set({ selectedPoint: point }),
        
        setColorMode: (mode) => set({ colorMode: mode }),

        processFiles: (files, nominalThickness, assetType, mergeConfig) => {
            set({ isLoading: true, loadingProgress: 0 });
            // The initial state for the result can be set here
             set(state => ({ 
                inspectionResult: {
                    ...(state.inspectionResult || {}),
                    nominalThickness,
                    assetType,
                    ...mergeConfig, // for pipe/tank dimensions
                } as any,
             }));

            worker?.postMessage({
                files: files,
                nominalThickness: nominalThickness,
                mergeConfig: mergeConfig,
            });
        },
        
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
        
        reprocessPlates: (newNominalThickness: number) => {
            const files = (get() as any).inspectionResult?.rawFiles || []; // Need to store raw files if we want to reprocess
            if (files.length > 0) {
                 get().processFiles(files, newNominalThickness, get().inspectionResult?.assetType, {});
            }
        },
      }
    }
);
