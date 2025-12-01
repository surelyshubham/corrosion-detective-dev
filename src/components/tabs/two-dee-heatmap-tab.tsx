
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useResizeDetector } from 'react-resize-detector'

// Based on thickness percentage:
// Red        = 0–20%
// Orange     = 21–40%
// Yellow     = 41–60%
// LightGreen = 61–80%
// DarkGreen  = 81–100%
const getColor = (percentage: number | null) => {
    if (percentage === null) return 'rgba(128,128,128,0.5)'; // Grey for ND
    if (percentage <= 20) return '#ff0000'; // Red
    if (percentage <= 40) return '#ffa500'; // Orange
    if (percentage <= 60) return '#ffff00'; // Yellow
    if (percentage <= 80) return '#90ee90'; // LightGreen
    return '#006400'; // DarkGreen
};

const AXIS_COLOR = '#888';
const FONT = '10px sans-serif';
const MARGIN = { top: 20, right: 20, bottom: 40, left: 40 };

export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  const { width, height, ref: containerRef } = useResizeDetector();

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas || !inspectionResult || !width || !height) return;

    const { processedData, stats } = inspectionResult
    const { gridSize } = stats;

    canvas.width = width;
    canvas.height = height;
    
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    ctx.clearRect(0, 0, width, height);
    
    // Move origin to top-left of the plotting area
    ctx.save();
    ctx.translate(MARGIN.left, MARGIN.top);

    // Create a map for quick lookup
    const dataMap = new Map<string, any>();
    processedData.forEach(p => dataMap.set(`${p.x},${p.y}`, p));

    const pixelSizeX = plotWidth / gridSize.width;
    const pixelSizeY = plotHeight / gridSize.height;

    // Draw Heatmap
    for (let i = 0; i < gridSize.width; i++) {
        for (let j = 0; j < gridSize.height; j++) {
            const point = dataMap.get(`${i},${j}`);
            ctx.fillStyle = getColor(point?.percentage ?? null);
            ctx.fillRect(i * pixelSizeX, j * pixelSizeY, pixelSizeX, pixelSizeY);

            if(selectedPoint && selectedPoint.x === i && selectedPoint.y === j) {
                ctx.strokeStyle = '#00ffff'; // Cyan highlight
                ctx.lineWidth = Math.max(2, pixelSizeX / 4);
                ctx.strokeRect(i * pixelSizeX, j * pixelSizeY, pixelSizeX, pixelSizeY);
            }
        }
    }
    
    ctx.restore(); // Restore context to draw axes
    
    // Draw Axes
    ctx.fillStyle = AXIS_COLOR;
    ctx.strokeStyle = AXIS_COLOR;
    ctx.font = FONT;
    ctx.lineWidth = 1;

    // Y-Axis
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, height - MARGIN.bottom);
    ctx.stroke();
    for (let i = 0; i <= 10; i++) {
        const y = MARGIN.top + (i / 10) * plotHeight;
        const yValue = gridSize.height - Math.round((i / 10) * gridSize.height);
        ctx.moveTo(MARGIN.left - 5, y);
        ctx.lineTo(MARGIN.left, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(yValue.toString(), MARGIN.left - 8, y);
    }
    ctx.save();
    ctx.translate(15, height/2);
    ctx.rotate(-Math.PI/2);
    ctx.textAlign = "center";
    ctx.fillText("Y-axis", 0, 0);
    ctx.restore();

    // X-Axis
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, height - MARGIN.bottom);
    ctx.lineTo(width - MARGIN.right, height - MARGIN.bottom);
    ctx.stroke();
    for (let i = 0; i <= 10; i++) {
        const x = MARGIN.left + (i / 10) * plotWidth;
        const xValue = Math.round((i / 10) * gridSize.width);
        ctx.moveTo(x, height - MARGIN.bottom);
        ctx.lineTo(x, height - MARGIN.bottom + 5);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(xValue.toString(), x, height - MARGIN.bottom + 8);
    }
    ctx.textAlign = "center";
    ctx.fillText("X-axis", width/2, height - 15);


  }, [inspectionResult, width, height, selectedPoint]);

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
    <Card className="h-full flex flex-col">
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
  )
}
