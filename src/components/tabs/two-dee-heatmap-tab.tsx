
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useResizeDetector } from 'react-resize-detector'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Percent, Ruler, ZoomIn, ZoomOut, Search, MousePointer } from 'lucide-react'

// --- Color Helper Functions ---
const getAbsColor = (percentage: number | null): string => {
    if (percentage === null) return 'transparent';
    if (percentage <= 60) return '#ff0000'; // Red
    if (percentage <= 80) return '#ffa500'; // Orange
    if (percentage <= 95) return '#ffff00'; // Yellow
    return '#00ff00'; // Green
};

const getNormalizedColor = (normalizedPercent: number | null): string => {
    if (normalizedPercent === null) return 'transparent';
    const hue = 240 * (1 - normalizedPercent);
    return `hsl(${hue}, 100%, 50%)`;
};

// --- Main Component ---
export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { width: containerWidth, height: containerHeight, ref: containerRef } = useResizeDetector()
  
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })

  const { processedData, stats } = inspectionResult || {};
  const { gridSize, minThickness: minEffT, maxThickness: maxEffT } = stats || {};
  const effTRange = (maxEffT && minEffT) ? maxEffT - minEffT : 0;

  const dataMap = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!processedData) return map;
    processedData.forEach(p => map.set(`${p.x},${p.y}`, p));
    return map;
  }, [processedData]);

  // --- Drawing Logic ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridSize || !containerWidth || !containerHeight) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: cols, height: rows } = gridSize;
    const cellSize = containerWidth / cols;

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    
    // Draw Heatmap
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const point = dataMap.get(`${x},${y}`);
        let color: string;
        if (colorMode === '%') {
            const normalized = (point?.effectiveThickness !== null && effTRange > 0)
                ? (point.effectiveThickness - minEffT) / effTRange
                : null;
            color = getNormalizedColor(normalized);
        } else {
            color = getAbsColor(point?.percentage ?? null);
        }

        if (color !== 'transparent') {
            ctx.fillStyle = color;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
    
    // Draw Bounded Grid Lines
    if (transform.scale > 5) { // Only draw grid if sufficiently zoomed
      ctx.strokeStyle = "rgba(200, 200, 200, 0.2)";
      ctx.lineWidth = 1 / transform.scale;
      for (let x = 0; x <= cols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize, 0);
        ctx.lineTo(x * cellSize, rows * cellSize);
        ctx.stroke();
      }
      for (let y = 0; y <= rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellSize);
        ctx.lineTo(cols * cellSize, rows * cellSize);
        ctx.stroke();
      }
    }

    // Draw selection outline
    if (selectedPoint) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2 / transform.scale;
        ctx.strokeRect(selectedPoint.x * cellSize, selectedPoint.y * cellSize, cellSize, cellSize);
    }
    
    ctx.restore();

  }, [gridSize, containerWidth, containerHeight, colorMode, dataMap, minEffT, effTRange, transform, selectedPoint]);

  useEffect(() => {
    draw();
  }, [draw]);

  // --- Interaction Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(true);
    setLastPanPoint({ x: e.clientX, y: e.clientY });
  };
  
  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - lastPanPoint.x;
    const dy = e.clientY - lastPanPoint.y;
    setTransform(t => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
    setLastPanPoint({ x: e.clientX, y: e.clientY });
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setTransform(t => {
      const newScale = Math.max(0.1, t.scale * scaleAmount);
      const newOffsetX = mouseX - (mouseX - t.offsetX) * scaleAmount;
      const newOffsetY = mouseY - (mouseY - t.offsetY) * scaleAmount;
      return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
    });
  };

  const handleDoubleClick = () => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!gridSize || !containerWidth) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    
    // transform canvas click to world coordinates
    const x = (e.clientX - rect.left - transform.offsetX) / transform.scale;
    const y = (e.clientY - rect.top - transform.offsetY) / transform.scale;

    const cellSize = containerWidth / gridSize.width;
    const gridX = Math.floor(x / cellSize);
    const gridY = Math.floor(y / cellSize);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        setSelectedPoint({ x: gridX, y: gridY });
    }
  }

  // --- Render ---
  if (!inspectionResult) return null

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <Card className="h-full flex flex-col md:col-span-3">
        <CardHeader>
          <CardTitle className="font-headline">2D Heatmap</CardTitle>
        </CardHeader>
        <CardContent ref={containerRef} className="flex-grow relative p-0 overflow-hidden bg-muted/20">
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
                onDoubleClick={handleDoubleClick}
                onClick={handleClick}
                className="absolute top-0 left-0 cursor-grab active:cursor-grabbing"
            />
            <div className="absolute bottom-2 left-2 text-xs text-muted-foreground pointer-events-none p-2 rounded bg-background/80 border">
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
                <RadioGroup value={colorMode} onValueChange={(val) => setColorMode(val as ColorMode)}>
                    <Label>Color Scale</Label>
                    <div className="flex items-center space-x-2 mt-2">
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
