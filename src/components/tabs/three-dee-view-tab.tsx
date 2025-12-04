
"use client"

import React, { useRef, useCallback, useEffect } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D, type PlateView3DRef } from '@/components/visualizations/PlateView3D';
import { PipeView3D, type PipeView3DRef } from '@/components/visualizations/PipeView3D';
import { TankView3D, type TankView3DRef } from '@/components/visualizations/TankView3D';
import { useReportStore } from '@/store/use-report-store';

type ViewRef = PlateView3DRef | PipeView3DRef | TankView3DRef;

export function ThreeDeeViewTab() {
  const { inspectionResult } = useInspectionStore();
  const { setCaptureFunctions, is3dViewReady } = useReportStore();

  const viewRef = useRef<ViewRef>(null);

  const handleReady = useCallback(() => {
    if (!inspectionResult || is3dViewReady || !viewRef.current) return;
    
    const functions = {
      capture: () => viewRef.current?.captureScreenshot() || '',
      focus: (x: number, y: number, zoomIn: boolean) => viewRef.current?.focusOnPoint(x, y, zoomIn),
      resetCamera: () => viewRef.current?.resetCamera(),
      setView: (view: 'iso' | 'top' | 'side') => viewRef.current?.setView(view),
    };
    
    setCaptureFunctions({ ...functions, isReady: true });
  }, [setCaptureFunctions, inspectionResult, is3dViewReady]);


  useEffect(() => {
    // When the inspection result changes (e.g., cleared or reloaded), reset the ready state.
    // This ensures that the new 3D model correctly registers its functions.
    if (!inspectionResult) {
      setCaptureFunctions({ 
          capture: () => '', 
          focus: () => {}, 
          resetCamera: () => {}, 
          setView: () => {}, 
          isReady: false 
      });
    }
  }, [inspectionResult, setCaptureFunctions]);


  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
      return <PipeView3D ref={viewRef as React.Ref<PipeView3DRef>} onReady={handleReady}/>;
    case 'Tank':
    case 'Vessel':
      return <TankView3D ref={viewRef as React.Ref<TankView3DRef>} onReady={handleReady}/>;
    case 'Plate':
    default:
      return <PlateView3D ref={viewRef as React.Ref<PlateView3DRef>} onReady={handleReady}/>;
  }
}
