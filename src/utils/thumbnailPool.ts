// src/utils/thumbnailPool.ts
// Bundler-agnostic worker creation: worker script is created at runtime from a string blob.

type EnqueueJob = {
  patchId: string;
  imageBuffer: ArrayBuffer;
  mime?: string;
  targetWidth?: number;
  resolve: (res: { id: string; buffer: ArrayBuffer }) => void;
  reject: (err: any) => void;
};

const workerScript = `self.onmessage = async (ev) => {
  const { id, imageBuffer, mime='image/png', targetWidth = 240 } = ev.data;
  try {
    // reconstruct blob
    const blob = new Blob([imageBuffer], { type: mime });
    // decode off main thread
    const bitmap = await createImageBitmap(blob);
    const aspect = bitmap.width / bitmap.height || 1;
    const targetHeight = Math.max(1, Math.round(targetWidth / aspect));
    // OffscreenCanvas draw
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    // convert
    const thumbBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.8 });
    const ab = await thumbBlob.arrayBuffer();
    // Transfer result back
    postMessage({ id, buffer: ab }, [ab]);
  } catch (err) {
    postMessage({ id, error: (err && err.message) ? err.message : String(err) });
  }
};`;

export class ThumbnailPool {
  poolSize: number;
  workers: Worker[] = [];
  queue: EnqueueJob[] = [];
  busy = new Map<number, EnqueueJob | null>();

  constructor(poolSize = 4) {
    this.poolSize = poolSize;
    try {
        // create worker blob url
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        for (let i = 0; i < this.poolSize; i++) {
        const w = new Worker(url);
        w.onmessage = (ev) => this._onMsg(i, ev);
        this.workers.push(w);
        this.busy.set(i, null);
        }
        // It's generally safe to revoke the object URL right after workers are created
        URL.revokeObjectURL(url);
    } catch(e) {
        console.error("Failed to create thumbnail worker pool.", e);
        this.workers = [];
        this.poolSize = 0;
    }
  }

  _onMsg(workerIdx: number, ev: MessageEvent) {
    const msg = ev.data;
    const job = this.busy.get(workerIdx);
    if (!job) return;
    if (msg.error) job.reject(new Error(msg.error));
    else job.resolve({ id: msg.id, buffer: msg.buffer });
    this.busy.set(workerIdx, null);
    this._maybeProcessNext();
  }

  async enqueue(patchId: string, imageBuffer: ArrayBuffer, mime = 'image/png', targetWidth = 240) {
    return new Promise<{ id: string; buffer: ArrayBuffer }>((resolve, reject) => {
      if (this.poolSize === 0) {
          return reject(new Error("Thumbnail worker pool is not available."));
      }
      this.queue.push({ patchId, imageBuffer, mime, targetWidth, resolve, reject });
      this._maybeProcessNext();
    });
  }

  _maybeProcessNext() {
    if (this.queue.length === 0) return;
    const freeIdx = this.workers.findIndex((_, idx) => this.busy.get(idx) === null);
    if (freeIdx === -1) return;
    const job = this.queue.shift();
    if (!job) return;
    // mark busy
    this.busy.set(freeIdx, job);
    // when transferring ArrayBuffer, pass it as transferable to avoid copying
    try {
      this.workers[freeIdx].postMessage(
        { id: job.patchId, imageBuffer: job.imageBuffer, mime: job.mime, targetWidth: job.targetWidth },
        [job.imageBuffer]
      );
    } catch (e) {
      // some environments won't allow transfer; fall back to non-transfer
      this.workers[freeIdx].postMessage({ id: job.patchId, imageBuffer: job.imageBuffer.slice(0), mime: job.mime, targetWidth: job.targetWidth });
    }
  }

  destroy() {
    this.workers.forEach(w => {
      try { w.terminate(); } catch(e){}
    });
    this.workers = [];
    this.queue = [];
    this.busy.clear();
  }
}
