"use client"

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
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
  const { inspectionResult, segments, selectedPoint, setSelectedPoint, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.displacementBuffer;
  const [zScale, setZScale] = useState(30)
  const [showReference, setShowReference] = useState(false)
  const [showMinMax, setShowMinMax] = useState(true)
  const [showOrigin, setShowOrigin] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Form state for PDF metadata
  const [reportMetadata, setReportMetadata] = useState({
      location: 'Haldia Refinery, WB',
      inspector: 'Shubham (Level II)',
      remarks: 'External shell corrosion observed. Requesting barrier coating application.',
  });
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerRef = useRef<THREE.Vector2 | null>(null);
  const originAxesRef = useRef<THREE.Group | null>(null);
  const minMarkerRef = useRef<THREE.Mesh | null>(null);
  const maxMarkerRef = useRef<THREE.Mesh | null>(null);
  const colorTextureRef = useRef<THREE.DataTexture | null>(null);
  const displacementTextureRef = useRef<THREE.DataTexture | null>(null);
  const referencePlaneRef = useRef<THREE.Mesh | null>(null);

  const { nominalThickness, assetType } = inspectionResult || {};
  const stats = DataVault.stats;
  const VISUAL_WIDTH = 100;
  
   const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);
  
  const handleGenerateReport = async () => {
    if (!rendererRef.current || !inspectionResult || !segments) return;
    setIsGeneratingReport(true);
   
    try {
        const metadata = {
            assetName: assetType || "N/A",
            location: reportMetadata.location,
            inspectionDate: new Date().toLocaleDateString(),
            reportingDate: new Date().toLocaleDateString(),
            inspector: reportMetadata.inspector,
            remarks: reportMetadata.remarks,
        };

        // This is the corrected logic, directly calling the final report generator
        await generateFinalReport(metadata, segments);

    } catch(err) {
        console.error("Report generation failed:", err);
        alert("Failed to generate report. Check console for details.");
    } finally {
        setIsGeneratingReport(false);
    }
  };

  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (!cameraRef.current || !controlsRef.current || !meshRef.current || !meshRef.current.geometry) return;
    
    const box = new THREE.Box3().setFromObject(meshRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    controlsRef.current.target.copy(center);
    
    switch (view) {
        case 'top':
            cameraRef.current.position.set(center.x, center.y + maxDim * 1.5, center.z); 
            break;
        case 'side':
             cameraRef.current.position.set(center.x + maxDim * 1.5, center.y, center.z);
            break;
        case 'iso':
        default:
             cameraRef.current.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
            break;
    }
    controlsRef.current.update();
  }, []);

  const resetCamera = useCallback(() => {
    setView('iso');
  }, [setView]);

   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current!.domElement.toDataURL(),
    focus: (x, y, zoomIn) => {
        if (!cameraRef.current || !controlsRef.current || !stats) return;

        const { width, height } = stats.gridSize;
        const aspect = height / width;
        const visualHeight = VISUAL_WIDTH * aspect;

        // Map grid coordinate to visual coordinate
        const targetX = (x / width) * VISUAL_WIDTH;
        const targetZ = (y / height) * visualHeight;
        
        controlsRef.current.target.set(targetX, 0, targetZ);
        
        const distance = zoomIn ? 10 : 50;
        cameraRef.current.position.set(targetX, distance, targetZ + distance);

        controlsRef.current.update();
    },
    resetCamera: resetCamera,
    setView: setView,
  }));
  
  // Setup scene effect
  useEffect(() => {
    if (!isReady || !mountRef.current) {
        return;
    }
    
    const currentStats = DataVault.stats;
    if (!currentStats || !currentStats.gridSize || currentStats.gridSize.width === 0 || currentStats.gridSize.height === 0) {
        return;
    }
    
    const currentMount = mountRef.current;

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); 
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    
    sceneRef.current = new THREE.Scene();
    raycasterRef.current = new THREE.Raycaster();
    pointerRef.current = new THREE.Vector2();

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 5000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current.enableDamping = true;

    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 100, 75);
    sceneRef.current.add(dirLight);

    const { width, height } = currentStats.gridSize;
    const aspect = height / width;
    const visualHeight = VISUAL_WIDTH * aspect;
    
    const geometry = new THREE.PlaneGeometry(
        VISUAL_WIDTH,
        visualHeight,
        Math.min(256, width > 1 ? width - 1 : 1),
        Math.min(256, height > 1 ? height - 1 : 1)
    );
    
    // Position mesh so its top-left corner is at (0,0,0) in the world
    geometry.translate(VISUAL_WIDTH / 2, -visualHeight / 2, 0);

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
        roughness: 0.3,
        flatShading: false,
    });
    
    meshRef.current = new THREE.Mesh(geometry, material);
    meshRef.current.rotation.x = -Math.PI / 2;
    sceneRef.current.add(meshRef.current);

    originAxesRef.current = new THREE.Group();
    const axesLength = Math.max(VISUAL_WIDTH, visualHeight) * 0.2;
    const originSphere = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({color: 0x000000}));
    const xAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, axesLength), new THREE.MeshBasicMaterial({color: 'red'}));
    xAxis.position.x = axesLength / 2;
    xAxis.rotation.z = -Math.PI / 2;
    const zAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, axesLength), new THREE.MeshBasicMaterial({color: 'blue'}));
    zAxis.position.z = axesLength / 2;
    
    originAxesRef.current.add(originSphere, xAxis, zAxis);
    sceneRef.current.add(originAxesRef.current);
    originAxesRef.current.position.set(0,0,0);

    referencePlaneRef.current = new THREE.Mesh(
      new THREE.PlaneGeometry(VISUAL_WIDTH, visualHeight),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
    );
    referencePlaneRef.current.rotation.x = -Math.PI / 2;
    referencePlaneRef.current.position.set(VISUAL_WIDTH / 2, 0, visualHeight / 2); 
    referencePlaneRef.current.visible = showReference;
    sceneRef.current.add(referencePlaneRef.current);

    const markerGeo = new THREE.ConeGeometry(2, 8, 8);
    const minMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const maxMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    minMarkerRef.current = new THREE.Mesh(markerGeo, minMat);
    maxMarkerRef.current = new THREE.Mesh(markerGeo, maxMat);
    sceneRef.current.add(minMarkerRef.current);
    sceneRef.current.add(maxMarkerRef.current);

    // DYNAMIC CAMERA FRAMING
    const box = new THREE.Box3().setFromObject(meshRef.current);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    cameraRef.current.position.set(center.x, center.y, center.z + cameraZ * 1.5);
    cameraRef.current.lookAt(center);
    controlsRef.current.target.copy(center);
    controlsRef.current.minDistance = maxDim * 0.5;
    controlsRef.current.maxDistance = maxDim * 3;
    controlsRef.current.update();

    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    const onPointerMove = ( event: PointerEvent ) => {
      if (!pointerRef.current || !mountRef.current || !raycasterRef.current || !cameraRef.current || !meshRef.current || !DataVault.gridMatrix || !DataVault.displacementBuffer) {
          setHoveredPoint(null);
          return;
      }
      const rect = mountRef.current.getBoundingClientRect();
      pointerRef.current.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
      pointerRef.current.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

      raycasterRef.current.setFromCamera( pointerRef.current, cameraRef.current );
      const intersects = raycasterRef.current.intersectObject( meshRef.current );

      if ( intersects.length > 0 && intersects[0].uv) {
          const uv = intersects[0].uv;
          const { width, height } = currentStats.gridSize;
          const gridX = Math.floor(uv.x * width);
          const gridY = Math.floor((1 - uv.y) * height);
          
          if (gridX >= 0 && gridX < width && gridY >= 0 && gridY < height) {
              const pointData = DataVault.gridMatrix[gridY]?.[gridX];
              if(pointData && pointData.plateId) {
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
    }
    
    currentMount.addEventListener('pointermove', onPointerMove);
    currentMount.addEventListener('pointerleave', () => setHoveredPoint(null));
    
    handleResize();
    resetCamera();
    animate();

    // CLEANUP FUNCTION (Prevents Memory Leaks)
    return () => {
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
                      if (Array.isArray(object.material)) (object.material as any[]).forEach(m => m.dispose());
                      else (object.material as any).dispose();
                  }
              }
          });
      }
      if (displacementTextureRef.current) displacementTextureRef.current.dispose();
      if (colorTextureRef.current) colorTextureRef.current.dispose();
    };
  }, [isReady, animate, resetCamera]); 

  // This effect updates textures and uniforms when data changes, WITHOUT rebuilding the scene
  useEffect(() => {
    if (isReady && dataVersion > 0 && meshRef.current && DataVault.displacementBuffer && DataVault.colorBuffer) {
        
        if (displacementTextureRef.current) {
            displacementTextureRef.current.image.data = DataVault.displacementBuffer;
            displacementTextureRef.current.needsUpdate = true;
        }
        if (colorTextureRef.current) {
            colorTextureRef.current.image.data = DataVault.colorBuffer;
            colorTextureRef.current.needsUpdate = true;
        }
        
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.displacementScale = zScale;
        material.needsUpdate = true;

        if (stats && minMarkerRef.current && maxMarkerRef.current && nominalThickness) {
          const { worstLocation, bestLocation, gridSize } = stats;
          const aspect = gridSize.height / gridSize.width;
          const visualHeight = VISUAL_WIDTH * aspect;

          if (worstLocation) {
            const minX = (worstLocation.x / gridSize.width) * VISUAL_WIDTH;
            const minZ = (worstLocation.y / gridSize.height) * visualHeight;
            const minY = (worstLocation.value - nominalThickness) * zScale;
            minMarkerRef.current.position.set(minX, minY + 4, minZ);
          }
          if (bestLocation) {
            const maxX = (bestLocation.x / gridSize.width) * VISUAL_WIDTH;
            const maxZ = (bestLocation.y / gridSize.height) * visualHeight;
            const maxY = (bestLocation.value - nominalThickness) * zScale;
            maxMarkerRef.current.position.set(maxX, maxY + 4, maxZ);
          }
        }
    }
  }, [isReady, dataVersion, zScale, stats, nominalThickness]);


  useEffect(() => {
    if (originAxesRef.current) {
        originAxesRef.current.visible = showOrigin;
    }
  }, [showOrigin]);

  useEffect(() => {
      if (minMarkerRef.current) minMarkerRef.current.visible = showMinMax;
      if (maxMarkerRef.current) maxMarkerRef.current.visible = showMinMax;
  }, [showMinMax]);
  
  useEffect(() => {
    if (referencePlaneRef.current) {
        referencePlaneRef.current.visible = showReference;
    }
  }, [showReference]);
  
  if (!inspectionResult) return null;

  // Data error or loading placeholder
  if (!isReady) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 border-2 border-dashed border-border rounded-lg">
          <div className="text-center text-muted-foreground">
              <Loader2 className="mx-auto h-8 w-8 animate-spin" />
              <h3 className="text-lg font-bold mt-4">Waiting for Data...</h3>
              <p className="text-xs">Process a file in the 'Setup' tab to build the 3D model.</p>
          </div>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="font-headline">3D Surface Plot</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow p-0 relative">
            <div ref={mountRef} className="w-full h-full" />
             {hoveredPoint && (
              <div
                className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-20"
                style={{
                  left: `${hoveredPoint.clientX + 15}px`,
                  top: `${hoveredPoint.clientY - 30}px`,
                }}
              >
                <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
                 {hoveredPoint.plateId && <div className="text-muted-foreground truncate max-w-[200px]">{hoveredPoint.plateId}</div>}
                <div>Raw Thick: {hoveredPoint.rawThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Eff. Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
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
              <Label>Z-Axis Scale / Depth Exaggeration: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={1} max={100} step={1} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ref-plane-switch" className="flex items-center gap-2"><Expand className="h-4 w-4" />Show Reference Plane</Label>
              <Switch id="ref-plane-switch" checked={showReference} onCheckedChange={setShowReference} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="min-max-switch" className="flex items-center gap-2"><Pin className="h-4 w-4" />Show Min/Max Points</Label>
              <Switch id="min-max-switch" checked={showMinMax} onCheckedChange={setShowMinMax} />
            </div>
             <div className="flex items-center justify-between">
              <Label htmlFor="origin-switch" className="flex items-center gap-2"><LocateFixed className="h-4 w-4" />Show Origin (0,0)</Label>
              <Switch id="origin-switch" checked={showOrigin} onCheckedChange={setShowOrigin} />
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
            <CardTitle className="text-lg font-headline">Reporting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
                <Label htmlFor="report-location">Location</Label>
                <Input id="report-location" value={reportMetadata.location} onChange={(e) => setReportMetadata(prev => ({ ...prev, location: e.target.value }))} />
            </div>
             <div className="space-y-1">
                <Label htmlFor="report-inspector">Inspector</Label>
                <Input id="report-inspector" value={reportMetadata.inspector} onChange={(e) => setReportMetadata(prev => ({ ...prev, inspector: e.target.value }))} />
            </div>
             <div className="space-y-1">
                <Label htmlFor="report-remarks">Remarks</Label>
                <Textarea id="report-remarks" value={reportMetadata.remarks} onChange={(e) => setReportMetadata(prev => ({ ...prev, remarks: e.target.value }))} />
            </div>
            <Button onClick={handleGenerateReport} disabled={isGeneratingReport || !segments} className="w-full">
              {isGeneratingReport ? (
                <Loader2 className="mr-2 animate-spin" />
              ) : (
                <FileText className="mr-2" />
              )}
              {isGeneratingReport ? 'Generating...' : 'Generate PDF Report'}
            </Button>
          </CardContent>
        </Card>
        <ColorLegend />
      </div>
    </div>
  )
});
PlateView3D.displayName = "PlateView3D";

    