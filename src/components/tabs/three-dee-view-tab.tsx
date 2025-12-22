
"use client"

import React, { useRef, useImperativeHandle, forwardRef, Ref } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D, type PlateView3DRef } from '@/components/visualizations/PlateView3D';
import { PipeView3D, type PipeView3DRef } from '@/components/visualizations/PipeView3D';
import { TankView3D, type TankView3DRef } from '@/components/visualizations/TankView3D';

type ViewRef = PlateView3DRef | PipeView3DRef | TankView3DRef;

export type ThreeDeeViewRef = {
  capture: () => Promise<string>;
  focus: (x: number, y: number, zoomIn: boolean, boxSize: number) => Promise<void>;
  resetCamera: () => Promise<void>;
  setView: (view: 'iso' | 'top' | 'side') => Promise<void>;
};


interface ThreeDeeViewTabProps {}

export const ThreeDeeViewTab = forwardRef<ThreeDeeViewRef, ThreeDeeViewTabProps>((props, ref) => {
  const { inspectionResult } = useInspectionStore();
  const viewRef = useRef<ViewRef>(null);

  useImperativeHandle(ref, () => ({
      capture: async () => viewRef.current?.capture() || Promise.resolve(''),
      focus: async (x, y, zoomIn, boxSize) => viewRef.current?.focus(x, y, zoomIn, boxSize),
      resetCamera: async () => viewRef.current?.resetCamera(),
      setView: async (view) => viewRef.current?.setView(view),
  }));

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  const renderContent = () => {
    switch (assetType) {
      case 'Pipe':
        return <PipeView3D ref={viewRef as Ref<PipeView3DRef>} />;
      case 'Tank':
      case 'Vessel':
        return <TankView3D ref={viewRef as Ref<TankView3DRef>} />;
      case 'Plate':
      default:
        return <PlateView3D ref={viewRef as Ref<PlateView3DRef>} />;
    }
  };

  return (
    <div className="w-full h-full">
      {renderContent()}
    </div>
  );
});

ThreeDeeViewTab.displayName = "ThreeDeeViewTab";
