// src/components/reporting/ReportList.tsx
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { FixedSizeList as List, ListOnItemsRenderedProps } from 'react-window';
import { PatchVault } from '@/vaults/patchVault';
import { ThumbnailPool } from '@/utils/thumbnailPool';

const ITEM_HEIGHT = 120;
const PREFETCH = 6; // how many items before/after visible to prefetch thumbnails
const POOL = new ThumbnailPool(4); // adjust for CPU

type Props = {
  patchIds: string[]; // ordered array of patch ids (strings)
  height?: number;
  width?: number | string;
};

export default function ReportList({ patchIds, height = 400, width = '100%' }: Props) {
  const [, setTick] = useState(0);
  const listRef = useRef<List | null>(null);
  const visibleRangeRef = useRef({ start: 0, stop: 0 });
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      POOL.destroy();
      // Optionally clear previews
      // PatchVault.clearAll();
    };
  }, []);

  const forceRerender = useCallback(() => {
    if (!mountedRef.current) return;
    setTick(t => t + 1);
  }, []);

  const prefetchRange = useCallback(async (start: number, stop: number) => {
    const s = Math.max(0, start - PREFETCH);
    const e = Math.min(patchIds.length - 1, stop + PREFETCH);
    for (let i = s; i <= e; i++) {
      const id = patchIds[i];
      if (!id) continue;
      const p = PatchVault.get(id);
      if (!p) continue;
      if (p.previewUrl) continue; // already have a preview
      const imageEntry = p.buffers.find(b => b.name === 'iso') || p.buffers[0];
      if (!imageEntry || !imageEntry.buffer) continue;
      try {
        // copy because enqueue will transfer the buffer (zero-copy)
        const copy = imageEntry.buffer.slice(0);
        const { buffer } = await POOL.enqueue(id, copy, imageEntry.mime, 240);
        const blob = new Blob([buffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        p.previewUrl = url;
        // minimal re-render: react-window will redraw visible rows but we must notify
        if (i >= visibleRangeRef.current.start && i <= visibleRangeRef.current.stop) {
           forceRerender();
        }
      } catch (err) {
        console.error('thumbnail generation error', err);
      }
    }
  }, [patchIds, forceRerender]);

  const onItemsRendered = useCallback((props: ListOnItemsRenderedProps) => {
    const { visibleStartIndex, visibleStopIndex } = props;
    visibleRangeRef.current = { start: visibleStartIndex, stop: visibleStopIndex };
    // Prefetch asynchronously
    prefetchRange(visibleStartIndex, visibleStopIndex);
  }, [prefetchRange]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const id = patchIds[index];
    const p = PatchVault.get(id);
    const previewUrl = p?.previewUrl;
    
    return (
      <div style={{ ...style, display: 'flex', gap: 12, alignItems: 'center', padding: 8, boxSizing: 'border-box', borderBottom: '1px solid hsl(var(--border))' }}>
        <div style={{ width: 100, height: 90, background: 'hsl(var(--muted))', borderRadius: 6, overflow: 'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
          { previewUrl ? (
            <img src={previewUrl} alt={id} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>loading…</div>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{p?.meta?.title || `Patch ${index + 1}`}</div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p?.meta?.summary || `${p?.meta?.area ?? ''} • ${p?.meta?.severity ?? ''}`}</div>
        </div>
      </div>
    );
  }, [patchIds]);

  const MemoRow = React.memo(Row);


  return (
    <List
      height={height}
      width={width}
      itemCount={patchIds.length}
      itemSize={ITEM_HEIGHT}
      onItemsRendered={onItemsRendered}
      ref={listRef}
    >
      {MemoRow}
    </List>
  );
}
