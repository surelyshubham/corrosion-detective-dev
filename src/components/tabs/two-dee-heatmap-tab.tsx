"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useResizeDetector } from 'react-resize-detector'

// % Thickness Color
// >70% Red
// 61-70% Dark Orange
// 51-60% Orange
// 41-50% Yellow
// 31-40% Light Green
// 21-30% Green
// 11-20% Teal
// 0-10% Blue
// ND Transparent

const getColor = (percentage: number | null) => {
    if (percentage === null) return 'rgba(0,0,0,0)'; // Transparent for ND
    if (percentage > 70) return '#ef4444'; // Red
    if (percentage > 60) return '#f97316'; // Dark Orange
    if (percentage > 50) return '#f59e0b'; // Orange
    if (percentage > 40) return '#eab308'; // Yellow
    if (percentage > 30) return '#84cc16'; // Light Green
    if (percentage > 20) return '#22c55e'; // Green
    if (percentage > 10) return '#14b8a6'; // Teal
    return '#3b82f6'; // Blue
};

export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  const { width, ref: containerRef } = useResizeDetector();

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas || !inspectionResult || !width) return;
    
    const { processedData, stats } = inspectionResult
    const { gridSize } = stats;

    const canvasWidth = width;
    const pixelSizeX = canvasWidth / gridSize.width;
    const canvasHeight = pixelSizeX * gridSize.height;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Create a map for quick lookup
    const dataMap = new Map<string, any>();
    processedData.forEach(p => dataMap.set(`${p.x},${p.y}`, p));

    for (let i = 0; i < gridSize.width; i++) {
        for (let j = 0; j < gridSize.height; j++) {
            const point = dataMap.get(`${i},${j}`);
            ctx.fillStyle = getColor(point?.percentage ?? null);
            ctx.fillRect(i * pixelSizeX, j * pixelSizeX, pixelSizeX, pixelSizeX);

            if(selectedPoint && selectedPoint.x === i && selectedPoint.y === j) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeRect(i * pixelSizeX, j * pixelSizeX, pixelSizeX, pixelSizeX);
            }
        }
    }

  }, [inspectionResult, width, selectedPoint]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !inspectionResult || !width) return;
    
    const { stats } = inspectionResult;
    const { gridSize } = stats;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pixelSizeX = width / gridSize.width;

    const gridX = Math.floor(x / pixelSizeX);
    const gridY = Math.floor(y / pixelSizeX);

    const point = inspectionResult.processedData.find(p => p.x === gridX && p.y === gridY);
    setHoveredPoint(point ? { ...point, clientX: e.clientX, clientY: e.clientY } : null);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if(hoveredPoint) {
          setSelectedPoint({x: hoveredPoint.x, y: hoveredPoint.y});
      }
  }

  if (!inspectionResult) return null

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-headline">2D Heatmap</CardTitle>
      </CardHeader>
      <CardContent ref={containerRef} className="relative h-[calc(100%-4rem)]">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ touchAction: 'none' }}
        />
        {hoveredPoint && (
          <div
            className="absolute p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border"
            style={{
              left: `${hoveredPoint.clientX + 15}px`,
              top: `${hoveredPoint.clientY + 15}px`,
              transform: `translate(-50%, -100%)`
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
