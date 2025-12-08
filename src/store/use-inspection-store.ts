
"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid, AssetType, InspectionStats } from '@/lib/types';
import { DataVault } from './data-vault';

export interface WorkerOutput {
  type: 'PROGRESS' | 'DONE' | 'ERROR';
  message?: string;
  progress?: number;
  displacementBuffer?: Float32Array;
  colorBuffer?: Uint8Array;
  gridMatrix?: MergedGrid;
  stats?: InspectionStats;
  condition?: MergedInspectionResult['condition'];
}

export type ColorMode = 'mm' | '%';

interface InspectionState {
  inspectionResult: Omit<MergedInspectionResult, 'mergedGrid' | 'stats'> | null;
  setInspectionResult: (result: Omit<MergedInspectionResult, 'mergedGrid' | 'stats'> | null) => void;
  isLoading: boolean;
  loadingProgress: number;
  error: string | null;
  processFiles: (files: File[], nominalThickness: number, assetType: AssetType, mergeConfig: any) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: AIInsight | null) => void;
  reprocessPlates: (newNominalThickness: number) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  dataVersion: number;
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
            set({ isLoading: true, loadingProgress: progress || 0, error: null });
          } else if (type === 'ERROR') {
            console.error("Worker Error:", message);
            set({ isLoading: false, error: message || "An unknown error occurred in the worker." });
          } else if (type === 'DONE') {
             if (data.displacementBuffer && data.colorBuffer && data.gridMatrix && data.stats && data.condition) {
                
                if (data.stats.totalPoints === 0) {
                    set({ isLoading: false, error: "Parsing Failed: No data points found in the file." });
                    return;
                }

                DataVault.displacementBuffer = data.displacementBuffer;
                DataVault.colorBuffer = data.colorBuffer;
                DataVault.gridMatrix = data.gridMatrix;
                DataVault.stats = data.stats;
                
                const currentState = get().inspectionResult;
                
                set(state => ({
                    inspectionResult: {
                        ...(currentState || {}),
                        plates: [],
                        nominalThickness: data.stats!.nominalThickness,
                        condition: data.condition,
                        aiInsight: null,
                    } as Omit<MergedInspectionResult, 'mergedGrid' | 'stats'>,
                    isLoading: false,
                    error: null,
                    dataVersion: state.dataVersion + 1,
                }));
            } else {
                 set({ isLoading: false, error: "Worker returned incomplete data." });
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
        error: null,
        
        setInspectionResult: (result) => {
          if (result === null) {
            DataVault.displacementBuffer = null;
            DataVault.colorBuffer = null;
            DataVault.gridMatrix = null;
            DataVault.stats = null;
            set({ inspectionResult: null, selectedPoint: null, isLoading: false, dataVersion: 0, error: null });
          } else {
            set({ inspectionResult: result });
          }
        },
        
        setSelectedPoint: (point) => set({ selectedPoint: point }),
        
        setColorMode: (mode) => {
            const currentResult = get().inspectionResult;
            if (!worker || !currentResult) return;
            set({ colorMode: mode, isLoading: true, loadingProgress: 50, error: null });
            
             worker.postMessage({
                type: 'RECOLOR',
                gridMatrix: DataVault.gridMatrix,
                nominalThickness: currentResult.nominalThickness,
                stats: DataVault.stats,
                colorMode: mode,
            });
        },

        processFiles: (files, nominalThickness, assetType, mergeConfig) => {
            if (!worker) {
                console.error("Worker not initialized!");
                set({ isLoading: false, error: "Data processing worker is not available." });
                return;
            }
            set({ isLoading: true, loadingProgress: 0, error: null });
             set(state => ({ 
                inspectionResult: {
                    ...(state.inspectionResult || {}),
                    nominalThickness,
                    assetType,
                    ...mergeConfig,
                } as any,
             }));

            const fileBuffers = files.map(file => file.arrayBuffer());
            Promise.all(fileBuffers).then(buffers => {
                 worker?.postMessage({
                    type: 'PROCESS',
                    files: files.map((file, i) => ({
                        name: file.name,
                        buffer: buffers[i]
                    })),
                    nominalThickness: nominalThickness,
                    colorMode: get().colorMode,
                }, buffers);
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
            if (!worker || !DataVault.gridMatrix) {
                console.error("Worker or data not available for reprocessing");
                return;
            }
             set(state => ({ 
                isLoading: true,
                loadingProgress: 0,
                error: null,
                inspectionResult: { ...state.inspectionResult!, nominalThickness: newNominalThickness }
            }));
            
            worker.postMessage({
                type: 'REPROCESS',
                gridMatrix: DataVault.gridMatrix,
                nominalThickness: newNominalThickness,
                colorMode: get().colorMode
            });
        },
      }
    }
);
