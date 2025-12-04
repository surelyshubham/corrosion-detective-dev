
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
import { Expand, Pin, RefreshCw, Percent, Ruler, LocateFixed } from 'lucide-react'
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

function createTextSprite(message: string, opts: { fontsize?: number, fontface?: string, textColor?: { r: number, g: number, b: number, a: number } }) {
    const { fontsize = 24, fontface = 'Arial', textColor = { r: 255, g: 255, b: 255, a: 1.0 } } = opts;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.font = `Bold ${fontsize}px ${fontface}`;
    const metrics = context.measureText(message);
    canvas.width = metrics.width;
    canvas.height = fontsize * 1.4; // give some space
    context.font = `Bold ${fontsize}px ${fontface}`;
    context.fillStyle = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${textColor.a})`;
    context.fillText(message, 0, fontsize);
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(canvas.width / 4, canvas.height / 4, 1.0);
    return sprite;
}

export type PlateView3DRef = {
  captureScreenshot: () => string;
  focusOnPoint: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface PlateView3DProps {
  onReady?: () => void;
}


export const PlateView3D = React.forwardRef<PlateView3DRef, PlateView3DProps>(({ onReady }, ref) => {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
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
  const refPlaneRef = useRef<THREE.Mesh | null>(null);
  const originMarkerRef = useRef<THREE.Mesh | null>(null);
  const minMaxGroupRef = useRef<THREE.Group | null>(null);
  const selectedMarkerRef = useRef<THREE.Mesh | null>(null);

  const { mergedGrid, stats, nominalThickness } = inspectionResult || {};

  const VISUAL_WIDTH = 100;

  const geometry = useMemo(() => {
    if (!stats || !mergedGrid) return null;
    const { gridSize } = stats;
    if (gridSize.width <= 1 || gridSize.height <= 1) return null;

    const aspect = gridSize.height / gridSize.width;
    const geom = new THREE.PlaneGeometry(VISUAL_WIDTH, VISUAL_WIDTH * aspect, gridSize.width - 1, gridSize.height - 1);
    geom.rotateX(-Math.PI / 2); // Rotate to lie flat on XZ plane
    return geom;
  }, [stats, mergedGrid]);


  useEffect(() => {
    if (!geometry || !meshRef.current || !stats || !nominalThickness || !mergedGrid) return;

    const { gridSize, minThickness, maxThickness } = stats;
    const effTRange = maxThickness - minThickness;
    
    const colors: number[] = [];
    const positions = geometry.attributes.position;
    
    let i = 0;
    for (let y = 0; y < gridSize.height; y++) {
        for (let x = 0; x < gridSize.width; x++, i++) {
            const cellData = mergedGrid[y]?.[x];
            
            // Y-position from wall LOSS, making it sink
            if (cellData && cellData.effectiveThickness !== null) {
                const loss = nominalThickness - cellData.effectiveThickness;
                const z = -loss * zScale; // Negative to go down
                positions.setY(i, z);
            } else {
                positions.setY(i, 0); // ND points are at the flat surface level
            }
            
            // Color from EFFECTIVE thickness
            let color: THREE.Color;
            if (colorMode === '%') {
                 const normalizedPercent = (cellData && cellData.effectiveThickness !== null && effTRange > 0)
                    ? (cellData.effectiveThickness - minThickness) / effTRange
                    : null;
                color = getNormalizedColor(normalizedPercent);
            } else {
                color = getAbsColor(cellData?.percentage ?? null);
            }
            colors.push(color.r, color.g, color.b);
        }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
    
    meshRef.current.geometry = geometry;

  }, [geometry, zScale, colorMode, nominalThickness, stats, mergedGrid]);

  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (cameraRef.current && controlsRef.current && inspectionResult) {
      const { stats: { gridSize } } = inspectionResult;
      const visualHeight = VISUAL_WIDTH * (gridSize.height / gridSize.width);
      controlsRef.current.target.set(0, 0, 0);
      const distance = Math.max(VISUAL_WIDTH, visualHeight) * 1.2;

      switch (view) {
        case 'top':
          cameraRef.current.position.set(0, distance, 0.001); // slight offset to avoid gimbal lock
          break;
        case 'side':
          cameraRef.current.position.set(distance, 0, 0);
          break;
        case 'iso':
        default:
          cameraRef.current.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
          break;
      }
      controlsRef.current.update();
    }
  }, [inspectionResult, zScale]);

  const resetCamera = useCallback(() => {
    setView('iso');
  }, [setView]);


  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current || !inspectionResult) return;

    requestAnimationFrame(animate);
    controlsRef.current.update();

    const { mergedGrid, stats } = inspectionResult;
    const { gridSize } = stats;
    const visualHeight = VISUAL_WIDTH * (gridSize.height / gridSize.width);


    if (refPlaneRef.current) {
      // The reference plane is now at Y=0, representing the nominal thickness surface
      refPlaneRef.current.position.y = 0;
      refPlaneRef.current.visible = showReference;
    }

    if (originMarkerRef.current) {
        originMarkerRef.current.visible = showOrigin;
        if (showOrigin) {
            const originData = mergedGrid[0]?.[0];
            let yPos = 0;
            if (originData && originData.effectiveThickness !== null) {
                const loss = nominalThickness! - originData.effectiveThickness;
                yPos = -loss * zScale;
            }
            originMarkerRef.current.position.set(-VISUAL_WIDTH / 2, yPos + 1.5, -visualHeight / 2);
        }
    }

    if (minMaxGroupRef.current) {
      minMaxGroupRef.current.visible = showMinMax;
      if (showMinMax) {
          const minMarker = minMaxGroupRef.current.children[0] as THREE.Mesh;
          const maxMarker = minMaxGroupRef.current.children[1] as THREE.Mesh;
          
          if(minMarker && stats.worstLocation){ 
              const pointData = mergedGrid[stats.worstLocation.y]?.[stats.worstLocation.x];
              if (pointData && pointData.effectiveThickness !== null) {
                const loss = nominalThickness! - pointData.effectiveThickness;
                const yPos = -loss * zScale;
                minMarker.position.set( (stats.worstLocation.x / gridSize.width - 0.5) * VISUAL_WIDTH, yPos, (stats.worstLocation.y / gridSize.height - 0.5) * visualHeight);
              }
          }

          const allPoints = mergedGrid.flat().filter(p => p && p.effectiveThickness !== null);
          const maxPoint = allPoints.reduce((prev, current) => {
            if (current.effectiveThickness === null || !prev || prev.effectiveThickness === null) return current;
            return (prev.effectiveThickness > current.effectiveThickness) ? prev : current
          }, allPoints[0])
          
          if(maxMarker && maxPoint && maxPoint.effectiveThickness !== null){ 
              let maxPointCoords = {x: 0, y: 0};
              for (let y = 0; y < gridSize.height; y++) {
                  const x = mergedGrid[y].findIndex(p => p && p.effectiveThickness === maxPoint.effectiveThickness);
                  if(x !== -1) {
                      maxPointCoords = { x, y };
                      break;
                  }
              }
              const loss = nominalThickness! - maxPoint.effectiveThickness;
              const yPos = -loss * zScale;
              maxMarker.position.set( (maxPointCoords.x / gridSize.width - 0.5) * VISUAL_WIDTH, yPos, (maxPointCoords.y / gridSize.height - 0.5) * visualHeight);
           }
      }
    }

    if (selectedMarkerRef.current) {
        if (selectedPoint) {
            const pointData = mergedGrid[selectedPoint.y]?.[selectedPoint.x];
            if (pointData && pointData.effectiveThickness !== null) {
                const loss = nominalThickness! - pointData.effectiveThickness;
                const yPos = -loss * zScale;
                selectedMarkerRef.current.position.set( (selectedPoint.x / gridSize.width - 0.5) * VISUAL_WIDTH, yPos, (selectedPoint.y / gridSize.height - 0.5) * visualHeight );
                selectedMarkerRef.current.visible = true;
            } else {
                selectedMarkerRef.current.visible = false;
            }
        } else {
            selectedMarkerRef.current.visible = false;
        }
    }
    
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [inspectionResult, zScale, showReference, showMinMax, showOrigin, selectedPoint, nominalThickness]);

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      if (!rendererRef.current) return '';
      rendererRef.current.render(sceneRef.current!, cameraRef.current!);
      return rendererRef.current.domElement.toDataURL('image/png');
    },
    focusOnPoint: (x: number, y: number, zoomIn: boolean) => {
        if (!cameraRef.current || !controlsRef.current || !stats) return;
        const { gridSize } = stats;
        const visualHeight = VISUAL_WIDTH * (gridSize.height / gridSize.width);
        
        const targetX = (x / gridSize.width - 0.5) * VISUAL_WIDTH;
        const targetZ = (y / gridSize.height - 0.5) * visualHeight;
        
        controlsRef.current.target.set(targetX, 0, targetZ);
        const distance = zoomIn ? 30 : 80;
        cameraRef.current.position.set(targetX, distance, targetZ + distance / 2);
        controlsRef.current.update();
    },
    resetCamera: resetCamera,
    setView: setView,
  }));

  useEffect(() => {
    if (!mountRef.current || !inspectionResult || !geometry) return;

    const currentMount = mountRef.current;

    // --- Initialize scene, camera, renderer, etc. ---
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);

    sceneRef.current = new THREE.Scene();
    
    const { stats } = inspectionResult;
    const { gridSize } = stats;
    const aspect = gridSize.height / gridSize.width;
    const visualHeight = VISUAL_WIDTH * aspect;

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);

    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sceneRef.current.add(dirLight);

    resetCamera();
    dirLight.position.set(VISUAL_WIDTH, visualHeight*2, zScale * 3);

    const gridContainer = new THREE.Group();
    gridContainer.add(new THREE.GridHelper(Math.max(VISUAL_WIDTH, visualHeight), 10, 0x888888, 0x444444));
    const axesHelper = new THREE.AxesHelper(Math.max(VISUAL_WIDTH, visualHeight) * 0.6);
    axesHelper.position.set(-VISUAL_WIDTH/2, 0, -visualHeight/2);
    gridContainer.add(axesHelper);
    
    const axisLabels = new THREE.Group();
    axisLabels.add(createTextSprite("X", {fontsize: 32})).position.set(VISUAL_WIDTH / 2 + 10, 0, -visualHeight / 2);
    axisLabels.add(createTextSprite("Y", {fontsize: 32})).position.set(-VISUAL_WIDTH / 2, 0, visualHeight / 2 + 10);
    axisLabels.add(createTextSprite("Z (Thickness)", {fontsize: 32})).position.set(-VISUAL_WIDTH / 2, zScale > 0 ? zScale + 10 : 10, -visualHeight / 2);
    gridContainer.add(axisLabels);
    sceneRef.current.add(gridContainer);
    
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    meshRef.current = new THREE.Mesh(geometry, material);
    sceneRef.current.add(meshRef.current);

    const refPlaneGeom = new THREE.PlaneGeometry(VISUAL_WIDTH * 1.1, visualHeight * 1.1);
    refPlaneGeom.rotateX(-Math.PI / 2);
    refPlaneRef.current = new THREE.Mesh(refPlaneGeom, new THREE.MeshStandardMaterial({ color: 0x1e90ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    sceneRef.current.add(refPlaneRef.current);

    originMarkerRef.current = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.8 })
    );
    originMarkerRef.current.renderOrder = 999; // Render on top
    sceneRef.current.add(originMarkerRef.current);


    minMaxGroupRef.current = new THREE.Group();
    minMaxGroupRef.current.add(new THREE.Mesh(new THREE.SphereGeometry(2, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000})));
    minMaxGroupRef.current.add(new THREE.Mesh(new THREE.SphereGeometry(2, 16, 16), new THREE.MeshBasicMaterial({color: 0x0000ff})));
    sceneRef.current.add(minMaxGroupRef.current);
    
    selectedMarkerRef.current = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 }));
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
        if (!currentMount || !meshRef.current || !cameraRef.current || !geometry || !mergedGrid) return;
        
        const rect = currentMount.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, cameraRef.current);
        const intersects = raycaster.intersectObject(meshRef.current!);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (!intersect.face) { setHoveredPoint(null); return; };

            const indices = [intersect.face.a, intersect.face.b, intersect.face.c];
            let closestVertexIndex = -1;
            let minDistance = Infinity;

            indices.forEach(index => {
                const vertex = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
                const distance = intersect.point.distanceTo(vertex);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestVertexIndex = index;
                }
            });

            if (closestVertexIndex !== -1) {
                const cols = inspectionResult.stats.gridSize.width;
                const row = Math.floor(closestVertexIndex / cols);
                const col = closestVertexIndex % cols;

                const cellData = mergedGrid[row]?.[col];
                if (cellData) {
                    const wallLoss = cellData.effectiveThickness !== null ? nominalThickness! - cellData.effectiveThickness : null;
                    setHoveredPoint({ x: col, y: row, ...cellData, wallLoss, clientX: event.clientX, clientY: event.clientY });
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
  }, [inspectionResult, geometry, setSelectedPoint, nominalThickness, onReady, resetCamera]);
  
  useEffect(() => {
    const animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [animate]);

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
            <div>Wall Loss: {hoveredPoint.wallLoss?.toFixed(2) ?? 'N/A'} mm</div>
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
PlateView3D.displayName = "PlateView3D";

    

    

    
