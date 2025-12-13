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
import { Expand, Pin, RefreshCw, LocateFixed, Loader2, FileText } from 'lucide-react'
import { useImperativeHandle } from 'react'
import { generateFinalReport } from '@/report/ReportGenerator'
import { captureAssetPatches } from '@/utils/capturePatchImages' 
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { ColorLegend } from './ColorLegend'

export type PlateView3DRef = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface PlateView3DProps {}

export const PlateView3D = React.forwardRef<PlateView3DRef, PlateView3DProps>((props, ref) => {
  const { inspectionResult, segments, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.displacementBuffer;
  
  const [zScale, setZScale] = useState(30)
  const [showReference, setShowReference] = useState(false)
  const [showMinMax, setShowMinMax] = useState(true)
  const [showOrigin, setShowOrigin] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Form state
  const [reportMetadata, setReportMetadata] = useState({
      location: 'Haldia Refinery, WB',
      inspector: 'Shubham (Level II)',
      remarks: 'External shell corrosion observed.',
  });
  
  // Refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const raycasterRef = useRef<THREE.Raycaster | null>(null)
  const pointerRef = useRef<THREE.Vector2 | null>(null)
  
  // Helpers
  const originAxesRef = useRef<THREE.Group | null>(null)
  const minMarkerRef = useRef<THREE.Mesh | null>(null)
  const maxMarkerRef = useRef<THREE.Mesh | null>(null)
  const colorTextureRef = useRef<THREE.DataTexture | null>(null)
  const displacementTextureRef = useRef<THREE.DataTexture | null>(null)
  const referencePlaneRef = useRef<THREE.Mesh | null>(null)
  const reqRef = useRef<number>(0)

  const { nominalThickness, assetType } = inspectionResult || {};
  const stats = DataVault.stats;
  
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    reqRef.current = requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);
  
  const handleGenerateReport = async () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !meshRef.current || !stats) return;
    setIsGeneratingReport(true);
    try {
        rendererRef.current.localClippingEnabled = true;
        const patchImages = await captureAssetPatches({
            scene: sceneRef.current, 
            camera: cameraRef.current, 
            renderer: rendererRef.current, 
            plateWidth: stats.gridSize.width,
            plateHeight: stats.gridSize.height,
        });
        rendererRef.current.localClippingEnabled = false; 
        const metadata = {
            assetName: assetType || "N/A",
            location: reportMetadata.location,
            inspectionDate: new Date().toLocaleDateString(),
            reportingDate: new Date().toLocaleDateString(),
            inspector: reportMetadata.inspector,
            remarks: reportMetadata.remarks,
        };
        await generateFinalReport(metadata, patchImages);
    } catch(err) {
        console.error("Report generation failed:", err);
        alert("Failed to generate report.");
    } finally {
        setIsGeneratingReport(false);
    }
  };

  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (cameraRef.current && controlsRef.current && stats) {
        const { width, height } = stats.gridSize;
        controlsRef.current.target.set(width / 2, height / 2, 0); 
        
        const distance = Math.max(width, height) * 1.5;
        switch (view) {
            case 'top': cameraRef.current.position.set(width / 2, height/2, distance); break;
            case 'side': cameraRef.current.position.set(width / 2, -distance, 0); cameraRef.current.lookAt(width/2, height/2, 0); break;
            case 'iso': default: cameraRef.current.position.set(width + distance/4, height + distance/4, distance/2); break;
        }
        controlsRef.current.update();
    }
  }, [stats]);

  const resetCamera = useCallback(() => { setView('iso'); }, [setView]);

   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current!.domElement.toDataURL(),
    focus: (x, y, zoomIn) => {}, 
    resetCamera: resetCamera,
    setView: setView,
  }));
  
  // --- MAIN SCENE SETUP ---
  useEffect(() => {
    if (!isReady || !mountRef.current) return;
    const currentStats = DataVault.stats;
    if (!currentStats || !currentStats.gridSize) return;
    
    const currentMount = mountRef.current;

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); 
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    
    sceneRef.current = new THREE.Scene();
    raycasterRef.current = new THREE.Raycaster();
    pointerRef.current = new THREE.Vector2();

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current.enableDamping = true;

    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 100, 75);
    sceneRef.current.add(dirLight);

    const { width, height } = currentStats.gridSize;
    const geometry = new THREE.PlaneGeometry(width, height, width, height);
    // CRITICAL: Move origin to bottom-left
    geometry.translate(width / 2, height / 2, 0);
    
    const { displacementBuffer, colorBuffer } = DataVault;
    if (!displacementBuffer || !colorBuffer) return;

    displacementTextureRef.current = new THREE.DataTexture(displacementBuffer, width, height, THREE.RedFormat, THREE.FloatType);
    displacementTextureRef.current.minFilter = THREE.NearestFilter;
    displacementTextureRef.current.magFilter = THREE.NearestFilter;
    displacementTextureRef.current.needsUpdate = true;

    colorTextureRef.current = new THREE.DataTexture(colorBuffer, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    colorTextureRef.current.minFilter = THREE.NearestFilter;
    colorTextureRef.current.magFilter = THREE.NearestFilter;
    colorTextureRef.current.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        displacementScale: zScale,
        map: colorTextureRef.current,
        displacementMap: displacementTextureRef.current,
        color: 0x808080,
        metalness: 0.2,
        roughness: 0.3
    });
    
    meshRef.current = new THREE.Mesh(geometry, material);
    meshRef.current.userData = { type: "plate", width, height };
    sceneRef.current.add(meshRef.current);

    // Helpers
    const axesSize = Math.max(width, height) * 0.1;
    originAxesRef.current = new THREE.AxesHelper(axesSize);
    sceneRef.current.add(originAxesRef.current);

    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    // Physics-Based Cursor
    const onPointerMove = ( event: PointerEvent ) => {
      if (!pointerRef.current || !mountRef.current || !raycasterRef.current || !cameraRef.current || !meshRef.current) {
          setHoveredPoint(null); return;
      }
      const rect = mountRef.current.getBoundingClientRect();
      pointerRef.current.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
      pointerRef.current.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

      raycasterRef.current.setFromCamera( pointerRef.current, cameraRef.current );
      const intersects = raycasterRef.current.intersectObject( meshRef.current );

      if ( intersects.length > 0 && DataVault.gridMatrix) {
          const hit = intersects[0];
          const x = hit.point.x;
          const y = hit.point.y;
          const { width, height } = meshRef.current.userData;

          // Boundary check
          if (x < 0 || x > width || y < 0 || y > height) { setHoveredPoint(null); return; }

          // Map to grid (assuming grid points correspond to vertices)
          const gridX = Math.round(x);
          const gridY = Math.round(y);
          
          if (gridX >= 0 && gridX < width && gridY >= 0 && gridY < height) {
              const row = DataVault.gridMatrix[gridY];
              const pointData = row ? row[gridX] : null;

              if (pointData && typeof pointData.rawThickness === 'number' && pointData.rawThickness > 0) {
                  setHoveredPoint({ x: gridX, y: gridY, ...pointData, clientX: event.clientX, clientY: event.clientY });
              } else {
                  setHoveredPoint(null);
              }
          } else {
              setHoveredPoint(null);
          }
      } else {
          setHoveredPoint(null);
      }
    };
    currentMount.addEventListener('pointermove', onPointerMove);
    currentMount.addEventListener('pointerleave', () => setHoveredPoint(null));

    // Start
    handleResize();
    resetCamera();
    animate();

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener('resize', handleResize);
      if (currentMount) {
        currentMount.removeEventListener('pointermove', onPointerMove);
        currentMount.removeEventListener('pointerleave', () => setHoveredPoint(null));
        currentMount.innerHTML = '';
      }
      if (rendererRef.current) rendererRef.current.dispose();
      
      if (sceneRef.current) {
          sceneRef.current.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                  if (object.geometry) object.geometry.dispose();
                  if (object.material) {
                      if (Array.isArray(object.material)) object.material.forEach((m: any) => m.dispose());
                      else object.material.dispose();
                  }
              }
          });
      }
      if (displacementTextureRef.current) displacementTextureRef.current.dispose();
      if (colorTextureRef.current) colorTextureRef.current.dispose();
    };
  }, [isReady]); 

  useEffect(() => {
    if (isReady && meshRef.current && DataVault.displacementBuffer) {
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.displacementScale = zScale;
        material.needsUpdate = true;
    }
  }, [zScale, isReady]);

  useEffect(() => {
    if (originAxesRef.current) originAxesRef.current.visible = showOrigin;
  }, [showOrigin]);

  if (!isReady) return <div>Loading...</div>;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col border">
          <CardHeader><CardTitle>3D Surface Plot</CardTitle></CardHeader>
          <CardContent className="flex-grow p-0 relative">
            <div ref={mountRef} className="w-full h-full" />
             {hoveredPoint && (
              <div
                className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-50"
                style={{ left: `${hoveredPoint.clientX + 15}px`, top: `${hoveredPoint.clientY - 30}px` }}
              >
                <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
                <div>Thick: {hoveredPoint.rawThickness?.toFixed(2) ?? 'ND'} mm</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-1 space-y-4">
        <Card>
          <CardHeader><CardTitle>Controls</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Z-Axis Scale: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={1} max={100} step={1} />
            </div>
             <div className="flex items-center justify-between">
              <Label htmlFor="origin-switch">Show Origin</Label>
              <Switch id="origin-switch" checked={showOrigin} onCheckedChange={setShowOrigin} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Camera</CardTitle></CardHeader>
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
          <CardHeader><CardTitle>Reporting</CardTitle></CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-1">
                <Label>Location</Label>
                <Input value={reportMetadata.location} onChange={(e) => setReportMetadata(p => ({...p, location: e.target.value}))} />
            </div>
             <div className="space-y-1">
                <Label>Inspector</Label>
                <Input value={reportMetadata.inspector} onChange={(e) => setReportMetadata(p => ({...p, inspector: e.target.value}))} />
            </div>
             <div className="space-y-1">
                <Label>Remarks</Label>
                <Textarea value={reportMetadata.remarks} onChange={(e) => setReportMetadata(p => ({...p, remarks: e.target.value}))} />
            </div>
            <Button onClick={handleGenerateReport} disabled={isGeneratingReport} className="w-full">
              {isGeneratingReport ? <Loader2 className="mr-2 animate-spin" /> : <FileText className="mr-2" />}
              Generate PDF Report
            </Button>
          </CardContent>
        </Card>
        <ColorLegend />
      </div>
    </div>
  )
});
PlateView3D.displayName = "PlateView3D";
