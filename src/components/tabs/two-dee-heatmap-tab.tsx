
"use client"

import React from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView2D } from '@/components/visualizations/PlateView2D';
import { PipeView2D } from '@/components/visualizations/PipeView2D';

export function TwoDeeHeatmapTab() {
  const { inspectionResult } = useInspectionStore();

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
    case 'Tank':
    case 'Vessel':
      return <PipeView2D />;
    case 'Plate':
    default:
      return <PlateView2D />;
  }
}
