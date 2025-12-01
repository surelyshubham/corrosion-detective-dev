
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Percent, Ruler, ZoomIn, Search, MousePointer } from 'lucide-react'

// --- Color Helper Functions ---
const getAbsColor = (percentage: number | null): string => {
    if (percentage === null) return '#888888'; // Grey for ND
    if (percentage <= 60) return '#ff0000'; // Red
    if (percentage <= 80) return '#ffa500'; // Orange
    if (percentage <= 95) return '#ffff00'; // Yellow
    return '#00ff00'; // Green
};

const getNormalizedColor = (normalizedPercent: number | null): string => {
    if (normalizedPercent === null) return '#888888'; // Grey for ND
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
                <div className="font-medium text-xs mb-1">Eff. Thickness (% of {nominalThickness}mm)</div>
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
                <div className="font-medium text-xs mb-1">Eff. Thickness (Normalized)</div>
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
        <div className="absolute top-2 left-2 bg-card/80 p-2 rounded-md text-card-foreground border text-xs z-10 pointer-events-none">
            {mode === 'mm' ? renderMmLegend() : renderPercentLegend()}
            <div className="text-xs text-muted-foreground mt-1">ND: Gray</div>
        </div>
    )
}

const getNiceInterval = (range: number, maxTicks: number): number => {
    const roughStep = range / maxTicks;
    const goodSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const step = goodSteps.find(s => s > roughStep) || goodSteps[goodSteps.length - 1];
    return step;
};


