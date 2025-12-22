
"use client"

import React, { forwardRef, useImperativeHandle } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView2D, PlateView2DRef } from '@/components/visualizations/PlateView2D';
import { PipeView2D, PipeView2DRef } from '@/components/visualizations/PipeView2D';
import { VesselView2D, VesselView2DRef } from '@/components/visualizations/VesselView2D';


export type TwoDeeViewRef = PlateView2DRef | PipeView2DRef | VesselView2DRef;

export const TwoDeeHeatmapTab = forwardRef<TwoDeeViewRef, {}>((props, ref) => {
  const { inspectionResult } = useInspectionStore();
  const plateViewRef = React.useRef<PlateView2DRef>(null);
  const pipeViewRef = React.useRef<PipeView2DRef>(null);
  const vesselViewRef = React.useRef<VesselView2DRef>(null);


  useImperativeHandle(ref, () => ({
    capture: () => {
      switch (inspectionResult?.assetType) {
        case 'Pipe': return pipeViewRef.current?.capture() || '';
        case 'Vessel': return vesselViewRef.current?.capture() || '';
        case 'Tank': return pipeViewRef.current?.capture() || ''; // Tank also uses unwrapped view
        case 'Plate':
        default:
          return plateViewRef.current?.capture() || '';
      }
    }
  }));

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
    case 'Tank':
      return <PipeView2D ref={pipeViewRef} />;
    case 'Vessel':
      return <VesselView2D ref={vesselViewRef} />;
    case 'Plate':
    default:
      return <PlateView2D ref={plateViewRef} />;
  }
});
TwoDeeHeatmapTab.displayName = "TwoDeeHeatmapTab";
