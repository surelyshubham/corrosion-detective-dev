
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useResizeDetector } from 'react-resize-detector'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Percent, Ruler } from 'lucide-react'

const getAbsColor = (percentage: number | null): string => {
    if (percentage === null) return 'rgba(128,128,128,0.5)'; // Grey for ND
    if (percentage <= 20) return '#ff0000'; // Red
    if (percentage <= 40) return '#ffa500'; // Orange
    if (percentage <= 60) return '#ffff00'; // Yellow
    if (percentage <= 80) return '#90ee90'; // LightGreen
    return '#006400'; // DarkGreen
};

const getNormalizedColor = (normalizedPercent: number | null): string => {
    if (normalizedPercent === null) return 'rgba(128,128,128,0.5)';
    // HSL: hue from 0 (red) to 240 (blue). We'll map 0-1 to 240-0.
    const hue = 240 * (1 - normalizedPercent);
    return `hsl(${hue}, 100%, 50%)`;
};


const AXIS_COLOR = '#888';
const FONT = '10px sans-serif';
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

// Function to calculate "nice" tick intervals
const getNiceTickInterval = (maxVal: number, maxTicks = 10) => {
    if (maxVal === 0) return 1;
    const roughStep = maxVal / maxTicks;
    const stepPower = Math.pow(10, -Math.floor(Math.log10(roughStep)));
    const normalizedStep = roughStep * stepPower;
    const goodNormalizedSteps = [1, 2, 5, 10];
    const goodNormalizedStep = goodNormalizedSteps.find(step => step >= normalizedStep) || 10;
    return goodNormalizedStep / stepPower;
};

const ColorLegend = ({ mode, stats, nominalThickness }: { mode: ColorMode, stats: any, nominalThickness: number}) => {
    const renderMmLegend = () => {
        const levels = [
            { pct: 100, label: `> 80%`, color: getAbsColor(100) },
            { pct: 80, label: `61-80%`, color: getAbsColor(80) },
            { pct: 60, label: `41-60%`, color: getAbsColor(60) },
            { pct: 40, label: `21-40%`, color: getAbsColor(40) },
            { pct: 20, label: `< 20%`, color: getAbsColor(20) },
        ];
        return (
             <div className='flex flex-col gap-1'>
                <div className="font-medium text-xs">Thickness (% of {nominalThickness}mm)</div>
                 {levels.map(l => (
                    <div key={l.pct} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: l.color }} />
                        <span>{l.label}</span>
                    </div>
                ))}
            </div>
        )
    }

    const renderPercentLegend = () => {
        const min = stats.minThickness;
        const max = stats.maxThickness;
        const gradientStops = 5;
        const gradient = Array.from({ length: gradientStops }).map((_, i) => {
            const pct = 1 - i / (gradientStops - 1);
            return getNormalizedColor(pct);
        }).join(', ');
        
        return (
             <div className='flex flex-col gap-1'>
                <div className="font-medium text-xs">Thickness (Normalized)</div>
                <div className="flex items-center gap-2">
                    <div className='h-20 w-4 border' style={{ background: `linear-gradient(to top, ${gradient})`}} />
                    <div className='flex flex-col justify-between h-20 text-xs'>
                        <span>{max.toFixed(2)}mm</span>
                        <span>{min.toFixed(2)}mm</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-card/90 p-2 rounded-md border text-xs">
            {mode === 'mm' ? renderMmLegend() : renderPercentLegend()}
        </div>
    )
}


