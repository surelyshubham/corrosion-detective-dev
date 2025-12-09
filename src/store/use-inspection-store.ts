
"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid, AssetType, InspectionStats, SegmentBox } from '@/lib/types';
import { DataVault } from './data-vault';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { toast } from '@/hooks/use-toast';
import { type ThicknessConflict } from '../workers/data-processor.worker';

export type StagedFile = {
  name: string;
  mergeConfig: MergeFormValues | null;
}

export interface WorkerOutput {
  type: 'STAGED' | 'FINALIZED' | 'ERROR' | 'PROGRESS' | 'THICKNESS_CONFLICT';
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
  segments?: SegmentBox[];
  
  // CONFLICT output
  conflict?: ThicknessConflict;
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
  thicknessConflict: ThicknessConflict | null;
  setThicknessConflict: (conflict: ThicknessConflict | null) => void;
  resolveThicknessConflict: (resolution: 'useOriginal' | 'useNew' | { type: 'useCustom', value: number }) => void;


  // UI state
  isLoading: boolean;
  isFinalizing: boolean;
  loadingProgress: number;
  error: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Actions
  addFileToStage: (file: File, config: ProcessConfig, mergeConfig: MergeFormValues | null) => void;
  finalizeProject: () => void;
  resetProject: () => void;
  setSegmentsForThreshold: (threshold: number) => void;
  
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
            set({ isLoading: false, projectDimensions: data.dimensions || null, thicknessConflict: null });
          } else if (type === 'THICKNESS_CONFLICT') {
             set({ isLoading: false, thicknessConflict: data.conflict || null });
          } else if (type === 'FINALIZED') {
             if (data.displacementBuffer && data.colorBuffer && data.gridMatrix && data.stats && data.condition && data.plates && data.segments) {
                
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
                    aiInsight: null,
                    assetType: data.plates[0].assetType,
                    pipeOuterDiameter: data.plates[0].pipeOuterDiameter,
                    pipeLength: data.plates[0].pipeLength,
                    segments: data.segments,
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
        thicknessConflict: null,
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
        setThicknessConflict: (conflict) => set({ thicknessConflict: conflict }),
        
        resolveThicknessConflict: (resolution) => {
            const conflict = get().thicknessConflict;
            if (!worker || !conflict) return;

            set({ isLoading: true, thicknessConflict: null });
            
            worker.postMessage({
                type: 'MERGE',
                file: { name: conflict.fileName, buffer: conflict.fileBuffer },
                mergeConfig: conflict.mergeConfig,
                resolution: resolution,
            }, [conflict.fileBuffer]);
        },
        
        setColorMode: (mode) => {
            const currentResult = get().inspectionResult;
            if (!worker || !currentResult) return;
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
                    config: config,
                    mergeConfig: mergeConfig,
                }, [buffer]);
            }
        },

        finalizeProject: () => {
            if (!worker || get().stagedFiles.length === 0) return;
            set({ isFinalizing: true, loadingProgress: 0, error: null });
            worker.postMessage({ type: 'FINALIZE', colorMode: get().colorMode, threshold: 80 });
        },
        
        setSegmentsForThreshold: (threshold) => {
            if (!worker || !get().inspectionResult) return;
            worker.postMessage({ type: 'RESEGMENT', threshold: threshold });
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
