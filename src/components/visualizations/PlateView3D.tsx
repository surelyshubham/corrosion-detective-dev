
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
// IMPORTS FOR REPORTING
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
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !meshRef.current) return;
    setIsGeneratingReport(true);
   
    try {
        // 1. Run the Robot
        rendererRef.current.localClippingEnabled = true;
        const patchImages = await captureAssetPatches(sceneRef.current, cameraRef.current, rendererRef.current, meshRef.current);
        rendererRef.current.localClippingEnabled = false; 

        // 2. Gather Input
        const metadata = {
            assetName: assetType || "N/A",
            location: reportMetadata.location,
            inspectionDate: new Date().toLocaleDateString(),
            reportingDate: new Date().toLocaleDateString(),
            inspector: reportMetadata.inspector,
            remarks: reportMetadata.remarks,
        };

        // 3. Create PDF
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
        const aspect = height / width;
        const visualHeight = VISUAL_WIDTH * aspect;
        controlsRef.current.target.set(0, 0, 0); 
        
        const distance = Math.max(VISUAL_WIDTH, visualHeight) * 1.5;
        switch (view) {
            case 'top': cameraRef.current.position.set(0, distance, 0.01); break;
            case 'side': cameraRef.current.position.set(distance, 0, 0); break;
            case 'iso': default: cameraRef.current.position.set(distance / 2, distance / 2, distance / 2); break;
        }
        controlsRef.current.update();
    }
  }, [stats]);

  const resetCamera = useCallback(() => { setView('iso'); }, [setView]);

   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current!.domElement.toDataURL(),
    focus: (x, y, zoomIn) => { /* Focus Logic */ },
    resetCamera: resetCamera,
    setView: setView,
  }));
  
  // SETUP SCENE
  useEffect(() => {
    // 1. Safety Checks
    if (!isReady || !mountRef.current) return;
    
    const currentStats = DataVault.stats;
    // Check if dimensions are valid (Fixes crash on empty data)
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

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current.enableDamping = true;

    // Lights
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 100, 75);
    sceneRef.current.add(dirLight);

    // Geometry
    const { width, height } = currentStats.gridSize;
    const aspect = height / width;
    const visualHeight = VISUAL_WIDTH * aspect;
    const geometry = new THREE.PlaneGeometry(VISUAL_WIDTH, visualHeight, Math.max(1, width - 1), Math.max(1, height - 1));
    
    // *** CRITICAL FIX: Center geometry so it is visible at 0,0,0 ***
    geometry.center(); 
    
    // Textures
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
    meshRef.current.rotation.x = -Math.PI / 2;
    meshRef.current.position.set(0, 0, 0);
    sceneRef.current.add(meshRef.current);

    // Helpers
    originAxesRef.current = new THREE.Group();
    // Add axes logic here...
    sceneRef.current.add(originAxesRef.current);
    originAxesRef.current.position.set(-10, -10, -10); // Offset to be clean

    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    
    handleResize();
    resetCamera();
    animate();


    return () => {
      window.removeEventListener('resize', handleResize);
      if (currentMount) currentMount.innerHTML = '';
      if (rendererRef.current) rendererRef.current.dispose();
      // Dispose geometry/materials to prevent leaks
    };
  }, [isReady, animate, resetCamera]); // Stable dependencies

  // Update effect (Z-scale etc)
  useEffect(() => {
    if (isReady && meshRef.current && DataVault.displacementBuffer) {
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.displacementScale = zScale;
        material.needsUpdate = true;
    }
  }, [zScale, isReady]);

  if (!isReady) return <div>Loading...</div>;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col">
          <CardHeader><CardTitle>3D Surface Plot</CardTitle></CardHeader>
          <CardContent className="flex-grow p-0 relative">
            <div ref={mountRef} className="w-full h-full" />
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-1 space-y-4">
        <Card>
          <CardHeader><CardTitle>Reporting</CardTitle></CardHeader>
          <CardContent className="space-y-4">
             {/* Report Inputs */}
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
        {/* Controls... */}
         <Card>
          <CardHeader>
            <CardTitle className="text-lg font-headline">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Z-Axis Scale: {zScale.toFixed(1)}x</Label>
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
              <Label htmlFor="origin-switch" className="flex items-center gap-2"><LocateFixed className="h-4 w-4" />Show Origin</Label>
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
        <ColorLegend />
      </div>
    </div>
  )
});
PlateView3D.displayName = "PlateView3D";
