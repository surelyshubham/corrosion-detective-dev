
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, LocateFixed, Pin, Loader2 } from 'lucide-react'
import { useImperativeHandle } from 'react'
import { PipeEngine, type HoverInfo } from '@/plate-engine/PipeEngine';
import { PlatePercentLegend } from './PlatePercentLegend'

const delayFrame = (ms = 70) => new Promise(res => setTimeout(res, ms));

export type PipeView3DRef = {
  capture: () => Promise<string>;
  focus: (x: number, y: number, zoomIn: boolean, boxSize: number) => Promise<void>;
  resetCamera: () => Promise<void>;
  setView: (view: 'iso' | 'top' | 'side') => Promise<void>;
};

interface PipeView3DProps {}

export const PipeView3D = React.forwardRef<PipeView3DRef, PipeView3DProps>((props, ref) => {
  const { inspectionResult, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.gridMatrix && !!inspectionResult?.pipeOuterDiameter && !!inspectionResult?.pipeLength;
  
  const [hoveredPoint, setHoveredPoint] = useState<HoverInfo & { clientX: number, clientY: number } | null>(null);
  const [depthExaggeration, setDepthExaggeration] = useState(10);

  const engineRef = useRef<PipeEngine | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const reqRef = useRef<number>(0);
  const mouseRef = useRef(new THREE.Vector2());

  const { nominalThickness, pipeOuterDiameter, pipeLength } = inspectionResult || {};

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    reqRef.current = requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  const setView = useCallback(async (view: "iso" | "top" | "side") => {
    if (!cameraRef.current || !controlsRef.current || !engineRef.current) return;
    const cam = cameraRef.current;
    const ctl = controlsRef.current;
    const target = new THREE.Vector3(0, 0, 0); // Pipe is centered at origin
    const dist = Math.max(pipeOuterDiameter || 0, pipeLength || 0) * 1.5;
    switch (view) {
      case "top": cam.position.set(target.x, target.y + dist, target.z + 0.01); break;
      case "side": cam.position.set(target.x + dist, target.y, target.z); break;
      case "iso": default: cam.position.set(dist * 0.7, dist * 0.5, dist * 0.7); break;
    }
    ctl.target.copy(target);
    ctl.update();
    await delayFrame();
    rendererRef.current?.render(sceneRef.current!, cam);
  }, [pipeOuterDiameter, pipeLength]);
  
  const resetCamera = useCallback(async () => {
    await setView("iso");
  }, [setView]);

   useImperativeHandle(ref, () => ({
    capture: async () => {
        if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return "";
        await delayFrame();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        return rendererRef.current.domElement.toDataURL("image/png");
    },
    focus: async (x: number, y: number, zoomIn: boolean, boxSize: number) => {
        if (!cameraRef.current || !controlsRef.current || !engineRef.current) return;
        const target = engineRef.current.gridToWorld(x, y);
        controlsRef.current.target.set(target.x, target.y, target.z);
        const camDist = Math.max(boxSize * engineRef.current.cellWidth, 20) * (zoomIn ? 0.8 : 2.5);
        cameraRef.current.position.set(target.x + camDist, target.y + camDist / 2, target.z + camDist);
        controlsRef.current.update();
        await delayFrame();
    },
    resetCamera,
    setView,
  }));
  
  useEffect(() => {
    if (!isReady || !mountRef.current || !DataVault.stats || !nominalThickness || !pipeOuterDiameter || !pipeLength) return;

    const currentMount = mountRef.current;
    sceneRef.current = new THREE.Scene();
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(pipeOuterDiameter, pipeLength, pipeOuterDiameter);
    sceneRef.current.add(dirLight);
    
    engineRef.current = new PipeEngine({
        scene: sceneRef.current,
        camera: cameraRef.current,
        grid: DataVault.gridMatrix!,
        stats: DataVault.stats,
        nominalThickness: nominalThickness,
        pipeRadius: pipeOuterDiameter / 2,
        pipeHeight: pipeLength,
        depthExaggeration: depthExaggeration,
    });

    engineRef.current.onHover((info) => {
        setHoveredPoint(prev => info ? {...info, clientX: prev?.clientX || 0, clientY: prev?.clientY || 0} : null);
    });

    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    
    const onMouseMove = (e: MouseEvent) => {
        if (!engineRef.current || !currentMount) return;
        const rect = currentMount.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        engineRef.current.handleMouseMove(mouseRef.current);
        setHoveredPoint(prev => prev ? {...prev, clientX: e.clientX, clientY: e.clientY} : null);
    };
    
    currentMount.addEventListener('mousemove', onMouseMove);
    currentMount.addEventListener('mouseleave', () => setHoveredPoint(null));
    window.addEventListener('resize', handleResize);
    
    resetCamera();
    animate();

    return () => {
        cancelAnimationFrame(reqRef.current);
        window.removeEventListener('resize', handleResize);
        currentMount.removeEventListener('mousemove', onMouseMove);
        currentMount.removeEventListener('mouseleave', () => setHoveredPoint(null));
        engineRef.current?.dispose();
        rendererRef.current?.dispose();
        currentMount.innerHTML = '';
    };
}, [isReady, nominalThickness, pipeOuterDiameter, pipeLength, animate, depthExaggeration, resetCamera]);
  
  useEffect(() => {
    engineRef.current?.setDepthExaggeration(depthExaggeration);
  }, [depthExaggeration]);

  if (!isReady) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /> <span className="ml-2">Loading 3D View...</span></div>;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col border">
          <CardHeader><CardTitle className="font-headline">3D Pipe View</CardTitle></CardHeader>
          <CardContent className="flex-grow p-0 relative">
            <div ref={mountRef} className="w-full h-full" />
             {hoveredPoint && (
              <div className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-50" style={{ left: `${hoveredPoint.clientX + 15}px`, top: `${hoveredPoint.clientY - 30}px` }}>
                <div className="font-bold">X: {hoveredPoint.gridX}, Y: {hoveredPoint.gridY}</div>
                <div>Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Percent: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'} %</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-1 space-y-4">
        <Card>
           <CardHeader><CardTitle className="text-lg font-headline">Controls</CardTitle></CardHeader>
          <CardContent className="space-y-6">
             <div className="space-y-3">
              <Label>Depth Exaggeration: {depthExaggeration.toFixed(1)}x</Label>
              <Slider value={[depthExaggeration]} onValueChange={([val]) => setDepthExaggeration(val)} min={1} max={50} step={0.5} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg font-headline">Camera</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={resetCamera} className="col-span-2"><RefreshCw className="mr-2 h-4 w-4" /> Reset View</Button>
            <Button variant="outline" onClick={() => setView('top')}>Top</Button>
            <Button variant="outline" onClick={() => setView('side')}>Side</Button>
            <Button variant="outline" onClick={() => setView('iso')}>Isometric</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg font-headline">Legend</CardTitle></CardHeader>
          <CardContent><PlatePercentLegend /></CardContent>
        </Card>
      </div>
    </div>
  )
});
PipeView3D.displayName = "PipeView3D";

    