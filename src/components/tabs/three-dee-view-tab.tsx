
"use client"

import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Camera, Expand, Minimize, Pin, Redo, RefreshCw } from 'lucide-react'

// Red        = 0–20%
// Orange     = 21–40%
// Yellow     = 41–60%
// LightGreen = 61–80%
// DarkGreen  = 81–100%
const getColor = (percentage: number | null) => {
    if (percentage === null) return new THREE.Color(0x888888) // Grey for ND
    if (percentage <= 20) return new THREE.Color(0xff0000) // Red
    if (percentage <= 40) return new THREE.Color(0xffa500) // Orange
    if (percentage <= 60) return new THREE.Color(0xffff00) // Yellow
    if (percentage <= 80) return new THREE.Color(0x90ee90) // LightGreen
    return new THREE.Color(0x006400) // DarkGreen
};


export function ThreeDeeViewTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(5) // Increased default scale
  const [showReference, setShowReference] = useState(true)
  const [showMinMax, setShowMinMax] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const dataMapRef = useRef(new Map());

  useEffect(() => {
    if (!mountRef.current || !inspectionResult) return

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
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000)
    camera.position.set(gridSize.width / 2, gridSize.height * 0.75, gridSize.width * 1.2)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(gridSize.width / 2, 0, gridSize.height / 2)
    controls.update()
    controlsRef.current = controls

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(100, 100, 100)
    scene.add(directionalLight)
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight2.position.set(-100, 100, -100)
    scene.add(directionalLight2)
    
    // Main Asset Geometry
    const boxDepth = nominalThickness * 2; // Give it some visual thickness
    const geometry = new THREE.BoxGeometry(gridSize.width, boxDepth, gridSize.height, gridSize.width - 1, 1, gridSize.height - 1);
    const dataMap = dataMapRef.current;
    
    const positions = geometry.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
        const x = Math.round(positions.getX(i) + gridSize.width / 2)
        const z_plane = Math.round(positions.getZ(i) + gridSize.height / 2)
        const point = dataMap.get(`${x},${z_plane}`)
        
        let color: THREE.Color;

        // We only want to modify the top surface of the box
        if (positions.getY(i) > 0) {
            const thickness = point?.thickness ?? nominalThickness
            const percentage = point?.percentage ?? 100

            // The "top" of our box is at y = boxDepth / 2.
            // We adjust this based on deviation from nominal.
            // Wall loss (thickness < nominal) should go down.
            const y_pos = (boxDepth / 2) + ((thickness - nominalThickness) * zScale);
            positions.setY(i, y_pos);
            color = getColor(percentage);
        } else {
            // Color for sides and bottom
            color = getColor(100); // Assume healthy for other faces
        }
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: false })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(gridSize.width / 2, 0, gridSize.height / 2)
    scene.add(mesh)
    meshRef.current = mesh;
    
    // Wireframe for the mesh
    const wireframeGeom = new THREE.WireframeGeometry(geometry);
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1, transparent: true, opacity: 0.2 });
    const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat);
    wireframe.position.set(gridSize.width / 2, 0, gridSize.height / 2);
    scene.add(wireframe);

    // Reference Plane (at nominal thickness level)
    const refPlaneGeom = new THREE.PlaneGeometry(gridSize.width * 1.1, gridSize.height * 1.1);
    const refPlaneMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const refPlane = new THREE.Mesh(refPlaneGeom, refPlaneMat);
    refPlane.rotation.x = -Math.PI / 2;
    refPlane.position.set(gridSize.width / 2, boxDepth/2, gridSize.height / 2); // Position at nominal height
    refPlane.visible = showReference;
    scene.add(refPlane);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(Math.max(gridSize.width, gridSize.height), 10);
    gridHelper.position.set(gridSize.width / 2, -boxDepth/2, gridSize.height / 2)
    scene.add(gridHelper);

    // Axes Helper
    const axesHelper = new THREE.AxesHelper(Math.max(gridSize.width, gridSize.height) * 0.2);
    axesHelper.position.set(0, -boxDepth/2 + 0.1, 0); // Slightly above the grid
    scene.add(axesHelper);


    // Min/Max Markers
    const minMaxGroup = new THREE.Group();
    const minPoint = processedData.find(p => p.thickness === minThickness)
    if(minPoint){
        const minMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/100, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000}));
        const y_pos = (boxDepth/2) + (minPoint.thickness - nominalThickness) * zScale;
        minMarker.position.set(minPoint.x, y_pos, minPoint.y);
        minMaxGroup.add(minMarker);
    }
    const maxPoint = processedData.find(p => p.thickness === maxThickness)
    if(maxPoint){
        const maxMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/100, 16, 16), new THREE.MeshBasicMaterial({color: 0x0000ff}));
        const y_pos = (boxDepth/2) + (maxPoint.thickness - nominalThickness) * zScale;
        maxMarker.position.set(maxPoint.x, y_pos, maxPoint.y);
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
      
      // Update selected marker position
      if (selectedPoint) {
          const pointData = dataMap.get(`${selectedPoint.x},${selectedPoint.y}`);
          if (pointData) {
              const thickness = pointData.thickness ?? nominalThickness;
              const y_pos = (boxDepth/2) + (thickness - nominalThickness) * zScale;
              selectedMarker.position.set(selectedPoint.x, y_pos, selectedPoint.y);
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

    // Hover logic
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
        if (!mountRef.current) return;
        const rect = mountRef.current.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(meshRef.current!);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const face = intersect.face;
            if (!face) {
                setHoveredPoint(null);
                return;
            }
            
            // Get coordinates from the intersection point on the mesh
            const worldPoint = intersect.point;
            meshRef.current?.worldToLocal(worldPoint);
            
            const gridX = Math.round(worldPoint.x + gridSize.width / 2);
            const gridY = Math.round(worldPoint.z + gridSize.height / 2);
            
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
  }, [inspectionResult, zScale, showReference, showMinMax, selectedPoint, setSelectedPoint])
  
  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && inspectionResult) {
        const { gridSize } = inspectionResult.stats;
        cameraRef.current.position.set(gridSize.width / 2, gridSize.height * 0.75, gridSize.width * 1.2);
        controlsRef.current.target.set(gridSize.width / 2, 0, gridSize.height / 2);
        controlsRef.current.update();
    }
  }

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="font-headline">3D Heightmap View</CardTitle>
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
