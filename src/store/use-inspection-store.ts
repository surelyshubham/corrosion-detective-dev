

"use client"

import { create } from 'zustand';
import type { MergedInspectionResult, AIInsight, Plate, MergedGrid, AssetType, InspectionStats, SegmentBox, GridCell, ElbowAngle, ElbowRadiusType } from '@/lib/types';
import { DataVault } from './data-vault';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { toast } from '@/hooks/use-toast';
import { type ThicknessConflict } from '../workers/data-processor.worker';
import { generateCorrosionInsight, type CorrosionInsightInput } from '@/ai/flows/generate-corrosion-insight';

export type StagedFile = {
  name: string;
  mergeConfig: MergeFormValues | null;
  dimensions: { width: number; height: number; } | null;
}

export interface WorkerOutput {
  type: 'STAGED' | 'FINALIZED' | 'ERROR' | 'PROGRESS' | 'THICKNESS_CONFLICT' | 'SEGMENTS_UPDATED';
  message?: string;
  progress?: number;
  
  // STAGED output
  plateDimensions?: { width: number; height: number; };
  projectDimensions?: { width: number; height: number };

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
    elbowStartLength?: number;
    elbowAngle?: ElbowAngle;
    elbowRadiusType?: ElbowRadiusType;
    hullPattern?: string;
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
  resolveThicknessConflict: (resolution: { type: 'useOriginal' | 'useNew' | 'useCustom', value?: number }) => void;


  // UI state
  isLoading: boolean;
  isFinalizing: boolean;
  isGeneratingAI: boolean;
  loadingProgress: number;
  error: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Actions
  addFileToStage: (file: File, config: ProcessConfig, mergeConfig: MergeFormValues | null) => void;
  finalizeProject: () => void;
  resetProject: () => void;
  
  // Segmentation
  defectThreshold: number;
  setDefectThreshold: (threshold: number) => void;
  
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
              const lastStagedFile = get().stagedFiles.slice(-1)[0];
              toast({ title: 'File Staged', description: `${lastStagedFile?.name} has been added.` });

              set(state => ({
                isLoading: false,
                projectDimensions: data.projectDimensions || null,
                thicknessConflict: null,
                stagedFiles: state.stagedFiles.map((file, index) => 
                  index === state.stagedFiles.length - 1 
                  ? { ...file, dimensions: data.plateDimensions || null }
                  : file
                )
              }));

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
                  console.log("🔥 MERGE APPLIED TO DATAVAULT");
                  
                  const firstPlate = data.plates[0];

                  const newResult: any = { // Using any to accommodate hullPattern
                      plates: data.plates,
                      mergedGrid: data.gridMatrix,
                      nominalThickness: data.stats.nominalThickness,
                      stats: data.stats,
                      condition: data.condition,
                      aiInsight: null,
                      assetType: firstPlate.assetType,
                      pipeOuterDiameter: firstPlate.pipeOuterDiameter,
                      pipeLength: firstPlate.pipeLength,
                      elbowStartLength: firstPlate.elbowStartLength,
                      elbowAngle: firstPlate.elbowAngle,
                      elbowRadiusType: firstPlate.elbowRadiusType,
                      hullPattern: firstPlate.hullPattern, // Add hullPattern
                      corrosionPatches: data.corrosionPatches,
                      ndPatches: data.ndPatches,
                  };
                  
                  set(state => ({
                      inspectionResult: newResult,
                      patches: { corrosion: data.corrosionPatches!, nonInspected: data.ndPatches! },
                      isFinalizing: false,
                      error: null,
                      dataVersion: Date.now()
                  }));

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
            
            const { fileName, fileBuffer, mergeConfig } = conflict;
            const config = get().stagedFiles.length > 0 ? get().stagedFiles[0] : { assetType: 'Plate', nominalThickness: 6 } as any;

            worker.postMessage({
                type: 'RESOLVE_CONFLICT_AND_ADD',
                file: { name: fileName, buffer: fileBuffer },
                config: { ...config, nominalThickness: resolution.value || config.nominalThickness },
                mergeConfig: mergeConfig,
                resolution
            }, [fileBuffer]);
        },
        
        addFileToStage: async (file, config, mergeConfig) => {
            if (!worker) return;
            set({ isLoading: true, error: null });
            
            const newStagedFile: StagedFile = { name: file.name, mergeConfig, dimensions: null };
            set(state => ({ stagedFiles: [...state.stagedFiles, newStagedFile] }));

            const buffer = await file.arrayBuffer();

            worker?.postMessage({
                type: 'ADD_FILE',
                file: { name: file.name, buffer: buffer },
                config: config,
                mergeConfig: mergeConfig,
            }, [buffer]);
        },

        finalizeProject: () => {
            if (!worker || get().stagedFiles.length === 0) return;
            set({ isFinalizing: true, loadingProgress: 0, error: null });
            worker.postMessage({ type: 'FINALIZE', threshold: get().defectThreshold });
        },
        
        setDefectThreshold: (threshold) => {
            set({ defectThreshold: threshold });
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
                patches: null,
                stagedFiles: [],
                projectDimensions: null,
                thicknessConflict: null,
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
