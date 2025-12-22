

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
import { RefreshCw, LocateFixed, Pin } from 'lucide-react'
import { useImperativeHandle } from 'react'
import { ColorLegend } from './ColorLegend'


export type TankView3DRef = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface TankView3DProps {}


export const TankView3D = React.forwardRef<TankView3DRef, TankView3DProps>((props, ref) => {
  const { inspectionResult, selectedPoint, setSelectedPoint, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(15) // Represents radial exaggeration
  const [showOrigin, setShowOrigin] = useState(true)
  const [showMinMax, setShowMinMax] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerRef = useRef<THREE.Vector2 | null>(null);
  const originAxesRef = useRef<THREE.AxesHelper | null>(null);
  const colorTextureRef = useRef<THREE.DataTexture | null>(null);
  const displacementTextureRef = useRef<THREE.DataTexture | null>(null);
  const minMarkerRef = useRef<THREE.Mesh | null>(null);
  const maxMarkerRef = useRef<THREE.Mesh | null>(null);

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
    capture: () => rendererRef.current!.domElement.toDataURL(),
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
    raycasterRef.current = new THREE.Raycaster();
    pointerRef.current = new THREE.Vector2();

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 5000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(pipeOuterDiameter, pipeLength * 2, pipeOuterDiameter);
    sceneRef.current.add(dirLight);

    const { width, height } = stats.gridSize;
    const geometry = new THREE.CylinderGeometry(pipeOuterDiameter / 2, pipeOuterDiameter / 2, pipeLength, width > 1 ? width - 1 : 64, height > 1 ? height - 1 : 1, false);
    
    const caps = new THREE.Group();
    const capGeo = new THREE.CircleGeometry(pipeOuterDiameter / 2, 64);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
    
    const CAP_OFFSET = 0.01; // Tiny offset to prevent Z-fighting

    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = pipeLength / 2 + CAP_OFFSET;
    topCap.rotation.x = Math.PI / 2;
    caps.add(topCap);

    const bottomCap = new THREE.Mesh(capGeo, capMat);
    bottomCap.position.y = -pipeLength / 2 - CAP_OFFSET;
    bottomCap.rotation.x = -Math.PI / 2;
    caps.add(bottomCap);

    sceneRef.current.add(caps);


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

    originAxesRef.current = new THREE.AxesHelper(Math.max(pipeOuterDiameter, pipeLength) * 0.1);
    sceneRef.current.add(originAxesRef.current);

    // Min/Max Markers
    const markerGeo = new THREE.ConeGeometry(pipeOuterDiameter / 50, pipeOuterDiameter / 25, 8);
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
      if (!pointerRef.current || !mountRef.current || !raycasterRef.current || !cameraRef.current || !meshRef.current || !DataVault.gridMatrix) {
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
          const { width, height } = stats.gridSize;
          const gridX = Math.floor(uv.x * (width - 1));
          const gridY = Math.floor((1-uv.y) * (height-1));
          
          if (gridX >= 0 && gridX < width && gridY >= 0 && gridY < height) {
              const pointData = DataVault.gridMatrix[gridY]?.[gridX];
               if(pointData && typeof pointData.rawThickness === 'number' && !isNaN(pointData.rawThickness)) {
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
  }, [inspectionResult, animate, resetCamera, pipeOuterDiameter, pipeLength, zScale, nominalThickness, stats]);
  
  useEffect(() => {
    if (meshRef.current) {
        const material = meshRef.current.material as THREE.ShaderMaterial;
        material.uniforms.zScale.value = zScale;
        material.needsUpdate = true;
    }
    // Update marker positions when zScale changes
    if (stats && minMarkerRef.current && maxMarkerRef.current && pipeOuterDiameter && pipeLength && nominalThickness) {
      const { worstLocation, bestLocation, gridSize } = stats;
      const pipeRadius = pipeOuterDiameter / 2;

      const placeMarker = (marker: THREE.Mesh, location: any, value: number) => {
        if (!location) return;
        const angle = (location.x / (gridSize.width - 1)) * 2 * Math.PI;
        const h = (location.y / (gridSize.height - 1)) * pipeLength - pipeLength / 2;
        const loss = nominalThickness - value;
        const currentRadius = pipeRadius - loss * zScale;
        const x = currentRadius * Math.cos(angle);
        const z = currentRadius * Math.sin(angle);
        marker.position.set(x, h, z);
        marker.lookAt(new THREE.Vector3(0,h,0));
        marker.rotateX(Math.PI/2);
      }

      placeMarker(minMarkerRef.current, worstLocation, worstLocation?.value || 0);
      placeMarker(maxMarkerRef.current, bestLocation, bestLocation?.value || 0);
    }
  }, [zScale, stats, pipeOuterDiameter, pipeLength, nominalThickness]);
  
  useEffect(() => {
    if (originAxesRef.current) {
        originAxesRef.current.visible = showOrigin;
    }
  }, [showOrigin]);

  useEffect(() => {
    if (minMarkerRef.current) minMarkerRef.current.visible = showMinMax;
    if (maxMarkerRef.current) maxMarkerRef.current.visible = showMinMax;
  }, [showMinMax]);
  
  
  if (!inspectionResult) return null;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col border">
          <CardHeader>
            <CardTitle className="font-headline">3D Tank View</CardTitle>
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
              <Label>Radial Exaggeration: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={1} max={50} step={0.5} />
            </div>
             <div className="flex items-center justify-between">
              <Label htmlFor="origin-switch" className="flex items-center gap-2"><LocateFixed className="h-4 w-4" />Show Origin</Label>
              <Switch id="origin-switch" checked={showOrigin} onCheckedChange={setShowOrigin} />
            </div>
             <div className="flex items-center justify-between">
              <Label htmlFor="min-max-switch" className="flex items-center gap-2"><Pin className="h-4 w-4" />Show Min/Max Points</Label>
              <Switch id="min-max-switch" checked={showMinMax} onCheckedChange={setShowMinMax} />
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
TankView3D.displayName = "TankView3D";


    