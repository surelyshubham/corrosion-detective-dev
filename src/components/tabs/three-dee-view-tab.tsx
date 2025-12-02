"use client"

import React, { useRef, useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Camera, Expand, Minimize, Pin, Redo, RefreshCw, Percent, Ruler } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'

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
            { label: `90-100%`, color: '#0000ff' },
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


export function ThreeDeeViewTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(15)
  const [showReference, setShowReference] = useState(false)
  const [showMinMax, setShowMinMax] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);

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
            
            // Y-position from EFFECTIVE thickness
            if (cellData && cellData.effectiveThickness !== null) {
                const normEff = effTRange > 0 ? (cellData.effectiveThickness - minThickness) / effTRange : 0;
                positions.setY(i, normEff * zScale);
            } else {
                positions.setY(i, 0); 
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


  useEffect(() => {
    if (!mountRef.current || !inspectionResult || !geometry) return

    const { mergedGrid, stats, nominalThickness } = inspectionResult
    const { gridSize, minThickness, maxThickness } = stats
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    mountRef.current.innerHTML = ''
    mountRef.current.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    sceneRef.current = scene
    
    const aspect = gridSize.height / gridSize.width;
    const visualHeight = VISUAL_WIDTH * aspect;

    const camera = new THREE.PerspectiveCamera(60, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2000)
    camera.position.set(VISUAL_WIDTH * 0.7, VISUAL_WIDTH * 0.9, zScale * 2);
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.update()
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
    dirLight.position.set(VISUAL_WIDTH, visualHeight*2, zScale * 3)
    scene.add(dirLight)

    // AXES and GRIDS
    const gridContainer = new THREE.Group();
    const mainGrid = new THREE.GridHelper(Math.max(VISUAL_WIDTH, visualHeight), 10, 0x888888, 0x444444);
    gridContainer.add(mainGrid);

    const axesHelper = new THREE.AxesHelper(Math.max(VISUAL_WIDTH, visualHeight) * 0.6);
    axesHelper.position.set(-VISUAL_WIDTH/2, 0, -visualHeight/2);
    gridContainer.add(axesHelper);
    
    // Add axis labels
    const axisLabels = new THREE.Group();
    const xLabel = createTextSprite("X", {fontsize: 32});
    xLabel.position.set(VISUAL_WIDTH / 2 + 10, 0, -visualHeight / 2);
    axisLabels.add(xLabel);

    const yLabel = createTextSprite("Y", {fontsize: 32});
    yLabel.position.set(-VISUAL_WIDTH / 2, 0, visualHeight / 2 + 10);
    axisLabels.add(yLabel);

    const zLabel = createTextSprite("Z (Thickness)", {fontsize: 32});
    zLabel.position.set(-VISUAL_WIDTH / 2, zScale > 0 ? zScale + 10 : 10, -visualHeight / 2);
    axisLabels.add(zLabel);
    
    const tickLength = 2;
    const numTicks = 5;

    for (let i = 0; i <= numTicks; i++) {
        const frac = i / numTicks;
        // X-axis ticks
        const xPos = (frac - 0.5) * VISUAL_WIDTH;
        const xTickLabel = createTextSprite(`${Math.round(frac * gridSize.width)}`, { fontsize: 18 });
        xTickLabel.position.set(xPos, 0, -visualHeight / 2 - tickLength - 5);
        axisLabels.add(xTickLabel);

        // Y-axis ticks (now Z in scene space)
        const zPos = (frac - 0.5) * visualHeight;
        const yTickLabel = createTextSprite(`${Math.round(frac * gridSize.height)}`, { fontsize: 18 });
        yTickLabel.position.set(-VISUAL_WIDTH / 2 - tickLength - 10, 0, zPos);
        axisLabels.add(yTickLabel);
    }
    
    gridContainer.add(axisLabels);
    scene.add(gridContainer);


    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    const refPlaneGeom = new THREE.PlaneGeometry(VISUAL_WIDTH * 1.1, visualHeight * 1.1);
    refPlaneGeom.rotateX(-Math.PI / 2);
    const refPlaneMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const refPlane = new THREE.Mesh(refPlaneGeom, refPlaneMat);
    refPlane.visible = showReference;
    scene.add(refPlane);
    
    const effTRange = stats.maxThickness - stats.minThickness;

    const minMaxGroup = new THREE.Group();
    
    let minMarker: THREE.Mesh | null = null;
    if(stats.worstLocation){
        minMarker = new THREE.Mesh(new THREE.SphereGeometry(VISUAL_WIDTH/100, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000}));
        minMaxGroup.add(minMarker);
    }
    
    const allPoints = mergedGrid.flat().filter(p => p.effectiveThickness !== null);
    const maxPoint = allPoints.reduce((prev, current) => {
      if (current.effectiveThickness === null || prev.effectiveThickness === null) return prev;
      return (prev.effectiveThickness > current.effectiveThickness) ? prev : current
    }, allPoints[0])
    
    let maxMarker: THREE.Mesh | null = null;
    let maxPointCoords = {x: 0, y: 0};

    // Find coordinates of maxPoint
    if(maxPoint) {
        for (let y = 0; y < gridSize.height; y++) {
            const x = mergedGrid[y].findIndex(p => p && p.effectiveThickness === maxPoint.effectiveThickness);
            if(x !== -1) {
                maxPointCoords = { x, y };
                break;
            }
        }
        maxMarker = new THREE.Mesh(new THREE.SphereGeometry(VISUAL_WIDTH/100, 16, 16), new THREE.MeshBasicMaterial({color: 0x0000ff}));
        minMaxGroup.add(maxMarker);
    }

    minMaxGroup.visible = showMinMax;
    scene.add(minMaxGroup);
    
    const selectedMarker = new THREE.Mesh(new THREE.SphereGeometry(VISUAL_WIDTH/80, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 }));
    selectedMarker.visible = false;
    scene.add(selectedMarker);
    
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      
      const normNominal = effTRange > 0 ? (nominalThickness - stats.minThickness) / effTRange : 0;
      refPlane.position.y = normNominal * zScale;
      refPlane.visible = showReference;

      if(minMarker && stats.worstLocation){ 
          const pointData = mergedGrid[stats.worstLocation.y]?.[stats.worstLocation.x];
          if (pointData && pointData.effectiveThickness !== null) {
            const normMinY = effTRange > 0 ? (pointData.effectiveThickness - stats.minThickness) / effTRange : 0;
            minMarker.position.set( (stats.worstLocation.x / gridSize.width - 0.5) * VISUAL_WIDTH, normMinY * zScale, (stats.worstLocation.y / gridSize.height - 0.5) * visualHeight);
          }
      }
      if(maxMarker && maxPoint && maxPoint.effectiveThickness !== null){ 
          const normMaxY = effTRange > 0 ? (maxPoint.effectiveThickness - stats.minThickness) / effTRange : 0;
          maxMarker.position.set( (maxPointCoords.x / gridSize.width - 0.5) * VISUAL_WIDTH, normMaxY * zScale, (maxPointCoords.y / gridSize.height - 0.5) * visualHeight);
       }
      minMaxGroup.visible = showMinMax;

      if (selectedPoint) {
          const pointData = mergedGrid[selectedPoint.y]?.[selectedPoint.x];
          if (pointData && pointData.effectiveThickness !== null) {
              const normY = effTRange > 0 ? (pointData.effectiveThickness - stats.minThickness) / effTRange : 0;
              selectedMarker.position.set( (selectedPoint.x / gridSize.width - 0.5) * VISUAL_WIDTH, normY * zScale, (selectedPoint.y / gridSize.height - 0.5) * visualHeight );
              selectedMarker.visible = true;
          } else {
              selectedMarker.visible = false;
          }
      } else {
          selectedMarker.visible = false;
      }
      
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (mountRef.current) {
        camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
      }
    }
    window.addEventListener('resize', handleResize)

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
        if (!mountRef.current || !meshRef.current) return;
        const rect = mountRef.current.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(meshRef.current!);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (!intersect.face) return;

            // This logic assumes a non-indexed BufferGeometry, which PlaneGeometry is.
            // We check vertices a, b, and c of the intersected face.
            const indices = [intersect.face.a, intersect.face.b, intersect.face.c];
            let closestIndex = -1;
            let minDistance = Infinity;

            indices.forEach(index => {
                const vertex = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index);
                const distance = intersect.point.distanceTo(vertex);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = index;
                }
            });

            if (closestIndex !== -1) {
                const x = closestIndex % gridSize.width;
                const y = Math.floor(closestIndex / gridSize.width);
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

    mountRef.current.addEventListener('mousemove', onMouseMove);
    mountRef.current.addEventListener('click', onClick);


    return () => {
      window.removeEventListener('resize', handleResize)
      if (mountRef.current) {
        mountRef.current.removeEventListener('mousemove', onMouseMove);
        mountRef.current.removeEventListener('click', onClick);
        mountRef.current.innerHTML = ''
      }
    }
  }, [inspectionResult, geometry, setSelectedPoint]) // only re-init scene when data or geometry changes
  
  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && inspectionResult) {
        const { gridSize } = inspectionResult.stats;
        const aspect = gridSize.height / gridSize.width;
        cameraRef.current.position.set(VISUAL_WIDTH * 0.7, zScale * 4, VISUAL_WIDTH * aspect * 0.7 );
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
    }
  }

  const setView = (view: 'top' | 'side' | 'front') => {
    if (cameraRef.current && controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        switch (view) {
            case 'top':
                cameraRef.current.position.set(0, VISUAL_WIDTH, 0);
                break;
            case 'side':
                cameraRef.current.position.set(VISUAL_WIDTH, 5, 0);
                break;
            case 'front':
                cameraRef.current.position.set(0, 5, VISUAL_WIDTH);
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
              <Label>Z-Axis Scale: {zScale.toFixed(1)}x</Label>
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
}
