
"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid, AssetType, InspectionStats } from '@/lib/types';
import { DataVault } from './data-vault';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';

export interface WorkerOutput {
  type: 'PROGRESS' | 'DONE' | 'ERROR';
  message?: string;
  progress?: number;
  plates?: Plate[];
  displacementBuffer?: Float32Array;
  colorBuffer?: Uint8Array;
  gridMatrix?: MergedGrid;
  stats?: InspectionStats;
  condition?: MergedInspectionResult['condition'];
}

export type ColorMode = 'mm' | '%';

export type ProcessConfig = {
    pipeOuterDiameter?: number;
    pipeLength?: number;
}

interface InspectionState {
  inspectionResult: MergedInspectionResult | null;
  isLoading: boolean;
  loadingProgress: number;
  error: string | null;
  processFirstFile: (file: File, nominalThickness: number, assetType: AssetType, config: ProcessConfig) => void;
  mergeNextFile: (file: File, mergeConfig: MergeFormValues) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: AIInsight | null) => void;
  reprocessPlates: (newNominalThickness: number) => void;
  resetProject: () => void;
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
             if (data.displacementBuffer && data.colorBuffer && data.gridMatrix && data.stats && data.condition && data.plates) {
                
                if (data.stats.totalPoints === 0) {
                    set({ isLoading: false, error: "Parsing Failed: No data points found in the file." });
                    return;
                }

                DataVault.displacementBuffer = data.displacementBuffer;
                DataVault.colorBuffer = data.colorBuffer;
                DataVault.gridMatrix = data.gridMatrix;
                DataVault.stats = data.stats;
                
                const currentResult = get().inspectionResult;
                
                const newResult: MergedInspectionResult = {
                    plates: data.plates,
                    mergedGrid: data.gridMatrix,
                    nominalThickness: data.stats.nominalThickness,
                    stats: data.stats,
                    condition: data.condition,
                    aiInsight: null,
                    assetType: currentResult?.assetType || 'Plate',
                    pipeOuterDiameter: currentResult?.pipeOuterDiameter,
                    pipeLength: currentResult?.pipeLength
                };
                
                set(state => ({
                    inspectionResult: newResult,
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
        
        setSelectedPoint: (point) => set({ selectedPoint: point }),
        
        setColorMode: (mode) => {
            const currentResult = get().inspectionResult;
            if (!worker || !currentResult) return;
            set({ colorMode: mode, isLoading: true, loadingProgress: 50, error: null });
            
             worker.postMessage({
                type: 'RECOLOR',
                nominalThickness: currentResult.nominalThickness,
                colorMode: mode,
            });
        },

        processFirstFile: async (file, nominalThickness, assetType, config) => {
            if (!worker) return;
            set({ isLoading: true, loadingProgress: 0, error: null });
             set({ 
                inspectionResult: {
                    nominalThickness,
                    assetType,
                    pipeOuterDiameter: config.pipeOuterDiameter,
                    pipeLength: config.pipeLength,
                } as any,
             });

            const buffer = await file.arrayBuffer();
            const message = {
                type: 'INIT',
                file: { name: file.name, buffer: buffer },
                nominalThickness,
                colorMode: get().colorMode,
            };
            worker?.postMessage(message, [buffer]);
        },

        mergeNextFile: async (file, mergeConfig) => {
            if (!worker) return;
            set({ isLoading: true, loadingProgress: 0, error: null });
            const buffer = await file.arrayBuffer();
            const message = {
                type: 'MERGE',
                file: { name: file.name, buffer: buffer },
                mergeConfig: mergeConfig,
                colorMode: get().colorMode,
            };
            worker?.postMessage(message, [buffer]);
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
            if (!worker) return;
             set(state => ({ 
                isLoading: true,
                loadingProgress: 0,
                error: null,
                inspectionResult: { ...state.inspectionResult!, nominalThickness: newNominalThickness }
            }));
            
            worker.postMessage({
                type: 'REPROCESS',
                nominalThickness: newNominalThickness,
                colorMode: get().colorMode,
            });
        },

        resetProject: () => {
            if (!worker) return;
            worker.postMessage({ type: 'RESET' });
            DataVault.displacementBuffer = null;
            DataVault.colorBuffer = null;
            DataVault.gridMatrix = null;
            DataVault.stats = null;
            set({ inspectionResult: null, selectedPoint: null, isLoading: false, dataVersion: 0, error: null, loadingProgress: 0 });
        }
      }
    }
);
    
