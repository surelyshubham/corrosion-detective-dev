
"use client"

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Percent, Ruler, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'

// --- Color Helper Functions ---
const getAbsColor = (percentage: number | null): string => {
    if (percentage === null) return 'transparent'; // ND
    if (percentage <= 60) return '#ff0000'; // Red
    if (percentage <= 80) return '#ffa500'; // Orange
    if (percentage <= 95) return '#ffff00'; // Yellow
    return '#00ff00'; // Green
};

const getNormalizedColor = (normalizedPercent: number | null): string => {
    if (normalizedPercent === null) return 'transparent'; // ND
    // Blue to Red
    const hue = 240 * (1 - normalizedPercent);
    return `hsl(${hue}, 100%, 50%)`;
};


// --- UI Components ---
const ColorLegend = ({ mode, stats, nominalThickness }: { mode: ColorMode, stats: any, nominalThickness: number}) => {
    const renderMmLegend = () => {
        const levels = [
            { label: `> 95%`, color: '#00ff00' },
            { label: `80-95%`, color: '#ffff00' },
            { label: `60-80%`, color: '#ffa500' },
            { label: `< 60%`, color: '#ff0000' },
        ];
        return (
            <>
                <div className="font-medium text-xs mb-1">Condition (mm)</div>
                {levels.map(l => (
                    <div key={l.label} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: l.color }} />
                        <span>{l.label}</span>
                    </div>
                ))}
            </>
        )
    }

    const renderPercentLegend = () => {
        const min = stats.minThickness;
        const max = stats.maxThickness;
        const levels = [
            { pct: 1, label: `${max.toFixed(2)}mm (Max)` },
            { pct: 0.75, label: '' },
            { pct: 0.5, label: `${((max + min) / 2).toFixed(2)}mm` },
            { pct: 0.25, label: '' },
            { pct: 0, label: `${min.toFixed(2)}mm (Min)` },
        ];
        return (
             <>
                <div className="font-medium text-xs mb-1">Normalized (%)</div>
                <div className="flex flex-col-reverse">
                {levels.map(l => (
                    <div key={l.pct} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: getNormalizedColor(l.pct) }} />
                        <span>{l.label}</span>
                    </div>
                ))}
                </div>
            </>
        )
    }

    return (
        <Card className="mt-4">
          <CardHeader className="p-3">
             <CardTitle className="text-base font-headline">Legend</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-xs">
            {mode === 'mm' ? renderMmLegend() : renderPercentLegend()}
            <div className="text-xs text-muted-foreground mt-1">ND: transparent</div>
          </CardContent>
        </Card>
    )
}

const getNiceInterval = (range: number, maxTicks: number): number => {
    if (range === 0) return 1;
    const roughStep = range / maxTicks;
    const goodSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    const step = goodSteps.find(s => s > roughStep) || goodSteps[goodSteps.length - 1];
    return step;
};


