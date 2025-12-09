
"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid, AssetType, InspectionStats } from '@/lib/types';
import { DataVault } from './data-vault';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { toast } from '@/hooks/use-toast';

export type StagedFile = {
  name: string;
  mergeConfig: MergeFormValues | null;
}

export interface WorkerOutput {
  type: 'STAGED' | 'FINALIZED' | 'ERROR' | 'PROGRESS';
  message?: string;
  progress?: number;
  
  // STAGED output
  dimensions?: { width: number; height: number };

  // FINALIZED output
  plates?: Plate[];
  displacementBuffer?: Float32Array;
  colorBuffer?: Uint8Array;
  gridMatrix?: MergedGrid;
  stats?: InspectionStats & { nominalThickness: number };
  condition?: MergedInspectionResult['condition'];
}

export type ColorMode = 'mm' | '%';

export type ProcessConfig = {
    assetType: AssetType;
    nominalThickness: number;
    pipeOuterDiameter?: number;
    pipeLength?: number;
}

interface InspectionState {
  // Final result
  inspectionResult: MergedInspectionResult | null;
  
  // Staging state
  stagedFiles: StagedFile[];
  projectDimensions: { width: number; height: number } | null;

  // UI state
  isLoading: boolean; // For staging files
  isFinalizing: boolean; // For final processing
  loadingProgress: number;
  error: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Actions
  addFileToStage: (file: File, config: ProcessConfig, mergeConfig: MergeFormValues | null) => void;
  finalizeProject: () => void;
  resetProject: () => void;
  
  // Interactive state
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
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
             if (get().isFinalizing) {
                set({ loadingProgress: progress || 0 });
             } else {
                set({ isLoading: true, error: null });
             }
          } else if (type === 'ERROR') {
            console.error("Worker Error:", message);
            toast({ variant: 'destructive', title: 'Processing Error', description: message });
            set({ isLoading: false, isFinalizing: false, error: message || "An unknown error occurred in the worker." });
          } else if (type === 'STAGED') {
            toast({ title: 'File Staged', description: `${get().stagedFiles.slice(-1)[0]?.name} has been added.` });
            set({ isLoading: false, projectDimensions: data.dimensions || null });
          } else if (type === 'FINALIZED') {
             if (data.displacementBuffer && data.colorBuffer && data.gridMatrix && data.stats && data.condition && data.plates) {
                
                if (data.stats.totalPoints === 0) {
                    set({ isFinalizing: false, error: "Processing Failed: No data points found in the project." });
                    return;
                }

                DataVault.displacementBuffer = data.displacementBuffer;
                DataVault.colorBuffer = data.colorBuffer;
                DataVault.gridMatrix = data.gridMatrix;
                DataVault.stats = data.stats;
                
                const newResult: MergedInspectionResult = {
                    plates: data.plates,
                    mergedGrid: data.gridMatrix,
                    nominalThickness: data.stats.nominalThickness,
                    stats: data.stats,
                    condition: data.condition,
                    aiInsight: null, // AI insight is generated after this
                    assetType: data.plates[0].assetType,
                    pipeOuterDiameter: data.plates[0].pipeOuterDiameter,
                    pipeLength: data.plates[0].pipeLength
                };
                
                set(state => ({
                    inspectionResult: newResult,
                    isFinalizing: false,
                    error: null,
                    dataVersion: state.dataVersion + 1,
                }));
            } else {
                 set({ isFinalizing: false, error: "Worker returned incomplete data after finalization." });
            }
          }
        };
      }

      return {
        inspectionResult: null,
        stagedFiles: [],
        projectDimensions: null,
        isLoading: false,
        isFinalizing: false,
        loadingProgress: 0,
        selectedPoint: null,
        colorMode: 'mm',
        dataVersion: 0,
        error: null,
        activeTab: 'setup',

        setActiveTab: (tab) => set({ activeTab: tab }),
        setSelectedPoint: (point) => set({ selectedPoint: point }),
        
        setColorMode: (mode) => {
            const currentResult = get().inspectionResult;
            if (!worker || !currentResult) return; // Recolor only works on a finalized project
            set({ isFinalizing: true, loadingProgress: 50, error: null });
            
             worker.postMessage({
                type: 'RECOLOR',
                colorMode: mode,
            });
        },

        addFileToStage: async (file, config, mergeConfig) => {
            if (!worker) return;
            set({ isLoading: true, error: null });
            
            const newStagedFile: StagedFile = { name: file.name, mergeConfig };
            set(state => ({ stagedFiles: [...state.stagedFiles, newStagedFile] }));

            const buffer = await file.arrayBuffer();
            const isFirstFile = get().stagedFiles.length === 1;

            if (isFirstFile) {
                worker?.postMessage({
                    type: 'INIT',
                    file: { name: file.name, buffer: buffer },
                    config: config
                }, [buffer]);
            } else {
                 worker?.postMessage({
                    type: 'MERGE',
                    file: { name: file.name, buffer: buffer },
                    mergeConfig: mergeConfig,
                }, [buffer]);
            }
        },

        finalizeProject: () => {
            if (!worker || get().stagedFiles.length === 0) return;
            set({ isFinalizing: true, loadingProgress: 0, error: null });
            worker.postMessage({ type: 'FINALIZE', colorMode: get().colorMode });
        },
        
        resetProject: () => {
            if (!worker) return;
            worker.postMessage({ type: 'RESET' });
            DataVault.displacementBuffer = null;
            DataVault.colorBuffer = null;
            DataVault.gridMatrix = null;
            DataVault.stats = null;
            set({ 
                inspectionResult: null, 
                stagedFiles: [],
                projectDimensions: null,
                selectedPoint: null, 
                isLoading: false, 
                isFinalizing: false,
                dataVersion: 0, 
                error: null, 
                loadingProgress: 0,
                activeTab: 'setup'
            });
        }
      }
    }
);
