

"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid, AssetType, InspectionStats, SegmentBox } from '@/lib/types';
import { DataVault } from './data-vault';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { toast } from '@/hooks/use-toast';
import { type ThicknessConflict } from '../workers/data-processor.worker';
import { generateCorrosionInsight, type CorrosionInsightInput } from '@/ai/flows/generate-corrosion-insight';

export type StagedFile = {
  name: string;
  mergeConfig: MergeFormValues | null;
}

export interface WorkerOutput {
  type: 'STAGED' | 'FINALIZED' | 'ERROR' | 'PROGRESS' | 'THICKNESS_CONFLICT' | 'SEGMENTS_UPDATED';
  message?: string;
  progress?: number;
  
  // STAGED output
  dimensions?: { width: number; height: number };

  // FINALIZED / SEGMENTS_UPDATED output
  plates?: Plate[];
  displacementBuffer?: Float32Array;
  colorBuffer?: Uint8Array;
  gridMatrix?: MergedGrid;
  stats?: InspectionStats & { nominalThickness: number };
  condition?: MergedInspectionResult['condition'];
  corrosionPatches?: SegmentBox[];
  ndPatches?: SegmentBox[];
  
  // CONFLICT output
  conflict?: ThicknessConflict;
}


export type ProcessConfig = {
    assetType: AssetType;
    nominalThickness: number;
    pipeOuterDiameter?: number;
    pipeLength?: number;
}

export interface PatchState {
  corrosion: SegmentBox[];
  nonInspected: SegmentBox[];
}

interface InspectionState {
  // Final result
  inspectionResult: MergedInspectionResult | null;
  patches: PatchState | null;
  
  // Staging state
  stagedFiles: StagedFile[];
  projectDimensions: { width: number; height: number } | null;
  thicknessConflict: ThicknessConflict | null;
  setThicknessConflict: (conflict: ThicknessConflict | null) => void;
  resolveThicknessConflict: (resolution: 'useOriginal' | 'useNew' | { type: 'useCustom', value: number }) => void;


  // UI state
  isLoading: boolean;
  isFinalizing: boolean;
  isGeneratingAI: boolean;
  loadingProgress: number;
  error: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Actions
  addFileToStage: (file: File, config: Omit<ProcessConfig, 'nominalThickness'> & { nominalThickness: number | string }, mergeConfig: MergeFormValues | null) => void;
  finalizeProject: () => void;
  resetProject: () => void;
  
  // Segmentation
  defectThreshold: number;
  setDefectThreshold: (threshold: number) => void;
  setSegmentsForThreshold: (threshold: number) => void;
  
  // Interactive state
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  selectedPatchId: string | null; // e.g. "C-1", "ND-5"
  selectPatch: (id: string | null) => void;
  dataVersion: number;
}

let worker: Worker | null = null;


export const useInspectionStore = create<InspectionState>()(
    (set, get) => {
      // Initialize worker inside the store setup function
      if (typeof window !== 'undefined' && !worker) {
          worker = new Worker(new URL('../workers/data-processor.worker.ts', import.meta.url));
          
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
            } else if (type === 'SEGMENTS_UPDATED') {
               if (data.corrosionPatches && data.ndPatches) {
                    set({ patches: { corrosion: data.corrosionPatches, nonInspected: data.ndPatches } });
               }
            } else if (type === 'FINALIZED') {
               if (data.displacementBuffer && data.colorBuffer && data.gridMatrix && data.stats && data.condition && data.plates && data.corrosionPatches && data.ndPatches) {
                  
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
                      corrosionPatches: data.corrosionPatches,
                      ndPatches: data.ndPatches,
                  };
                  
                  set(state => ({
                      inspectionResult: newResult,
                      patches: { corrosion: data.corrosionPatches!, nonInspected: data.ndPatches! },
                      isFinalizing: false,
                      error: null,
                      dataVersion: state.dataVersion + 1,
                  }));

                  // Fire off AI insight generation
                  set({ isGeneratingAI: true });
                  const aiInput: CorrosionInsightInput = {
                      assetType: newResult.assetType,
                      nominalThickness: Number(newResult.nominalThickness),
                      minThickness: Number(newResult.stats.minThickness),
                      maxThickness: Number(newResult.stats.maxThickness),
                      avgThickness: Number(newResult.stats.avgThickness),
                      areaBelow80: Number(newResult.stats.areaBelow80),
                      areaBelow70: Number(newResult.stats.areaBelow70),
                      areaBelow60: Number(newResult.stats.areaBelow60),
                      worstLocationX: Number(newResult.stats.worstLocation.x),
                      worstLocationY: Number(newResult.stats.worstLocation.y),
                      minPercentage: Number(newResult.stats.minPercentage),
                  };

                  generateCorrosionInsight(aiInput)
                      .then(aiInsight => {
                          set(state => ({
                              inspectionResult: state.inspectionResult ? { ...state.inspectionResult, aiInsight } : null,
                              isGeneratingAI: false,
                          }));
                      })
                      .catch(error => {
                          console.error("AI Insight generation failed:", error);
                          set({ isGeneratingAI: false });
                      });
              } else {
                   set({ isFinalizing: false, error: "Worker returned incomplete data after finalization." });
              }
            }
          };
      }

      return {
        inspectionResult: null,
        patches: null,
        stagedFiles: [],
        projectDimensions: null,
        thicknessConflict: null,
        isLoading: false,
        isFinalizing: false,
        isGeneratingAI: false,
        loadingProgress: 0,
        selectedPoint: null,
        selectedPatchId: null,
        dataVersion: 0,
        error: null,
        activeTab: 'setup',
        defectThreshold: 80,

        setActiveTab: (tab) => set({ activeTab: tab }),
        setSelectedPoint: (point) => set({ selectedPoint: point }),
        selectPatch: (id) => set({ selectedPatchId: id }),
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
        
        addFileToStage: async (file, config, mergeConfig) => {
            if (!worker) return;
            set({ isLoading: true, error: null });
            
            const newStagedFile: StagedFile = { name: file.name, mergeConfig };
            set(state => ({ stagedFiles: [...state.stagedFiles, newStagedFile] }));

            const buffer = await file.arrayBuffer();
            const isFirstFile = get().stagedFiles.length === 1;

            const sanitizedConfig = {
              ...config,
              nominalThickness: Number(config.nominalThickness) || 0,
            };

            if (isFirstFile) {
                worker?.postMessage({
                    type: 'INIT',
                    file: { name: file.name, buffer: buffer },
                    config: sanitizedConfig
                }, [buffer]);
            } else {
                 worker?.postMessage({
                    type: 'MERGE',
                    file: { name: file.name, buffer: buffer },
                    config: sanitizedConfig,
                    mergeConfig: mergeConfig,
                }, [buffer]);
            }
        },

        finalizeProject: () => {
            if (!worker || get().stagedFiles.length === 0) return;
            set({ isFinalizing: true, loadingProgress: 0, error: null });
            worker.postMessage({ type: 'FINALIZE', threshold: get().defectThreshold });
        },
        
        setDefectThreshold: (threshold) => set({ defectThreshold: threshold }),
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
            if(typeof window !== 'undefined') {
                localStorage.removeItem('patchVault');
            }
            set({ 
                inspectionResult: null, 
                patches: null,
                stagedFiles: [],
                projectDimensions: null,
                selectedPoint: null, 
                isLoading: false, 
                isFinalizing: false,
                isGeneratingAI: false,
                dataVersion: 0, 
                error: null, 
                loadingProgress: 0,
                activeTab: 'setup'
            });
        }
      }
    }
);
