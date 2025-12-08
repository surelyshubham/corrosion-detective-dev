
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
import { Expand, Pin, RefreshCw, Percent, Ruler, LocateFixed } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { useImperativeHandle } from 'react'


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
  const [zScale, setZScale] = useState(15)
  const [showReference, setShowReference] = useState(false)
  const [showMinMax, setShowMinMax] = useState(true)
  const [showOrigin, setShowOrigin] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const colorTextureRef = useRef<THREE.DataTexture | null>(null);
  const displacementTextureRef = useRef<THREE.DataTexture | null>(null);

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
    if (dataVersion === 0 || !stats) return;

    const { displacementBuffer, colorBuffer } = DataVault;
    if (!displacementBuffer || !colorBuffer) return;

    const { width, height } = stats.gridSize;

    // Safety check for empty data
    if (width === 0 || height === 0) {
        if (meshRef.current) sceneRef.current?.remove(meshRef.current); // Remove old mesh if any
        return;
    }


    // Update or create displacement texture
    if (displacementTextureRef.current) {
      displacementTextureRef.current.image.data = displacementBuffer;
      displacementTextureRef.current.needsUpdate = true;
    } else {
      const texture = new THREE.DataTexture(displacementBuffer, width, height, THREE.RedFormat, THREE.FloatType);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;
      displacementTextureRef.current = texture;
    }

    // Update or create color texture
    if (colorTextureRef.current) {
        colorTextureRef.current.image.data = colorBuffer;
        colorTextureRef.current.needsUpdate = true;
    } else {
        const texture = new THREE.DataTexture(colorBuffer, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        colorTextureRef.current = texture;
    }
    
    // Update material if mesh exists
    if (meshRef.current) {
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.map = colorTextureRef.current;
        material.displacementMap = displacementTextureRef.current;
        material.displacementScale = zScale;
        material.needsUpdate = true;
    }

  }, [dataVersion, stats, zScale]);


  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (cameraRef.current && controlsRef.current && stats) {
        controlsRef.current.target.set(0, 0, 0);
        const aspect = stats.gridSize.height / stats.gridSize.width;
        const distance = Math.max(VISUAL_WIDTH, VISUAL_WIDTH * aspect) * 1.5;
        switch (view) {
            case 'top':
                cameraRef.current.position.set(0, distance, 0.001); // slight offset to avoid gimbal lock
                break;
            case 'side':
                cameraRef.current.position.set(distance, 0, 0);
                break;
            case 'iso':
            default:
                 cameraRef.current.position.set(distance / 2, distance / 2, distance / 2);
                break;
        }
        controlsRef.current.update();
    }
  }, [stats]);


  const resetCamera = useCallback(() => {
    setView('iso');
  }, [setView]);


   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current?.domElement.toDataURL('image/png') || '',
    focus: (x, y, zoomIn) => {
        if (!cameraRef.current || !controlsRef.current || !stats) return;

        const { width, height } = stats.gridSize;
        const aspect = height / width;
        const targetX = (x / (width - 1)) * VISUAL_WIDTH - VISUAL_WIDTH / 2;
        const targetZ = (y / (height - 1)) * (VISUAL_WIDTH * aspect) - (VISUAL_WIDTH * aspect) / 2;
        
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
    if (!mountRef.current || !inspectionResult) return;
    if (!stats) return;
     // Safety check for empty data
    if (!stats.gridSize || stats.gridSize.width === 0 || stats.gridSize.height === 0) {
        return;
    }
    
    const currentMount = mountRef.current;

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    
    sceneRef.current = new THREE.Scene();
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);

    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 100, 75);
    sceneRef.current.add(dirLight);

    const { width, height } = stats.gridSize;
    const aspect = height / width;
    const geometry = new THREE.PlaneGeometry(VISUAL_WIDTH, VISUAL_WIDTH * aspect, width - 1, height - 1);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        displacementScale: zScale,
    });
    
    meshRef.current = new THREE.Mesh(geometry, material);
    sceneRef.current.add(meshRef.current);

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
      if (currentMount) {
        currentMount.innerHTML = '';
      }
    };
  }, [inspectionResult, animate, resetCamera, zScale, stats]);

  useEffect(() => {
    if (meshRef.current) {
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        material.displacementScale = zScale;
        material.needsUpdate = true;
    }
  }, [zScale]);
  
  if (!inspectionResult) return null;

  // Data error placeholder
  if (!stats || !stats.gridSize || stats.gridSize.width === 0 || stats.gridSize.height === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-destructive/10 border-2 border-dashed border-destructive rounded-lg">
          <div className="text-center text-destructive">
              <h3 className="text-lg font-bold">Data Error</h3>
              <p>Received 0x0 dimensions. Cannot render view.</p>
              <p className="text-xs">Please check the file and try again.</p>
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
          <CardContent className="flex-grow p-0">
            <div ref={mountRef} className="w-full h-full" />
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
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={1} max={50} step={0.5} />
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
      </div>
    </div>
  )
});
PlateView3D.displayName = "PlateView3D";
