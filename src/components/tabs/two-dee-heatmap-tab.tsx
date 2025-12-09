
"use client"

import React, { forwardRef, useImperativeHandle } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView2D, PlateView2DRef } from '@/components/visualizations/PlateView2D';
import { PipeView2D, PipeView2DRef } from '@/components/visualizations/PipeView2D';

export type TwoDeeViewRef = PlateView2DRef | PipeView2DRef;

export const TwoDeeHeatmapTab = forwardRef<TwoDeeViewRef, {}>((props, ref) => {
  const { inspectionResult } = useInspectionStore();
  const plateViewRef = React.useRef<PlateView2DRef>(null);
  const pipeViewRef = React.useRef<PipeView2DRef>(null);

  useImperativeHandle(ref, () => ({
    capture: () => {
      if (inspectionResult?.assetType === 'Plate') {
        return plateViewRef.current?.capture() || '';
      }
      return pipeViewRef.current?.capture() || '';
    }
  }));

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
    case 'Tank':
    case 'Vessel':
      return <PipeView2D ref={pipeViewRef} />;
    case 'Plate':
    default:
      return <PlateView2D ref={plateViewRef} />;
  }
});
TwoDeeHeatmapTab.displayName = "TwoDeeHeatmapTab";
