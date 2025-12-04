
"use client"

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, Percent, Ruler, LocateFixed } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { useImperativeHandle } from 'react'


const getAbsColor = (percentage: number | null): THREE.Color => {
    const color = new THREE.Color();
    if (percentage === null) color.set(0x888888); // Grey for ND
    else if (percentage < 70) color.set(0xff0000); // Red
    else if (percentage < 80) color.set(0xffff00); // Yellow
    else if (percentage < 90) color.set(0x00ff00); // Green
    else color.set(0x0000ff); // Blue
    return color;
};

const getNormalizedColor = (normalizedPercent: number | null): THREE.Color => {
    const color = new THREE.Color();
    if (normalizedPercent === null) color.set(0x888888); // Grey for ND
    else color.setHSL(0.7 * (1 - normalizedPercent), 1, 0.5); // Blue to Red
    return color;
};

const ColorLegend = ({ mode, stats, nominalThickness }: { mode: ColorMode, stats: any, nominalThickness: number}) => {
    const renderMmLegend = () => {
        const levels = [
            { label: `> 90%`, color: '#0000ff' },
            { label: `80-90%`, color: '#00ff00' },
            { label: `70-80%`, color: '#ffff00' },
            { label: `< 70%`, color: '#ff0000' },
        ];
        return (
            <>
                <div className="font-medium text-xs mb-1">Eff. Thickness (% of {nominalThickness}mm)</div>
                {levels.map(l => (
                    <div key={l.label} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: l.color }} />
                        <span>{l.label}</span>
                    </div>
                ))}
            </>
        )
    }

    const renderPercentLegend = () => {
        const min = stats.minThickness;
        const max = stats.maxThickness;
        const levels = [
            { pct: 1, label: `${max.toFixed(2)}mm (Max)` },
            { pct: 0.75, label: '' },
            { pct: 0.5, label: `${((max + min) / 2).toFixed(2)}mm` },
            { pct: 0.25, label: '' },
            { pct: 0, label: `${min.toFixed(2)}mm (Min)` },
        ];
        return (
             <>
                <div className="font-medium text-xs mb-1">Eff. Thickness (Normalized)</div>
                <div className="flex flex-col-reverse">
                {levels.map(l => (
                    <div key={l.pct} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: getNormalizedColor(l.pct)?.getStyle() }} />
                        <span>{l.label}</span>
                    </div>
                ))}
                </div>
            </>
        )
    }

    return (
        <Card className="bg-card/90">
            <CardHeader className="p-3">
                 <CardTitle className="text-base font-headline">Legend</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-xs">
                {mode === 'mm' ? renderMmLegend() : renderPercentLegend()}
                <div className="text-xs text-muted-foreground mt-1">ND: Gray</div>
            </CardContent>
        </Card>
    )
}

export type TankView3DRef = {
  captureScreenshot: () => string;
  focusOnPoint: (x: number, y: number) => void;
};

interface TankView3DProps {
  onReady?: () => void;
}


