
"use client"

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Percent, Ruler, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'


const getNiceInterval = (range: number, maxTicks: number): number => {
    if (range === 0) return 1;
    const roughStep = range / maxTicks;
    const goodSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    const step = goodSteps.find(s => s > roughStep) || goodSteps[goodSteps.length - 1];
    return step;
};


// --- Main Component ---
export function PlateView2D() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode, dataVersion } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const xAxisRef = useRef<HTMLDivElement>(null);
  const yAxisRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const { nominalThickness } = inspectionResult || {};
  const { gridSize, minThickness, maxThickness, totalPoints } = DataVault.stats || {};
  const gridMatrix = DataVault.gridMatrix;
  
  const BASE_CELL_SIZE = 6;
  const scaledCellSize = BASE_CELL_SIZE * zoom;
  const AXIS_SIZE = 45; // Space for axis labels

  // --- Drawing Logic ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridSize || !DataVault.colorBuffer) return;
    
    const { width, height } = gridSize;
    const canvasWidth = width * scaledCellSize;
    const canvasHeight = height * scaledCellSize;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create an ImageData object from the color buffer in the vault
    const imageData = new ImageData(new Uint8ClampedArray(DataVault.colorBuffer), width, height);

    // Create a temporary canvas to draw the initial image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.putImageData(imageData, 0, 0);

    // Scale up the image to the main canvas
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, canvasWidth, canvasHeight);
    
    // Selection outline
    if (selectedPoint) {
        ctx.strokeStyle = '#00ffff'; // Cyan
        ctx.lineWidth = Math.max(1.5, 3 * zoom / 10);
        ctx.strokeRect(selectedPoint.x * scaledCellSize, selectedPoint.y * scaledCellSize, scaledCellSize, scaledCellSize);
    }
    
  }, [gridSize, dataVersion, zoom, scaledCellSize, selectedPoint]);

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
    if (!gridSize || !gridMatrix || !canvasRef.current) { setHoveredPoint(null); return; };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor(x / scaledCellSize);
    const gridY = Math.floor(y / scaledCellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        const pointData = gridMatrix[gridY]?.[gridX];
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
  if (!inspectionResult || !DataVault.stats || !gridMatrix) return null;

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
                    <div className='text-xs text-muted-foreground -rotate-90 whitespace-nowrap absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 origin-center'>Y Coordinate (mm)</div>
                    <div ref={yAxisRef} className="relative h-full pt-1">
                       {renderYAxis()}
                    </div>
                </div>

                <div className="flex-grow flex flex-col overflow-hidden">
                    {/* X Axis */}
                    <div className="flex-shrink-0" style={{ height: AXIS_SIZE }}>
                       <div className='text-xs text-muted-foreground absolute bottom-0 left-1/2 -translate-x-1/2 pb-1'>X Coordinate (mm)</div>
                       <div ref={xAxisRef} className="relative h-full pr-1">
                          {renderXAxis()}
                       </div>
                    </div>
                    
                    {/* Canvas Scroll Area */}
                    <div ref={scrollContainerRef} className="flex-grow overflow-auto" onScroll={handleScroll}>
                         <div 
                            className="relative"
                            style={{ width: (gridSize?.width ?? 0) * scaledCellSize, height: (gridSize?.height ?? 0) * scaledCellSize }}
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
                <div>Raw Thick: {hoveredPoint.rawThickness?.toFixed(2) ?? 'ND'} mm</div>
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
                      <Label htmlFor="mm-2d" className="flex items-center gap-2 font-normal"><Ruler className="h-4 w-4"/> Condition</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="%" id="pct-2d" />
                      <Label htmlFor="pct-2d" className="flex items-center gap-2 font-normal"><Percent className="h-4 w-4"/>Normalized</Label>                    </div>
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
      </div>
    </div>
  )
}

    