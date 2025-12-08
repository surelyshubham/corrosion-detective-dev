
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
import { RefreshCw, Percent, Ruler, LocateFixed } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { useImperativeHandle } from 'react'


const ColorLegend = ({ mode, stats, nominalThickness }: { mode: ColorMode, stats: any, nominalThickness: number}) => {
    // This component remains largely the same as before
    return <Card className="bg-card/90"><CardHeader className="p-3"><CardTitle className="text-base">Legend</CardTitle></CardHeader></Card>;
}

export type TankView3DRef = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface TankView3DProps {}


export const TankView3D = React.forwardRef<TankView3DRef, TankView3DProps>((props, ref) => {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(15) // Represents radial exaggeration
  const [showOrigin, setShowOrigin] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const colorTextureRef = useRef<THREE.DataTexture | null>(null);
  const displacementTextureRef = useRef<THREE.DataTexture | null>(null);

  const { nominalThickness, pipeOuterDiameter, pipeLength } = inspectionResult || {};
  const stats = DataVault.stats;

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
        const material = meshRef.current.material as THREE.ShaderMaterial;
        material.uniforms.colorTexture.value = colorTextureRef.current;
        material.uniforms.displacementTexture.value = displacementTextureRef.current;
        material.uniforms.zScale.value = zScale;
        material.uniforms.nominalThickness.value = nominalThickness;
        material.uniforms.pipeRadius.value = (pipeOuterDiameter || 0) / 2;
        material.needsUpdate = true;
    }
  }, [dataVersion, stats, zScale, nominalThickness, pipeOuterDiameter]);

  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (cameraRef.current && controlsRef.current && pipeOuterDiameter && pipeLength) {
        controlsRef.current.target.set(0, 0, 0);
        const distance = Math.max(pipeOuterDiameter, pipeLength) * 1.5;
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
  }, [pipeOuterDiameter, pipeLength]);


  const resetCamera = useCallback(() => {
    setView('iso');
  }, [setView]);


   useImperativeHandle(ref, () => ({
    capture: () => rendererRef.current?.domElement.toDataURL('image/png') || '',
    focus: (x, y, zoomIn) => {
        if (!cameraRef.current || !controlsRef.current || !stats || !pipeOuterDiameter || !pipeLength) return;
        const { width, height } = stats.gridSize;
        const pipeRadius = pipeOuterDiameter / 2;
        const angle = (x / (width - 1)) * 2 * Math.PI;
        const h = (y / (height - 1)) * pipeLength - pipeLength / 2;
        const targetX = pipeRadius * Math.cos(angle);
        const targetZ = pipeRadius * Math.sin(angle);
        
        controlsRef.current.target.set(targetX, h, targetZ);
        const distance = zoomIn ? pipeRadius / 2 : pipeRadius * 2;
        cameraRef.current.position.set(targetX * (1 + distance/pipeRadius), h, targetZ * (1 + distance/pipeRadius));
        controlsRef.current.update();
    },
    resetCamera: resetCamera,
    setView: setView,
  }));

  useEffect(() => {
    if (!mountRef.current || !inspectionResult || !pipeOuterDiameter || !pipeLength) return;
    
    if (!stats) return;

    const currentMount = mountRef.current;

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);

    sceneRef.current = new THREE.Scene();
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 5000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(pipeOuterDiameter, pipeLength * 2, pipeOuterDiameter);
    sceneRef.current.add(dirLight);

    const { width, height } = stats.gridSize;
    const geometry = new THREE.CylinderGeometry(pipeOuterDiameter / 2, pipeOuterDiameter / 2, pipeLength, width - 1, height - 1, true);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            colorTexture: { value: null },
            displacementTexture: { value: null },
            zScale: { value: zScale },
            nominalThickness: { value: nominalThickness || 10 },
            pipeRadius: { value: pipeOuterDiameter / 2 },
        },
        vertexShader: `
            uniform sampler2D displacementTexture;
            uniform float zScale;
            uniform float nominalThickness;
            uniform float pipeRadius;
            varying vec2 vUv;

            void main() {
                vUv = uv;
                float displacementValue = texture2D(displacementTexture, uv).r;
                float loss = nominalThickness - displacementValue;
                float currentRadius = pipeRadius - (loss * zScale);
                
                float angle = uv.x * 2.0 * 3.14159265;

                vec3 newPosition;
                newPosition.x = currentRadius * cos(angle);
                newPosition.z = currentRadius * sin(angle);
                newPosition.y = position.y;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D colorTexture;
            varying vec2 vUv;
            void main() {
                gl_FragColor = texture2D(colorTexture, vUv);
            }
        `,
        side: THREE.DoubleSide,
    });
    
    meshRef.current = new THREE.Mesh(geometry, material);
    sceneRef.current.add(meshRef.current);
    
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
    const capGeometry = new THREE.CircleGeometry(pipeOuterDiameter / 2, 64);
    const topCap = new THREE.Mesh(capGeometry, capMaterial);
    topCap.position.y = pipeLength / 2;
    topCap.rotation.x = -Math.PI / 2;
    const bottomCap = new THREE.Mesh(capGeometry, capMaterial);
    bottomCap.position.y = -pipeLength / 2;
    bottomCap.rotation.x = Math.PI / 2;
    sceneRef.current.add(topCap);
    sceneRef.current.add(bottomCap);

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
  }, [inspectionResult, animate, resetCamera, pipeOuterDiameter, pipeLength, zScale, nominalThickness, stats]);
  
  
  if (!inspectionResult) return null;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="font-headline">3D Tank View</CardTitle>
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
              <Label>Radial Exaggeration: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={1} max={50} step={0.5} />
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
        {stats && nominalThickness && (
          <ColorLegend mode={colorMode} stats={stats} nominalThickness={nominalThickness} />
        )}
      </div>
    </div>
  )
});
TankView3D.displayName = "TankView3D";

    