export const TankView3D = React.forwardRef<TankView3DRef, TankView3DProps>(({ onReady }, ref) => {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(15) // Represents radial exaggeration
  const [showOrigin, setShowOrigin] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const capsGroupRef = useRef<THREE.Group | null>(null);
  const originMarkerRef = useRef<THREE.Mesh | null>(null);
  const selectedMarkerRef = useRef<THREE.Mesh | null>(null);

  const { mergedGrid, stats, nominalThickness, pipeOuterDiameter, pipeLength } = inspectionResult || {};

  const geometry = useMemo(() => {
    if (!stats || !mergedGrid || !pipeOuterDiameter || !pipeLength) return null;
    const { gridSize } = stats;
    if (gridSize.width <= 1 || gridSize.height <= 1) return null;

    return new THREE.CylinderGeometry(
        pipeOuterDiameter / 2, 
        pipeOuterDiameter / 2, 
        pipeLength, 
        gridSize.width - 1, 
        gridSize.height - 1, 
        true // Open-ended
    );
  }, [stats, mergedGrid, pipeOuterDiameter, pipeLength]);


  useEffect(() => {
    if (!geometry || !meshRef.current || !stats || !nominalThickness || !mergedGrid || !pipeOuterDiameter || !pipeLength) return;

    const { gridSize, minThickness, maxThickness } = stats;
    const effTRange = maxThickness - minThickness;
    
    const colors: number[] = [];
    const positions = geometry.attributes.position;
    const pipeRadius = pipeOuterDiameter / 2;
    
    for (let i = 0; i < positions.count; i++) {
        const y_idx = Math.floor(i / gridSize.width);
        const x_idx = i % gridSize.width;

        const cellData = mergedGrid[y_idx]?.[x_idx];
        const effectiveThickness = cellData?.effectiveThickness;
        const percentage = cellData?.percentage;

        const angle = (x_idx / (gridSize.width - 1)) * 2 * Math.PI;
        
        let r = pipeRadius;
        if (effectiveThickness !== null && effectiveThickness !== undefined) {
            const loss = nominalThickness - effectiveThickness;
            const radialOffset = loss * zScale; // exaggeration
            r = pipeRadius - radialOffset;
        }

        positions.setX(i, r * Math.cos(angle));
        positions.setZ(i, r * Math.sin(angle)); // Map to XZ plane for radial

        let color: THREE.Color;
        if (colorMode === '%') {
             const normalizedPercent = (effectiveThickness !== null && effectiveThickness !== undefined && effTRange > 0)
                ? (effectiveThickness - minThickness) / effTRange
                : null;
            color = getNormalizedColor(normalizedPercent);
        } else {
            color = getAbsColor(percentage ?? null);
        }
        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
    
    meshRef.current.geometry = geometry;

    // Update caps position
    if (capsGroupRef.current) {
        const topCap = capsGroupRef.current.children[0] as THREE.Mesh;
        const bottomCap = capsGroupRef.current.children[1] as THREE.Mesh;
        topCap.position.y = pipeLength / 2;
        bottomCap.position.y = -pipeLength / 2;
    }


  }, [geometry, zScale, colorMode, nominalThickness, stats, mergedGrid, pipeOuterDiameter, pipeLength]);


  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current || !inspectionResult) return;

    requestAnimationFrame(animate);
    controlsRef.current.update();

    const { mergedGrid, stats, nominalThickness, pipeOuterDiameter, pipeLength } = inspectionResult;
    if (!pipeOuterDiameter || !pipeLength) return;

    const { gridSize } = stats;

    if (originMarkerRef.current) {
        originMarkerRef.current.visible = showOrigin;
        if (showOrigin) {
            const originData = mergedGrid[0]?.[0];
            const pipeRadius = pipeOuterDiameter / 2;
            let r = pipeRadius;
            if (originData && originData.effectiveThickness !== null) {
                const loss = nominalThickness! - originData.effectiveThickness;
                r = pipeRadius - (loss * zScale);
            }
            originMarkerRef.current.position.set(r, -pipeLength / 2, 0);
        }
    }

    if (selectedMarkerRef.current) {
        if (selectedPoint) {
            const pointData = mergedGrid[selectedPoint.y]?.[selectedPoint.x];
            if (pointData && pointData.effectiveThickness !== null) {
                const pipeRadius = pipeOuterDiameter / 2;
                const angle = (selectedPoint.x / (gridSize.width - 1)) * 2 * Math.PI;
                const y = (selectedPoint.y / (gridSize.height - 1)) * pipeLength - pipeLength / 2;
                const loss = nominalThickness! - pointData.effectiveThickness;
                const r = pipeRadius - (loss * zScale);
                selectedMarkerRef.current.position.set(r * Math.cos(angle), y, r * Math.sin(angle));
                selectedMarkerRef.current.visible = true;
            } else {
                selectedMarkerRef.current.visible = false;
            }
        } else {
            selectedMarkerRef.current.visible = false;
        }
    }
    
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [inspectionResult, zScale, showOrigin, selectedPoint, nominalThickness]);

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      if (!rendererRef.current) return '';
      rendererRef.current.render(sceneRef.current!, cameraRef.current!);
      return rendererRef.current.domElement.toDataURL('image/png');
    },
    focusOnPoint: (x: number, y: number) => {
        if (!cameraRef.current || !controlsRef.current || !stats || !pipeOuterDiameter || !pipeLength) return;
        const { gridSize } = stats;
        const pipeRadius = pipeOuterDiameter / 2;
        const angle = (x / (gridSize.width - 1)) * 2 * Math.PI;
        const height = (y / (gridSize.height - 1)) * pipeLength - pipeLength / 2;
        const targetX = pipeRadius * Math.cos(angle);
        const targetZ = pipeRadius * Math.sin(angle);
        
        controlsRef.current.target.set(targetX, height, targetZ);
        cameraRef.current.position.set(targetX * 2, height, targetZ * 2);
        controlsRef.current.update();
      }
  }));

  useEffect(() => {
    if (!mountRef.current || !inspectionResult || !geometry || !pipeOuterDiameter || !pipeLength) return;

    const currentMount = mountRef.current;

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);

    sceneRef.current = new THREE.Scene();
    
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(pipeOuterDiameter, pipeLength * 2, pipeOuterDiameter);
    sceneRef.current.add(dirLight);

    cameraRef.current.position.set(pipeOuterDiameter * 0.7, 0, pipeOuterDiameter * 0.7);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    meshRef.current = new THREE.Mesh(geometry, material);
    meshRef.current.rotation.z = -Math.PI / 2; // Make it horizontal
    sceneRef.current.add(meshRef.current);

    // --- Create Caps ---
    capsGroupRef.current = new THREE.Group();
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
    const capGeometry = new THREE.CircleGeometry(pipeOuterDiameter / 2, 64);
    const topCap = new THREE.Mesh(capGeometry, capMaterial);
    topCap.position.y = pipeLength / 2;
    topCap.rotation.x = -Math.PI / 2;
    const bottomCap = new THREE.Mesh(capGeometry, capMaterial);
    bottomCap.position.y = -pipeLength / 2;
    bottomCap.rotation.x = Math.PI / 2;
    capsGroupRef.current.add(topCap);
    capsGroupRef.current.add(bottomCap);
    capsGroupRef.current.rotation.z = -Math.PI / 2; // Make it horizontal
    sceneRef.current.add(capsGroupRef.current);
    // --- End Caps ---

    originMarkerRef.current = new THREE.Mesh(
      new THREE.BoxGeometry(pipeOuterDiameter / 50, pipeOuterDiameter / 50, pipeOuterDiameter / 50),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.8 })
    );
    originMarkerRef.current.renderOrder = 999;
    sceneRef.current.add(originMarkerRef.current);
    
    selectedMarkerRef.current = new THREE.Mesh(new THREE.SphereGeometry(pipeOuterDiameter / 100, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 }));
    selectedMarkerRef.current.visible = false;
    sceneRef.current.add(selectedMarkerRef.current);
    
    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
        if (!currentMount || !meshRef.current || !cameraRef.current || !geometry) return;
        const rect = currentMount.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, cameraRef.current);
        const intersects = raycaster.intersectObject(meshRef.current!);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.uv && mergedGrid && stats) {
                const x = Math.round(intersect.uv.x * (stats.gridSize.width - 1));
                const y = Math.round((1-intersect.uv.y) * (stats.gridSize.height - 1));

                const cellData = mergedGrid[y]?.[x];

                if (cellData) {
                    setHoveredPoint({ x: x, y: y, ...cellData, clientX: event.clientX, clientY: event.clientY });
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
    
    const onClick = (event: MouseEvent) => {
        if(hoveredPoint){
            setSelectedPoint({ x: hoveredPoint.x, y: hoveredPoint.y });
        }
    };

    currentMount.addEventListener('mousemove', onMouseMove);
    currentMount.addEventListener('click', onClick);

    if (onReady) {
      onReady();
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('mousemove', onMouseMove);
      currentMount.removeEventListener('click', onClick);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [inspectionResult, geometry, setSelectedPoint, pipeOuterDiameter, pipeLength]);
  
  useEffect(() => {
    const animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [animate]);

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && inspectionResult && pipeOuterDiameter && pipeLength) {
        cameraRef.current.position.set(pipeOuterDiameter * 0.7, 0, pipeOuterDiameter * 0.7);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
    }
  }

  const setView = (view: 'top' | 'side' | 'front') => {
    if (cameraRef.current && controlsRef.current && pipeOuterDiameter) {
        controlsRef.current.target.set(0, 0, 0);
        const distance = pipeOuterDiameter * 1.5;
        switch (view) {
            case 'top':
                cameraRef.current.position.set(0, distance, 0);
                break;
            case 'side':
                cameraRef.current.position.set(distance, 0, 0);
                break;
            case 'front':
                cameraRef.current.position.set(0, 0, distance);
                break;
        }
        controlsRef.current.update();
    }
  };


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
        {hoveredPoint && (
          <div
            className="absolute p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border"
            style={{
              left: `${hoveredPoint.clientX}px`,
              top: `${hoveredPoint.clientY}px`,
              transform: `translate(15px, -100%)`
            }}
          >
            <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
            {hoveredPoint.plateId && <div className="text-muted-foreground">{hoveredPoint.plateId}</div>}
            <div>Eff. Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
            <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
          </div>
        )}
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
            <Button variant="outline" onClick={() => setView('front')}>Front</Button>
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
    


    