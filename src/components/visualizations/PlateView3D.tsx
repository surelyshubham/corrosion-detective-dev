
"use client"

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, LocateFixed, Pin, FileText, Loader2 } from 'lucide-react'
import { useImperativeHandle } from 'react'
import { PlateEngine, type HoverInfo } from '@/plate-engine'
import { PlatePercentLegend } from './PlatePercentLegend'

export type PlateView3DRef = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface PlateView3DProps {}

export const PlateView3D = React.forwardRef<PlateView3DRef, PlateView3DProps>((props, ref) => {
  const { inspectionResult, dataVersion, selectedPoint } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.gridMatrix;
  
  const [showReference, setShowReference] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HoverInfo & { clientX: number, clientY: number } | null>(null);
  const [depthExaggeration, setDepthExaggeration] = useState(10);


  // Engine and core refs
  const engineRef = useRef<PlateEngine | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const reqRef = useRef<number>(0);
  const mouseRef = useRef(new THREE.Vector2());
  const refPlaneRef = useRef<THREE.Mesh | null>(null);

  const { nominalThickness, assetType } = inspectionResult || {};
  const stats = DataVault.stats;

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    reqRef.current = requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  const setView = async (view: "iso" | "top" | "side") => {
    if (!cameraRef.current || !controlsRef.current || !engineRef.current) return;

    const distance = Math.max(120, engineRef.current.visualHeight * 1.2);
    const targetX = engineRef.current.VISUAL_WIDTH / 2;
    const targetZ = engineRef.current.visualHeight / 2;
    controlsRef.current.target.set(targetX, 0, targetZ);

    switch (view) {
      case "top":
        cameraRef.current.position.set(targetX, distance, targetZ);
        break;

      case "side":
        cameraRef.current.position.set(targetX + distance, 0, targetZ);
        break;

      case "iso":
      default:
        cameraRef.current.position.set(
          targetX + distance * 0.7,
          distance * 0.6,
          targetZ + distance * 0.7
        );
        break;
    }
    controlsRef.current.update();
  };
  
  const resetCamera = useCallback(async () => {
    await setView("iso");
  }, [setView]);


   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current!.domElement.toDataURL(),
    focus: (x, y, zoomIn) => {},
    resetCamera: resetCamera,
    setView: setView,
  }));
  
  useEffect(() => {
    if (!isReady || !mountRef.current || !DataVault.stats || !nominalThickness) return;

    const currentMount = mountRef.current;
    
    // Core setup
    sceneRef.current = new THREE.Scene();
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);

    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);

    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(-100, -100, 100);
    sceneRef.current.add(dirLight);

    // Instantiate engine
    engineRef.current = new PlateEngine({
        scene: sceneRef.current,
        camera: cameraRef.current,
        grid: DataVault.gridMatrix!,
        stats: DataVault.stats,
        nominalThickness: nominalThickness,
        depthExaggeration: depthExaggeration,
    });
    
    // Create ref plane inside component
    const refPlaneGeom = new THREE.PlaneGeometry(
      engineRef.current.VISUAL_WIDTH,
      engineRef.current.visualHeight
    );
    refPlaneGeom.rotateX(-Math.PI / 2);
    
    refPlaneRef.current = new THREE.Mesh(
      refPlaneGeom,
      new THREE.MeshBasicMaterial({
        color: 0x1e90ff,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      })
    );
    
    refPlaneRef.current.position.set(
      engineRef.current.VISUAL_WIDTH / 2,
      0,
      engineRef.current.visualHeight / 2
    );
    sceneRef.current.add(refPlaneRef.current);


    engineRef.current.onHover((info) => {
        if(info) {
             setHoveredPoint(prev => ({...info, clientX: prev?.clientX || 0, clientY: prev?.clientY || 0}));
        } else {
            setHoveredPoint(null);
        }
    });

    // Handlers
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
        // We update clientX/Y here so the tooltip can follow the cursor
        setHoveredPoint(prev => prev ? {...prev, clientX: e.clientX, clientY: e.clientY} : null);
    };
    
    currentMount.addEventListener('mousemove', onMouseMove);
    currentMount.addEventListener('mouseleave', () => setHoveredPoint(null));
    window.addEventListener('resize', handleResize);
    
    setView("iso");
    animate();

    return () => {
        cancelAnimationFrame(reqRef.current);
        window.removeEventListener('resize', handleResize);
        currentMount.removeEventListener('mousemove', onMouseMove);
        currentMount.removeEventListener('mouseleave', () => setHoveredPoint(null));
        engineRef.current?.dispose();
        if (rendererRef.current) rendererRef.current.dispose();
        if (refPlaneRef.current) sceneRef.current?.remove(refPlaneRef.current);
        currentMount.innerHTML = '';
    };
}, [isReady, nominalThickness, animate, setView, depthExaggeration]);

 useEffect(() => {
    if (refPlaneRef.current) {
      refPlaneRef.current.visible = showReference;
    }
  }, [showReference]);


  if (!isReady) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col border">
          <CardHeader>
              <CardTitle className="font-headline">3D Surface Plot</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow p-0 relative">
            <div ref={mountRef} className="w-full h-full" />
             {hoveredPoint && (
              <div
                className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-50"
                style={{ left: `${hoveredPoint.clientX + 15}px`, top: `${hoveredPoint.clientY - 30}px` }}
              >
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
           <CardHeader>
            <CardTitle className="text-lg font-headline">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="space-y-3">
              <Label>Depth Exaggeration: {depthExaggeration.toFixed(1)}x</Label>
              <Slider value={[depthExaggeration]} onValueChange={([val]) => setDepthExaggeration(val)} min={1} max={50} step={0.5} />
            </div>
             <div className="flex items-center justify-between">
              <Label htmlFor="ref-switch" className="flex items-center gap-2"><LocateFixed className="h-4 w-4" />Show Reference Plane</Label>
              <Switch id="ref-switch" checked={showReference} onCheckedChange={setShowReference} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-headline">Camera</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={resetCamera} className="col-span-2">
              <RefreshCw className="mr-2 h-4 w-4" /> Reset View
            </Button>
            <Button variant="outline" onClick={() => setView('top')}>Top</Button>
            <Button variant="outline" onClick={() => setView('side')}>Side</Button>
            <Button variant="outline" onClick={() => setView('iso')}>Isometric</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-headline">Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatePercentLegend />
          </CardContent>
        </Card>
      </div>
    </div>
  )
});
PlateView3D.displayName = "PlateView3D";

    