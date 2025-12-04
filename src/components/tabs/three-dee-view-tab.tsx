
"use client"

import React, { useRef, useCallback, useEffect } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D, type PlateView3DRef } from '@/components/visualizations/PlateView3D';
import { PipeView3D, type PipeView3DRef } from '@/components/visualizations/PipeView3D';
import { TankView3D, type TankView3DRef } from '@/components/visualizations/TankView3D';
import { useReportStore } from '@/store/use-report-store';

export function ThreeDeeViewTab() {
  const { inspectionResult } = useInspectionStore();
  const { setCaptureFunctions, is3dViewReady } = useReportStore();

  const plateRef = useRef<PlateView3DRef>(null);
  const pipeRef = useRef<PipeView3DRef>(null);
  const tankRef = useRef<TankView3DRef>(null);

  const handleReady = useCallback(() => {
    let functions;
    if (!inspectionResult || is3dViewReady) return; // Don't set if already ready
    
    switch (inspectionResult.assetType) {
      case 'Pipe':
        functions = {
          capture: () => pipeRef.current?.captureScreenshot() || '',
          focus: (x: number, y: number) => pipeRef.current?.focusOnPoint(x, y),
          resetCamera: () => pipeRef.current?.resetCamera(),
        };
        break;
      case 'Tank':
      case 'Vessel':
        functions = {
          capture: () => tankRef.current?.captureScreenshot() || '',
          focus: (x: number, y: number) => tankRef.current?.focusOnPoint(x, y),
          resetCamera: () => tankRef.current?.resetCamera(),
        };
        break;
      case 'Plate':
      default:
        functions = {
          capture: () => plateRef.current?.captureScreenshot() || '',
          focus: (x: number, y: number) => plateRef.current?.focusOnPoint(x, y),
          resetCamera: () => plateRef.current?.resetCamera(),
        };
        break;
    }
    setCaptureFunctions({ ...functions, isReady: true });
  }, [setCaptureFunctions, inspectionResult, is3dViewReady]);


  useEffect(() => {
    // When the inspection result changes (e.g., cleared or reloaded), reset the ready state.
    // This ensures that the new 3D model correctly registers its functions.
    if (!inspectionResult) {
      setCaptureFunctions({ capture: () => '', focus: () => {}, resetCamera: () => {}, isReady: false });
    }
  }, [inspectionResult, setCaptureFunctions]);


  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
      return <PipeView3D ref={pipeRef} onReady={handleReady}/>;
    case 'Tank':
    case 'Vessel':
      return <TankView3D ref={tankRef} onReady={handleReady}/>;
    case 'Plate':
    default:
      return <PlateView3D ref={plateRef} onReady={handleReady}/>;
  }
}
