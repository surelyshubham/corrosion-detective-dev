// This file is a placeholder for the snapshot vault implementation.
// For now, the logic remains in DataVault, but this structure allows
// for a cleaner separation in the future.

import type { PatchImageSet } from "../docx/types";

export class PatchSnapshotVault {
  private snapshots: Map<string, PatchImageSet> = new Map();

  public add(snapshot: PatchImageSet) {
    this.snapshots.set(snapshot.patchId, snapshot);
  }

  public get(patchId: string): PatchImageSet | undefined {
    return this.snapshots.get(patchId);
  }

  public getAll(): PatchImageSet[] {
    return Array.from(this.snapshots.values());
  }

  public clear() {
    this.snapshots.clear();
  }
}
