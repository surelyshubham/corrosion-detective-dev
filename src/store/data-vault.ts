
/**
 * @fileOverview A simple, static object to hold large data arrays outside of React/Zustand state.
 * This prevents performance issues from deep state comparisons on large data blobs.
 */
import type { MergedGrid } from '@/lib/types';

interface DataVaultType {
  displacementBuffer: Float32Array | null;
  colorBuffer: Uint8Array | null;
  gridMatrix: MergedGrid | null;
}

export const DataVault: DataVaultType = {
  displacementBuffer: null,
  colorBuffer: null,
  gridMatrix: null,
};