// --- Main Component ---
export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const xAxisRef = useRef<HTMLDivElement>(null);
  const yAxisRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const { mergedGrid, stats, nominalThickness, plates } = inspectionResult || {};
  const { gridSize, minThickness: minEffT, maxThickness: maxEffT } = stats || {};
  
  const BASE_CELL_SIZE = 6;
  const scaledCellSize = BASE_CELL_SIZE * zoom;
  const AXIS_SIZE = 35; // Space for axis labels

  const plateBoundaries = useMemo(() => {
    if (!mergedGrid || !plates || plates.length <= 1) return [];

    const boundaries: { x: number; y: number; width: number; height: number, plateId: string }[] = [];
    const height = mergedGrid.length;
    if (height === 0) return [];
    const width = mergedGrid[0].length;
    
    const plateIds = plates.map(p => p.id);
    plateIds.forEach(id => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let found = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (mergedGrid[y][x]?.plateId === id) {
            found = true;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (found) {
        boundaries.push({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          plateId: id
        });
      }
    });
    return boundaries;
  }, [mergedGrid, plates]);


  // --- Drawing Logic ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!gridSize || !mergedGrid) return;
    
    const canvasWidth = gridSize.width * scaledCellSize;
    const canvasHeight = gridSize.height * scaledCellSize;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
    ctx.fillRect(0, 0, canvas.width, canvas.height);


    // Heatmap
    const allEffThicknesses = mergedGrid.flat().map(c => c?.effectiveThickness).filter(t => t !== null) as number[];
    const minEffT = Math.min(...allEffThicknesses);
    const effTRange = Math.max(...allEffThicknesses) - minEffT;
    
    for (let y = 0; y < gridSize.height; y++) {
      for (let x = 0; x < gridSize.width; x++) {
        const point = mergedGrid[y]?.[x];
        let color: string;
        
        if (!point || point.effectiveThickness === null) {
          color = 'transparent';
        } else if (colorMode === '%') {
            const normalized = effTRange > 0
                ? (point.effectiveThickness - minEffT) / effTRange
                : 0;
            color = getNormalizedColor(normalized);
        } else {
            color = getAbsColor(point.percentage);
        }
        
        if (color !== 'transparent') {
          ctx.fillStyle = color;
          ctx.fillRect(x * scaledCellSize, y * scaledCellSize, scaledCellSize, scaledCellSize);
        }
      }
    }
    
    // Grid Lines (only when zoomed in)
    if (zoom > 8) {
      ctx.strokeStyle = "rgba(100, 100, 100, 0.2)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= gridSize.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * scaledCellSize, 0);
        ctx.lineTo(x * scaledCellSize, canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= gridSize.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * scaledCellSize);
        ctx.lineTo(canvasWidth, y * scaledCellSize);
        ctx.stroke();
      }
    }
    
    // Plate Boundaries
    ctx.strokeStyle = '#FFFFFF'; // White boundaries
    ctx.lineWidth = Math.max(1, 2 * zoom / 10);
    plateBoundaries.forEach(b => {
        ctx.strokeRect(b.x * scaledCellSize, b.y * scaledCellSize, b.width * scaledCellSize, b.height * scaledCellSize);
    });

    // Selection outline
    if (selectedPoint) {
        ctx.strokeStyle = '#00ffff'; // Cyan
        ctx.lineWidth = Math.max(1, 3 * zoom / 10);
        ctx.strokeRect(selectedPoint.x * scaledCellSize, selectedPoint.y * scaledCellSize, scaledCellSize, scaledCellSize);
    }
    
  }, [gridSize, colorMode, mergedGrid, zoom, scaledCellSize, selectedPoint, plateBoundaries]);

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

  // --- Interaction Handlers ---
  const adjustZoom = (factor: number) => {
    const newZoom = zoom * factor;
    const clampedZoom = Math.max(0.2, Math.min(newZoom, 50));
    setZoom(clampedZoom);
  };
  
  const resetView = () => {
    setZoom(1);
    if(scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
        scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridSize || !mergedGrid || !canvasRef.current) { setHoveredPoint(null); return; };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor(x / scaledCellSize);
    const gridY = Math.floor(y / scaledCellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        const pointData = mergedGrid[gridY]?.[gridX];
        if(pointData && pointData.plateId) {
             setHoveredPoint({ x: gridX, y: gridY, ...pointData, clientX: e.clientX, clientY: e.clientY });
        } else {
            setHoveredPoint(null);
        }
    } else {
        setHoveredPoint(null);
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridSize || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor(x / scaledCellSize);
    const gridY = Math.floor(y / scaledCellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
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
  

  // --- Render ---
  if (!inspectionResult) return null

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <Card className="h-full flex flex-col md:col-span-3">
        <CardHeader>
          <CardTitle className="font-headline">2D Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow relative p-0 border-t flex flex-col">
            <div className="relative w-full h-full flex">
                {/* Y Axis */}
                <div className="flex-shrink-0" style={{ width: AXIS_SIZE }}>
                    <div ref={yAxisRef} className="relative h-full">
                       {renderYAxis()}
                    </div>
                </div>

                <div className="flex-grow flex flex-col overflow-hidden">
                    {/* X Axis */}
                    <div className="flex-shrink-0" style={{ height: AXIS_SIZE }}>
                       <div ref={xAxisRef} className="relative h-full">
                          {renderXAxis()}
                       </div>
                    </div>
                    
                    {/* Canvas Scroll Area */}
                    <div ref={scrollContainerRef} className="flex-grow overflow-auto" onScroll={handleScroll}>
                         <div 
                            className="relative"
                            style={{ width: gridSize.width * scaledCellSize, height: gridSize.height * scaledCellSize }}
                         >
                            <canvas 
                                ref={canvasRef}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={() => setHoveredPoint(null)}
                                onClick={handleClick}
                                className="absolute top-0 left-0"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {hoveredPoint && (
              <div
                className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-20"
                style={{
                  left: `${hoveredPoint.clientX + 15}px`,
                  top: `${hoveredPoint.clientY - 30}px`,
                }}
              >
                <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
                 {hoveredPoint.plateId && <div className="text-muted-foreground truncate max-w-[200px]">{hoveredPoint.plateId}</div>}
                <div>Eff. Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
              </div>
            )}
        </CardContent>
      </Card>
      <div className="md:col-span-1 space-y-4">
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <RadioGroup value={colorMode} onValueChange={(val) => setColorMode(val as ColorMode)} className="space-y-2">
                    <Label>Color Scale</Label>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mm" id="mm-2d" />
                      <Label htmlFor="mm-2d" className="flex items-center gap-2 font-normal"><Ruler className="h-4 w-4"/> Condition (mm)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="%" id="pct-2d" />
                      <Label htmlFor="pct-2d" className="flex items-center gap-2 font-normal"><Percent className="h-4 w-4"/>Normalized (%)</Label>                    </div>
                </RadioGroup>
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
        {stats && nominalThickness && (
          <ColorLegend mode={colorMode} stats={stats} nominalThickness={nominalThickness} />
        )}
      </div>
    </div>
  )
}

    