// --- Main Component ---
export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)

  const { processedData, stats, nominalThickness } = inspectionResult || {};
  const { gridSize, minThickness: minEffT, maxThickness: maxEffT } = stats || {};
  const effTRange = (maxEffT && minEffT) ? maxEffT - minEffT : 0;
  
  const AXIS_SIZE = 40;

  const dataMap = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!processedData) return map;
    processedData.forEach(p => map.set(`${p.x},${p.y}`, p));
    return map;
  }, [processedData]);

  // --- Drawing Logic ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridSize || !containerRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: cols, height: rows } = gridSize;
    const baseCellSize = (containerWidth - AXIS_SIZE) / cols;

    canvas.width = containerWidth - AXIS_SIZE;
    canvas.height = containerHeight - AXIS_SIZE;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    
    // Draw Heatmap
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const point = dataMap.get(`${x},${y}`);
        let color: string;
        
        if (point === undefined) continue;

        if (colorMode === '%') {
            const normalized = (point?.effectiveThickness !== null && effTRange > 0)
                ? (point.effectiveThickness - minEffT) / effTRange
                : null;
            color = getNormalizedColor(normalized);
        } else {
            color = getAbsColor(point?.percentage ?? null);
        }

        ctx.fillStyle = color;
        ctx.fillRect(x * baseCellSize, y * baseCellSize, baseCellSize, baseCellSize);
      }
    }
    
    // Draw Bounded Grid Lines
    if (transform.scale > 5) {
      ctx.strokeStyle = "rgba(200, 200, 200, 0.2)";
      ctx.lineWidth = 1 / transform.scale;
      for (let x = 0; x <= cols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * baseCellSize, 0);
        ctx.lineTo(x * baseCellSize, rows * baseCellSize);
        ctx.stroke();
      }
      for (let y = 0; y <= rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * baseCellSize);
        ctx.lineTo(cols * baseCellSize, y * baseCellSize);
        ctx.stroke();
      }
    }

    // Draw selection outline
    if (selectedPoint) {
        ctx.strokeStyle = '#00ffff'; // Cyan
        ctx.lineWidth = 2 / transform.scale;
        ctx.strokeRect(selectedPoint.x * baseCellSize, selectedPoint.y * baseCellSize, baseCellSize, baseCellSize);
    }
    
    ctx.restore();

  }, [gridSize, colorMode, dataMap, minEffT, effTRange, transform, selectedPoint]);

  useEffect(() => {
    if(!containerRef.current) return;
    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);


  // --- Interaction Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setLastPanPoint({ x: e.clientX, y: e.clientY });
  };
  
  const handleMouseUp = () => setIsPanning(false);
  const handleMouseLeave = () => {
    setIsPanning(false);
    setHoveredPoint(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
        const dx = e.clientX - lastPanPoint.x;
        const dy = e.clientY - lastPanPoint.y;
        setTransform(t => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
        setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
    
    // Tooltip logic
    if (!gridSize || !containerRef.current || !canvasRef.current) {
        setHoveredPoint(null);
        return;
    };
    
    const containerWidth = containerRef.current.clientWidth;
    const baseCellSize = (containerWidth - AXIS_SIZE) / gridSize.width;
    const rect = canvasRef.current.getBoundingClientRect();
    
    const x = (e.clientX - rect.left - transform.offsetX) / transform.scale;
    const y = (e.clientY - rect.top - transform.offsetY) / transform.scale;

    const gridX = Math.floor(x / baseCellSize);
    const gridY = Math.floor(y / baseCellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        const pointData = dataMap.get(`${gridX},${gridY}`);
        if(pointData) {
            setHoveredPoint({ ...pointData, clientX: e.clientX, clientY: e.clientY });
        } else {
            setHoveredPoint(null);
        }
    } else {
        setHoveredPoint(null);
    }
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const scaleAmount = 1.1;
    const zoomFactor = e.deltaY < 0 ? scaleAmount : 1 / scaleAmount;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setTransform(t => {
      const newScale = Math.max(0.1, t.scale * zoomFactor);
      const newOffsetX = mouseX - (mouseX - t.offsetX) * zoomFactor;
      const newOffsetY = mouseY - (mouseY - t.offsetY) * zoomFactor;
      return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
    });
  };

  const handleDoubleClick = () => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridSize || !containerRef.current || !canvasRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const baseCellSize = (containerWidth - AXIS_SIZE) / gridSize.width;
    const rect = canvasRef.current.getBoundingClientRect();
    
    const x = (e.clientX - rect.left - transform.offsetX) / transform.scale;
    const y = (e.clientY - rect.top - transform.offsetY) / transform.scale;

    const gridX = Math.floor(x / baseCellSize);
    const gridY = Math.floor(y / baseCellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        setSelectedPoint({ x: gridX, y: gridY });
    }
  }

  // --- Axis Rendering ---
  const renderXAxis = () => {
    if (!gridSize || !containerRef.current) return null;
    const containerWidth = containerRef.current.clientWidth;
    const baseCellSize = (containerWidth - AXIS_SIZE) / gridSize.width;
    
    const maxTicks = Math.floor((containerWidth - AXIS_SIZE) / 50);
    const interval = getNiceInterval(gridSize.width / transform.scale, maxTicks);

    const ticks = [];
    for(let i = 0; i < gridSize.width; i++) {
        if (i % interval === 0) {
            const xPos = transform.offsetX + (i * baseCellSize * transform.scale);
            if (xPos > -baseCellSize * transform.scale && xPos < containerWidth - AXIS_SIZE) {
                ticks.push({ label: i, pos: xPos });
            }
        }
    }

    return (
        <div className="absolute top-0 left-[40px] right-0 h-[40px] border-b pointer-events-none">
            {ticks.map(tick => (
                <div key={tick.label} className="absolute top-0 text-xs text-muted-foreground" style={{ transform: `translateX(${tick.pos}px)`}}>
                    <span className="absolute top-[22px] -translate-x-1/2">{tick.label}</span>
                    <div className="absolute top-[18px] w-px h-1 bg-muted-foreground" />
                </div>
            ))}
        </div>
    );
  };

  const renderYAxis = () => {
     if (!gridSize || !containerRef.current) return null;
    const containerHeight = containerRef.current.clientHeight;
    
    const maxTicks = Math.floor((containerHeight - AXIS_SIZE) / 40);
    const interval = getNiceInterval(gridSize.height / transform.scale, maxTicks);
    
    const containerWidth = containerRef.current.clientWidth;
    const baseCellSize = (containerWidth - AXIS_SIZE) / gridSize.width;

    const ticks = [];
    for(let i = 0; i < gridSize.height; i++) {
        if (i % interval === 0) {
            const yPos = transform.offsetY + (i * baseCellSize * transform.scale);
             if (yPos > -baseCellSize * transform.scale && yPos < containerHeight - AXIS_SIZE) {
                ticks.push({ label: i, pos: yPos });
            }
        }
    }
    return (
        <div className="absolute left-0 top-[40px] bottom-0 w-[40px] border-r pointer-events-none">
            {ticks.map(tick => (
                <div key={tick.label} className="absolute left-0 text-xs text-muted-foreground" style={{ transform: `translateY(${tick.pos}px)`}}>
                    <span className="absolute left-[20px] top-0 -translate-y-1/2 -translate-x-full">{tick.label}</span>
                    <div className="absolute left-[35px] h-px w-1 bg-muted-foreground" />
                </div>
            ))}
        </div>
    );
  };

  // --- Render ---
  if (!inspectionResult) return null

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <Card className="h-full flex flex-col md:col-span-3">
        <CardHeader>
          <CardTitle className="font-headline">2D Heatmap</CardTitle>
        </CardHeader>
        <CardContent ref={containerRef} className="flex-grow relative p-0 overflow-hidden bg-muted/20">
            {renderXAxis()}
            {renderYAxis()}
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
                onDoubleClick={handleDoubleClick}
                onClick={handleClick}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute top-[40px] left-[40px] cursor-grab active:cursor-grabbing"
            />
            {stats && nominalThickness && (
              <ColorLegend mode={colorMode} stats={stats} nominalThickness={nominalThickness} />
            )}
            {hoveredPoint && (
              <div
                className="absolute p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-20"
                style={{
                  left: `${hoveredPoint.clientX}px`,
                  top: `${hoveredPoint.clientY}px`,
                  transform: `translate(15px, -100%)`
                }}
              >
                <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
                <div>Raw Thick: {hoveredPoint.rawThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Eff. Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
              </div>
            )}
            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground pointer-events-none p-2 rounded bg-background/80 border z-10">
              <p className="flex items-center gap-1"><MousePointer className="h-3 w-3"/> Drag to Pan</p>
              <p className="flex items-center gap-1"><ZoomIn className="h-3 w-3"/> Scroll to Zoom</p>
              <p className="flex items-center gap-1"><Search className="h-3 w-3"/> Dbl-Click to Reset</p>
            </div>
        </CardContent>
      </Card>
      <div className="md:col-span-1 space-y-4">
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent>
                <RadioGroup value={colorMode} onValueChange={(val) => setColorMode(val as ColorMode)} className="space-y-2">
                    <Label>Color Scale</Label>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mm" id="mm-2d" />
                      <Label htmlFor="mm-2d" className="flex items-center gap-2 font-normal"><Ruler className="h-4 w-4"/> Absolute (mm)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="%" id="pct-2d" />
                      <Label htmlFor="pct-2d" className="flex items-center gap-2 font-normal"><Percent className="h-4 w-4"/>Normalized (%)</Label>
                    </div>
                </RadioGroup>
            </CardContent>
        </Card>
      </div>
    </div>
  )
}

    