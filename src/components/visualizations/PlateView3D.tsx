

"use client"

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Expand, Pin, RefreshCw, Percent, Ruler, LocateFixed, Loader2, FileText } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { useImperativeHandle } from 'react'
import { captureAssetPatches, generatePDF } from '@/report/ReportGenerator'


const ColorLegend = ({ mode, stats, nominalThickness }: { mode: ColorMode, stats: any, nominalThickness: number}) => {
    // This component remains largely the same as before
    return <Card className="bg-card/90"><CardHeader className="p-3"><CardTitle className="text-base">Legend</CardTitle></CardHeader></Card>;
}

export type PlateView3DRef = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface PlateView3DProps {}


export const PlateView3D = React.forwardRef<PlateView3DRef, PlateView3DProps>((props, ref) => {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false);
  const [zScale, setZScale] = useState(30)
  const [showReference, setShowReference] = useState(false)
  const [showMinMax, setShowMinMax] = useState(true)
  const [showOrigin, setShowOrigin] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
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


  const { nominalThickness } = inspectionResult || {};
  const stats = DataVault.stats;
  const VISUAL_WIDTH = 100;
  
   const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);
  
  // This effect runs only when the data from the worker is updated
  useEffect(() => {
    if (dataVersion > 0 && DataVault.stats && DataVault.displacementBuffer) {
      setIsReady(true);
    } else {
      setIsReady(false);
    }
  }, [dataVersion]);

  const handleGenerateReport = async () => {
   if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !meshRef.current) return;
   setIsGeneratingReport(true);
   
    try {
        // 1. Capture Images
        // The renderer needs to have local clipping enabled to respect the planes
        rendererRef.current.localClippingEnabled = true;
        const patches = await captureAssetPatches(sceneRef.current, cameraRef.current, rendererRef.current, meshRef.current);
        rendererRef.current.localClippingEnabled = false; // Disable it after capture

        // 2. Capture Full Overview (optional, just take one normal screenshot)
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        const fullAsset = rendererRef.current.domElement.toDataURL("image/png");

        // 3. Create PDF
        generatePDF("ASSET-001", fullAsset, patches);
    } catch(err) {
        console.error("Report generation failed:", err);
        alert("Failed to generate report. Check console for details.");
    } finally {
        setIsGeneratingReport(false);
    }
  };


  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (cameraRef.current && controlsRef.current && stats) {
        const { width, height } = stats.gridSize;
        const aspect = height / width;
        const visualHeight = VISUAL_WIDTH * aspect;
        controlsRef.current.target.set(VISUAL_WIDTH / 2, 0, visualHeight / 2);
        const distance = Math.max(VISUAL_WIDTH, visualHeight) * 1.5;
        switch (view) {
            case 'top':
                cameraRef.current.position.set(VISUAL_WIDTH / 2, distance, visualHeight / 2 + 0.01); 
                break;
            case 'side':
                cameraRef.current.position.set(VISUAL_WIDTH / 2 + distance, 0, visualHeight / 2);
                break;
            case 'iso':
            default:
                 cameraRef.current.position.set(VISUAL_WIDTH / 2 + distance / 2, distance / 2, visualHeight / 2 + distance / 2);
                break;
        }
        controlsRef.current.update();
    }
  }, [stats]);


  const resetCamera = useCallback(() => {
    setView('iso');
  }, [setView]);


   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current!.domElement.toDataURL(),
    focus: (x, y, zoomIn) => {
        if (!cameraRef.current || !controlsRef.current || !stats) return;

        const { width, height } = stats.gridSize;
        const aspect = height / width;
        const targetX = (x / (width - 1)) * VISUAL_WIDTH;
        const targetZ = (y / (height - 1)) * (VISUAL_WIDTH * aspect);
        
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
    if (!isReady || !mountRef.current || !inspectionResult) {
        return;
    }
    
    const currentStats = DataVault.stats;
    if (!currentStats || !currentStats.gridSize || currentStats.gridSize.width === 0 || currentStats.gridSize.height === 0) {
        return;
    }
    
    const currentMount = mountRef.current;

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    
    sceneRef.current = new THREE.Scene();
    raycasterRef.current = new THREE.Raycaster();
    pointerRef.current = new THREE.Vector2();

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current.enableDamping = true;

    // Engineering Lights
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 100, 75);
    sceneRef.current.add(dirLight);

    const { width, height } = currentStats.gridSize;
    const aspect = height / width;
    const visualHeight = VISUAL_WIDTH * aspect;
    // Cap geometry segments for performance
    const geometry = new THREE.PlaneGeometry(VISUAL_WIDTH, visualHeight, 511, 511);
    
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
    meshRef.current.position.set(VISUAL_WIDTH/2, 0, visualHeight/2);
    sceneRef.current.add(meshRef.current);

    // Pro Axes
    originAxesRef.current = new THREE.Group();
    const axesLength = Math.max(VISUAL_WIDTH, visualHeight) * 0.2;
    const originSphere = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({color: 0x000000}));
    const xAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, axesLength), new THREE.MeshBasicMaterial({color: 'red'}));
    xAxis.position.x = axesLength / 2;
    xAxis.rotation.z = -Math.PI / 2;
    const zAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, axesLength), new THREE.MeshBasicMaterial({color: 'blue'}));
    zAxis.position.z = axesLength / 2;
    // No rotation needed for Z axis cylinder to point along Z
    originAxesRef.current.add(originSphere, xAxis, zAxis);
    sceneRef.current.add(originAxesRef.current);
    originAxesRef.current.position.set(0, 0, 0);


    // Reference Plane
    referencePlaneRef.current = new THREE.Mesh(
      new THREE.PlaneGeometry(VISUAL_WIDTH, visualHeight),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
    );
    referencePlaneRef.current.rotation.x = -Math.PI / 2;
    referencePlaneRef.current.position.set(VISUAL_WIDTH/2, 0, visualHeight/2);
    referencePlaneRef.current.visible = showReference;
    sceneRef.current.add(referencePlaneRef.current);

    // Min/Max Markers
    const markerGeo = new THREE.ConeGeometry(2, 8, 8);
    const minMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const maxMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    minMarkerRef.current = new THREE.Mesh(markerGeo, minMat);
    maxMarkerRef.current = new THREE.Mesh(markerGeo, maxMat);
    sceneRef.current.add(minMarkerRef.current);
    sceneRef.current.add(maxMarkerRef.current);

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

    return () => {
      window.removeEventListener('resize', handleResize);
       if (currentMount) {
        currentMount.removeEventListener('pointermove', onPointerMove);
        currentMount.removeEventListener('pointerleave', () => setHoveredPoint(null));
        currentMount.innerHTML = '';
      }
    };
  }, [isReady, inspectionResult, animate, resetCamera]); 

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
            minMarkerRef.current.position.set(minX + VISUAL_WIDTH/2, minY + 4, minZ + visualHeight/2);
          }
          if (bestLocation) {
            const maxX = (bestLocation.x / gridSize.width) * VISUAL_WIDTH;
            const maxZ = (bestLocation.y / gridSize.height) * visualHeight;
            const maxY = (bestLocation.value - nominalThickness) * zScale;
            maxMarkerRef.current.position.set(maxX + VISUAL_WIDTH/2, maxY + 4, maxZ + visualHeight/2);
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
  if (!isReady || !stats || !stats.gridSize || stats.gridSize.width === 0 || stats.gridSize.height === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 border-2 border-dashed border-border rounded-lg">
          <div className="text-center text-muted-foreground">
              <Loader2 className="mx-auto h-8 w-8 animate-spin" />
              <h3 className="text-lg font-bold mt-4">Building 3D Model...</h3>
              <p className="text-xs">Preparing textures and geometry.</p>
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
            <div className="space-y-2">
                <Label>Color Scale</Label>
                <RadioGroup value={colorMode} onValueChange={(val) => setColorMode(val as ColorMode)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="mm" id="mm" />
                    <Label htmlFor="mm" className="flex items-center gap-2 font-normal"><Ruler className="h-4 w-4"/>Condition (mm)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="%" id="%" />
                    <Label htmlFor="%" className="flex items-center gap-2 font-normal"><Percent className="h-4 w-4"/>Normalized (%)</Label>
                  </div>
                </RadioGroup>
            </div>
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
          <CardContent>
            <Button onClick={handleGenerateReport} disabled={isGeneratingReport} className="w-full">
              {isGeneratingReport ? (
                <Loader2 className="mr-2 animate-spin" />
              ) : (
                <FileText className="mr-2" />
              )}
              {isGeneratingReport ? 'Generating...' : 'Generate PDF Report'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
});
PlateView3D.displayName = "PlateView3D";
