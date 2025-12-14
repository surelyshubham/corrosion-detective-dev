
"use client"

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '../ui/label'
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { PlatePercentLegend } from './PlatePercentLegend'
import { ScrollArea } from '../ui/scroll-area'
import { PatchTable } from '../patches/PatchTable'

const getNiceInterval = (range: number, maxTicks: number): number => {
    if (range === 0) return 1;
    const roughStep = range / maxTicks;
    const goodSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    const step = goodSteps.find(s => s > roughStep) || goodSteps[goodSteps.length - 1];
    return step;
};

function getColorByPercentage(pct: number | null, isND: boolean): string {
  if (isND) return '#888888';
  if (pct === null) return '#444444'; // Should not happen if not ND
  if (pct >= 90) return '#0000ff';
  if (pct >= 80) return '#00ff00';
  if (pct >= 70) return '#ffff00';
  return '#ff0000';
}

export type PlateView2DRef = {
  capture: () => string;
};

interface PlateView2DProps {}

export const PlateView2D = forwardRef<PlateView2DRef, PlateView2DProps>((props, ref) => {
  const { inspectionResult, selectedPoint, setSelectedPoint, dataVersion, patches, selectedPatchId, selectPatch } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const xAxisRef = useRef<HTMLDivElement>(null);
  const yAxisRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const { nominalThickness } = inspectionResult || {};
  const { gridSize } = DataVault.stats || {};
  const gridMatrix = DataVault.gridMatrix;
  
  const BASE_CELL_SIZE = 6;
  const scaledCellSize = BASE_CELL_SIZE * zoom;
  const AXIS_SIZE = 45;

  useImperativeHandle(ref, () => ({
    capture: () => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      return canvas.toDataURL('image/png');
    }
  }));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridSize || !gridMatrix) return;
    
    const { width, height } = gridSize;
    const canvasWidth = width * scaledCellSize;
    const canvasHeight = height * scaledCellSize;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.imageSmoothingEnabled = false;

    // Draw heatmap from grid data
    for (let y = 0; y < gridSize.height; y++) {
        for (let x = 0; x < gridSize.width; x++) {
            const cell = gridMatrix[y][x];
            ctx.fillStyle = getColorByPercentage(cell?.percentage ?? null, cell?.isND ?? true);
            ctx.fillRect(x * scaledCellSize, y * scaledCellSize, scaledCellSize, scaledCellSize);

            // Draw boundaries
            if (x > 0) {
                const leftCell = gridMatrix[y][x - 1];
                if (cell && leftCell && cell.plateId !== leftCell.plateId) {
                    ctx.setLineDash([4, 2]);
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x * scaledCellSize, y * scaledCellSize);
                    ctx.lineTo(x * scaledCellSize, (y + 1) * scaledCellSize);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }
    }
    
    // Draw patch bounding boxes
    if (patches) {
      const allPatches = [...patches.corrosion, ...patches.nonInspected];
      allPatches.forEach(patch => {
        const { xMin, xMax, yMin, yMax } = patch.coordinates;
        
        const patchIdString = `${patch.kind === 'CORROSION' ? 'C' : 'ND'}-${patch.id}`;
        const isSelected = selectedPatchId === patchIdString;

        if (patch.kind === 'CORROSION') ctx.strokeStyle = isSelected ? '#00ffff' : '#ff00ff';
        else ctx.strokeStyle = isSelected ? '#00ffff' : '#ffffff';
        
        ctx.lineWidth = isSelected ? Math.max(2, 3 * zoom / 10) : Math.max(1, 2 * zoom / 10);
        if (patch.kind === 'NON_INSPECTED') ctx.setLineDash([4, 2]);
        else ctx.setLineDash([]);

        ctx.strokeRect(
          xMin * scaledCellSize,
          yMin * scaledCellSize,
          (xMax - xMin + 1) * scaledCellSize,
          (yMax - yMin + 1) * scaledCellSize
        );

        if (isSelected) {
          ctx.fillStyle = 'rgba(0, 255, 255, 0.12)';
          ctx.fillRect(
            xMin * scaledCellSize,
            yMin * scaledCellSize,
            (xMax - xMin + 1) * scaledCellSize,
            (yMax - yMin + 1) * scaledCellSize
          );
        }

        const centerX = (patch.center.x + 0.5) * scaledCellSize;
        const centerY = (patch.center.y + 0.5) * scaledCellSize;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(10, 12 * zoom / 10)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(patchIdString, centerX, centerY);
      });
      ctx.setLineDash([]);
    }

    if (selectedPoint) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = Math.max(1.5, 3 * zoom / 10);
        ctx.strokeRect(selectedPoint.x * scaledCellSize, selectedPoint.y * scaledCellSize, scaledCellSize, scaledCellSize);
    }
    
  }, [gridSize, gridMatrix, dataVersion, zoom, scaledCellSize, selectedPoint, patches, selectedPatchId]);

  useEffect(() => {
    draw();
  }, [draw]);
  
  const handleScroll = () => {
      if (scrollContainerRef.current && xAxisRef.current && yAxisRef.current) {
          const { scrollLeft, scrollTop } = scrollContainerRef.current;
          xAxisRef.current.style.transform = `translateX(-${scrollLeft}px)`;
          yAxisRef.current.style.transform = `translateY(-${scrollTop}px)`;
      }
  };

  const adjustZoom = (factor: number) => {
    setZoom(prev => Math.max(0.2, Math.min(prev * factor, 50)));
  };
  
  const resetView = () => {
    setZoom(1);
    if(scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
        scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridSize || !gridMatrix || !canvasRef.current) { setHoveredPoint(null); return; };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const gridX = Math.floor(x / scaledCellSize), gridY = Math.floor(y / scaledCellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        const pointData = gridMatrix[gridY]?.[gridX];
        if(pointData) setHoveredPoint({ x: gridX, y: gridY, ...pointData, clientX: e.clientX, clientY: e.clientY });
        else setHoveredPoint(null);
    } else {
        setHoveredPoint(null);
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridSize || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const gridX = Math.floor(x / scaledCellSize), gridY = Math.floor(y / scaledCellSize);

    const allPatches = [...(patches?.corrosion || []), ...(patches?.nonInspected || [])];
    const clickedPatch = allPatches.find(p => gridX >= p.coordinates.xMin && gridX <= p.coordinates.xMax && gridY >= p.coordinates.yMin && gridY <= p.coordinates.yMax);

    if (clickedPatch) {
        selectPatch(`${clickedPatch.kind === 'CORROSION' ? 'C' : 'ND'}-${clickedPatch.id}`);
        return;
    }
    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        selectPatch(null);
        setSelectedPoint({ x: gridX, y: gridY });
    }
  }

  const renderXAxis = () => {
    if (!gridSize) return null;
    const ticks = [];
    const interval = getNiceInterval(gridSize.width, 10);
    for (let i = 0; i <= gridSize.width; i += interval) {
      ticks.push(
        <div key={`x-${i}`} className="absolute top-0 text-center text-xs text-muted-foreground" style={{ left: `${i * scaledCellSize}px`, transform: 'translateX(-50%)' }}>
          <div className="absolute top-1 w-px h-1 bg-muted-foreground" />
          <span className="absolute top-2">{i}</span>
        </div>
      );
    }
    return <div style={{ width: gridSize.width * scaledCellSize }}>{ticks}</div>;
  };
  
  const renderYAxis = () => {
    if (!gridSize) return null;
    const ticks = [];
    const interval = getNiceInterval(gridSize.height, 10);
    for (let i = 0; i <= gridSize.height; i += interval) {
      ticks.push(
        <div key={`y-${i}`} className="absolute right-0 text-right text-xs text-muted-foreground" style={{ top: `${i * scaledCellSize}px`, transform: 'translateY(-50%)' }}>
          <div className="absolute right-1 w-1 h-px bg-muted-foreground" />
          <span className="absolute right-2.5">{i}</span>
        </div>
      );
    }
    return <div style={{ height: gridSize.height * scaledCellSize }}>{ticks}</div>;
  };
  
  if (!inspectionResult || !DataVault.stats || !gridMatrix) return null;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <Card className="h-full flex flex-col md:col-span-3">
        <CardHeader>
          <CardTitle className="font-headline">2D Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow relative p-0 border-t flex flex-col">
            <div className="relative w-full h-full flex">
                <div className="flex-shrink-0" style={{ width: AXIS_SIZE }}>
                    <div className='text-xs text-muted-foreground -rotate-90 whitespace-nowrap absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 origin-center'>Y Index</div>
                    <div ref={yAxisRef} className="relative h-full pt-1">{renderYAxis()}</div>
                </div>
                <div className="flex-grow flex flex-col overflow-hidden">
                    <div className="flex-shrink-0" style={{ height: AXIS_SIZE }}>
                       <div className='text-xs text-muted-foreground absolute bottom-0 left-1/2 -translate-x-1/2 pb-1'>X Index</div>
                       <div ref={xAxisRef} className="relative h-full pr-1">{renderXAxis()}</div>
                    </div>
                    <div ref={scrollContainerRef} className="flex-grow overflow-auto" onScroll={handleScroll}>
                         <div className="relative" style={{ width: (gridSize?.width ?? 0) * scaledCellSize, height: (gridSize?.height ?? 0) * scaledCellSize }}>
                            <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredPoint(null)} onClick={handleClick} className="absolute top-0 left-0" />
                        </div>
                    </div>
                </div>
            </div>
            {hoveredPoint && (
              <div className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-20" style={{ left: `${hoveredPoint.clientX + 15}px`, top: `${hoveredPoint.clientY - 30}px` }}>
                <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
                {hoveredPoint.plateId && <div className="text-muted-foreground truncate max-w-[200px]">{hoveredPoint.plateId}</div>}
                <div>Raw Thick: {hoveredPoint.rawThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Eff. Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
              </div>
            )}
        </CardContent>
      </Card>
      <div className="md:col-span-1">
        <ScrollArea className="h-[calc(100vh-10rem)]">
          <div className="space-y-4 pr-4">
            <Card>
                <CardHeader><CardTitle className="font-headline text-lg">Controls</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Zoom ({Math.round(zoom*100)}%)</Label>
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => adjustZoom(1.5)}><ZoomIn/></Button>
                        <Button variant="outline" size="icon" onClick={() => adjustZoom(1/1.5)}><ZoomOut/></Button>
                        <Button variant="outline" onClick={resetView} className="flex-grow"><RefreshCw className="mr-2"/> Reset</Button>
                      </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg font-headline">Legend</CardTitle></CardHeader>
              <CardContent><PlatePercentLegend /></CardContent>
            </Card>
            <PatchTable />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
});
PlateView2D.displayName = "PlateView2D";
