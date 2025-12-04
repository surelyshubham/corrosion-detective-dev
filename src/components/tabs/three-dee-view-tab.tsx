
"use client"

import React from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D } from '@/components/visualizations/PlateView3D';
import { PipeView3D } from '@/components/visualizations/PipeView3D';

export function ThreeDeeViewTab() {
  const { inspectionResult } = useInspectionStore();

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
    case 'Tank':
    case 'Vessel':
      return <PipeView3D />;
    case 'Plate':
    default:
      return <PlateView3D />;
  }
}
