/**
 * @fileOverview A simple, static object to hold large data arrays outside of React/Zustand state.
 * This prevents performance issues from deep state comparisons on large data blobs.
 */
import type { MergedGrid, InspectionStats } from '@/lib/types';

export type PatchViewType = '2D' | 'TOP' | 'SIDE' | 'ISO';

export interface PatchSnapshot {
  patchId: string;
  patchType: 'CORROSION' | 'NON_INSPECTED';
  view: PatchViewType;
  image: string; // base64 PNG
}

interface DataVaultType {
  displacementBuffer: Float32Array | null;
  colorBuffer: Uint8Array | null;
  gridMatrix: MergedGrid | null;
  stats: InspectionStats | null;
  patchSnapshots: PatchSnapshot[];
}

export const DataVault: DataVaultType = {
  displacementBuffer: null,
  colorBuffer: null,
  gridMatrix: null,
  stats: null,
  patchSnapshots: [],
};