export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  const { width, height, ref: containerRef } = useResizeDetector();

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas || !inspectionResult || !width || !height) return;

    const { processedData, stats } = inspectionResult
    const { gridSize, minThickness, maxThickness } = stats;
    const thicknessRange = maxThickness - minThickness;

    canvas.width = width;
    canvas.height = height;
    
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    ctx.translate(MARGIN.left, MARGIN.top);

    const dataMap = new Map<string, any>();
    processedData.forEach(p => dataMap.set(`${p.x},${p.y}`, p));

    const pixelSizeX = plotWidth / gridSize.width;
    const pixelSizeY = plotHeight / gridSize.height;

    for (let i = 0; i < gridSize.width; i++) {
        for (let j = 0; j < gridSize.height; j++) {
            const point = dataMap.get(`${i},${j}`);
            
            let color: string;
            if (colorMode === '%') {
                const normalized = point?.thickness !== null && thicknessRange > 0
                    ? (point.thickness - minThickness) / thicknessRange
                    : null;
                color = getNormalizedColor(normalized);
            } else {
                color = getAbsColor(point?.percentage ?? null);
            }
            ctx.fillStyle = color;
            ctx.fillRect(i * pixelSizeX, j * pixelSizeY, pixelSizeX, pixelSizeY);

            if(selectedPoint && selectedPoint.x === i && selectedPoint.y === j) {
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = Math.max(2, pixelSizeX / 4);
                ctx.strokeRect(i * pixelSizeX, j * pixelSizeY, pixelSizeX, pixelSizeY);
            }
        }
    }
    
    ctx.restore();
    
    ctx.fillStyle = AXIS_COLOR;
    ctx.strokeStyle = AXIS_COLOR;
    ctx.font = FONT;
    ctx.lineWidth = 1;

    // Y-Axis
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, height - MARGIN.bottom);
    ctx.stroke();
    const yTickInterval = getNiceTickInterval(gridSize.height);
    for (let i = 0; i <= gridSize.height; i += yTickInterval) {
        const y = MARGIN.top + (i / gridSize.height) * plotHeight;
        ctx.moveTo(MARGIN.left - 5, y);
        ctx.lineTo(MARGIN.left, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(i.toString(), MARGIN.left - 8, y);
    }
    ctx.save();
    ctx.translate(15, height/2);
    ctx.rotate(-Math.PI/2);
    ctx.textAlign = "center";
    ctx.fillText("Y-axis (mm)", 0, 0);
    ctx.restore();

    // X-Axis
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, height - MARGIN.bottom);
    ctx.lineTo(width - MARGIN.right, height - MARGIN.bottom);
    ctx.stroke();
    const xTickInterval = getNiceTickInterval(gridSize.width);
    for (let i = 0; i <= gridSize.width; i += xTickInterval) {
        const x = MARGIN.left + (i / gridSize.width) * plotWidth;
        ctx.moveTo(x, height - MARGIN.bottom);
        ctx.lineTo(x, height - MARGIN.bottom + 5);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(i.toString(), x, height - MARGIN.bottom + 8);
    }
    ctx.textAlign = "center";
    ctx.fillText("X-axis (mm)", width/2, height - 15);

  }, [inspectionResult, width, height, selectedPoint, colorMode]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !inspectionResult || !width || !height) return;
    
    const { stats } = inspectionResult;
    const { gridSize } = stats;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;
    const pixelSizeX = plotWidth / gridSize.width;
    const pixelSizeY = plotHeight / gridSize.height;

    const gridX = Math.floor((x - MARGIN.left) / pixelSizeX);
    const gridY = Math.floor((y - MARGIN.top) / pixelSizeY);

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        const point = inspectionResult.processedData.find(p => p.x === gridX && p.y === gridY);
        setHoveredPoint(point ? { ...point, clientX: e.clientX, clientY: e.clientY } : null);
        
        if (e.type === 'click' && point) {
            setSelectedPoint({ x: point.x, y: point.y });
        }
    } else {
        setHoveredPoint(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  if (!inspectionResult) return null

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <Card className="h-full flex flex-col md:col-span-3">
        <CardHeader>
          <CardTitle className="font-headline">2D Heatmap</CardTitle>
        </CardHeader>
        <CardContent ref={containerRef} className="flex-grow relative p-0">
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasInteraction}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasInteraction}
            style={{ touchAction: 'none', imageRendering: 'pixelated', display: 'block' }}
          />
          {hoveredPoint && (
            <div
              className="absolute p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border"
              style={{
                left: `${hoveredPoint.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0)}px`,
                top: `${hoveredPoint.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0)}px`,
                transform: `translate(15px, -100%)`
              }}
            >
              <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
              <div>Thickness: {hoveredPoint.thickness?.toFixed(2) ?? 'ND'} mm</div>
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
        <Card>
            <CardHeader>
                 <CardTitle className="font-headline text-lg">Legend</CardTitle>
            </CardHeader>
            <CardContent>
                <ColorLegend mode={colorMode} stats={inspectionResult.stats} nominalThickness={inspectionResult.nominalThickness} />
            </CardContent>
        </Card>
      </div>
    </div>
  )
}
