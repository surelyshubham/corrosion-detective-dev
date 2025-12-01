
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
    else if (percentage <= 20) color.set(0xff0000); // Red
    else if (percentage <= 40) color.set(0xffa500); // Orange
    else if (percentage <= 60) color.set(0xffff00); // Yellow
    else if (percentage <= 80) color.set(0x90ee90); // LightGreen
    else color.set(0x006400); // DarkGreen
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
            { pct: 100, label: `> 80%`, color: '#006400' },
            { pct: 80, label: `61-80%`, color: '#90ee90' },
            { pct: 60, label: `41-60%`, color: '#ffff00' },
            { pct: 40, label: `21-40%`, color: '#ffa500' },
            { pct: 20, label: `< 20%`, color: '#ff0000' },
        ];
        return (
            <>
                <div className="font-medium text-xs mb-1">Thickness (% of {nominalThickness}mm)</div>
                {levels.map(l => (
                    <div key={l.pct} className="flex items-center gap-2 text-xs">
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
            { pct: 1, label: `${max.toFixed(2)}mm (Max)`, color: getNormalizedColor(1).getStyle() },
            { pct: 0.75, label: '', color: getNormalizedColor(0.75).getStyle() },
            { pct: 0.5, label: `${((max + min) / 2).toFixed(2)}mm`, color: getNormalizedColor(0.5).getStyle() },
            { pct: 0.25, label: '', color: getNormalizedColor(0.25).getStyle() },
            { pct: 0, label: `${min.toFixed(2)}mm (Min)`, color: getNormalizedColor(0).getStyle() },
        ];
        return (
             <>
                <div className="font-medium text-xs mb-1">Thickness (Normalized)</div>
                <div className="flex flex-col-reverse">
                {levels.map(l => (
                    <div key={l.pct} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: l.color }} />
                        <span>{l.label}</span>
                    </div>
                ))}
                </div>
            </>
        )
    }

    return (
        <div className="absolute bottom-2 left-2 bg-card/80 p-2 rounded-md text-card-foreground border text-xs">
            {mode === 'mm' ? renderMmLegend() : renderPercentLegend()}
        </div>
    )
}

export function ThreeDeeViewTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(5)
  const [showReference, setShowReference] = useState(true)
  const [showMinMax, setShowMinMax] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const dataMapRef = useRef(new Map());

  const { processedData, stats, nominalThickness } = inspectionResult || {};

  const geometry = useMemo(() => {
    if (!stats) return null;
    const { gridSize } = stats;
    const geom = new THREE.PlaneGeometry(gridSize.width, gridSize.height, gridSize.width - 1, gridSize.height - 1);
    geom.computeVertexNormals();
    return geom;
  }, [stats]);


  useEffect(() => {
    if (!geometry || !meshRef.current || !stats || !nominalThickness) return;

    const { minThickness, maxThickness } = stats;
    const thicknessRange = maxThickness - minThickness;

    const colors: number[] = [];
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i) + stats.gridSize.width / 2;
        const z_plane = positions.getZ(i) + stats.gridSize.height / 2;
        
        const point = dataMapRef.current.get(`${Math.round(x)},${Math.round(z_plane)}`);
        
        const thickness = point?.thickness ?? nominalThickness;
        const y_pos = thickness * zScale; 
        positions.setY(i, y_pos);

        let color: THREE.Color;
        if (colorMode === '%') {
            const normalized = point?.thickness !== null && thicknessRange > 0
                ? (point.thickness - minThickness) / thicknessRange
                : null;
            color = getNormalizedColor(normalized);
        } else {
            color = getAbsColor(point?.percentage ?? 100);
        }
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
    
    meshRef.current.geometry = geometry;

  }, [geometry, zScale, colorMode, nominalThickness, stats]);


  useEffect(() => {
    if (!mountRef.current || !inspectionResult || !geometry) return

    const { processedData, stats, nominalThickness } = inspectionResult
    const { gridSize, minThickness, maxThickness } = stats
    dataMapRef.current = new Map(processedData.map(p => [`${p.x},${p.y}`, p]))
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    mountRef.current.innerHTML = ''
    mountRef.current.appendChild(renderer.domElement)

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2000)
    camera.position.set(gridSize.width * 0.9, gridSize.height * 1.2, gridSize.width * 1.4)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(gridSize.width / 2, 0, gridSize.height / 2)
    controls.update()
    controlsRef.current = controls

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
    dirLight.position.set(gridSize.width, gridSize.height * 2, gridSize.width)
    scene.add(dirLight)

    // Grid
    const gridHelper = new THREE.GridHelper(Math.max(gridSize.width, gridSize.height), 10, 0x888888, 0x888888)
    gridHelper.position.set(gridSize.width / 2, 0, gridSize.height / 2)
    scene.add(gridHelper);

    // Main Asset Surface Geometry
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(gridSize.width / 2, 0, gridSize.height / 2);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;

    // Reference Plane
    const refPlaneGeom = new THREE.PlaneGeometry(gridSize.width * 1.1, gridSize.height * 1.1);
    const refPlaneMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const refPlane = new THREE.Mesh(refPlaneGeom, refPlaneMat);
    refPlane.rotation.x = -Math.PI / 2;
    refPlane.visible = showReference;
    scene.add(refPlane);
    
    // Min/Max Markers
    const minMaxGroup = new THREE.Group();
    const minPoint = processedData.find(p => p.thickness === minThickness)
    if(minPoint){
        const minMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/100, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000}));
        minMaxGroup.add(minMarker);
    }
    const maxPoint = processedData.find(p => p.thickness === maxThickness)
    if(maxPoint){
        const maxMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/100, 16, 16), new THREE.MeshBasicMaterial({color: 0x0000ff}));
        minMaxGroup.add(maxMarker);
    }
    minMaxGroup.visible = showMinMax;
    minMaxGroup.position.set(0, 0, 0);
    scene.add(minMaxGroup);
    
    // Selected Point Marker
    const selectedMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/80, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 }));
    selectedMarker.visible = false;
    scene.add(selectedMarker);
    
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      
      refPlane.position.y = nominalThickness * zScale;
      refPlane.visible = showReference;

      if(minPoint && minMarker){ minMarker.position.set(minPoint.x, minPoint.thickness * zScale, minPoint.y); }
      if(maxPoint && maxMarker){ maxMarker.position.set(maxPoint.x, maxPoint.thickness * zScale, maxPoint.y); }
      minMaxGroup.visible = showMinMax;

      if (selectedPoint) {
          const pointData = dataMapRef.current.get(`${selectedPoint.x},${selectedPoint.y}`);
          if (pointData) {
              const thickness = pointData.thickness ?? nominalThickness;
              selectedMarker.position.set(selectedPoint.x, thickness * zScale, selectedPoint.y);
              selectedMarker.visible = true;
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
    let minMarker: any, maxMarker: any; // define these to satisfy the compiler

    const onMouseMove = (event: MouseEvent) => {
        if (!mountRef.current) return;
        const rect = mountRef.current.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(meshRef.current!);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const worldPoint = intersect.point;
            
            const gridX = Math.round(worldPoint.x);
            const gridY = Math.round(worldPoint.z);
            
            const pointData = dataMapRef.current.get(`${gridX},${gridY}`);

            if (pointData) {
                 setHoveredPoint({ ...pointData, clientX: event.clientX, clientY: event.clientY });
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
        cameraRef.current.position.set(gridSize.width * 0.9, gridSize.height * 1.2, gridSize.width * 1.4);
        controlsRef.current.target.set(gridSize.width / 2, 0, gridSize.height / 2);
        controlsRef.current.update();
    }
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
        {stats && nominalThickness && (
          <ColorLegend mode={colorMode} stats={stats} nominalThickness={nominalThickness} />
        )}
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
            <div>Thickness: {hoveredPoint.thickness?.toFixed(2) ?? 'ND'} mm</div>
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
                    <Label htmlFor="mm" className="flex items-center gap-2 font-normal"><Ruler className="h-4 w-4"/> Absolute (mm)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="%" id="%" />
                    <Label htmlFor="%" className="flex items-center gap-2 font-normal"><Percent className="h-4 w-4"/>Normalized (%)</Label>
                  </div>
                </RadioGroup>
            </div>
            <div className="space-y-3">
              <Label>Z-Axis Scale: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={0.1} max={25} step={0.1} />
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
