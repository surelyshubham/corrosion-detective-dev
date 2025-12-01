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

export function ThreeDeeViewTab() {
  const { inspectionResult, selectedPoint } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(1)
  const [showReference, setShowReference] = useState(true)
  const [showMinMax, setShowMinMax] = useState(true)
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)

  useEffect(() => {
    if (!mountRef.current || !inspectionResult) return

    const { processedData, stats, nominalThickness } = inspectionResult
    const { gridSize, minThickness, maxThickness } = stats
    
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
    camera.position.set(gridSize.width / 2, gridSize.height, gridSize.width / 2)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(gridSize.width / 2, 0, gridSize.height / 2)
    controls.update()
    controlsRef.current = controls

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 50, 50)
    scene.add(directionalLight)
    
    // Main Asset Geometry
    const geometry = new THREE.PlaneGeometry(gridSize.width, gridSize.height, gridSize.width - 1, gridSize.height - 1)
    const dataMap = new Map(processedData.map(p => [`${p.x},${p.y}`, p]))
    
    const positions = geometry.attributes.position;
    const colors = [];

    for (let i = 0; i < positions.count; i++) {
        const x = Math.round(positions.getX(i) + gridSize.width / 2)
        const y = Math.round(positions.getY(i) + gridSize.height / 2)
        const point = dataMap.get(`${x},${y}`)
        const thickness = point?.thickness ?? nominalThickness
        const z = (thickness - nominalThickness) * zScale;
        positions.setZ(i, z);

        const color = new THREE.Color();
        const percentage = point?.percentage ?? 100;
        if(percentage > 70) color.set('#3b82f6');
        else if(percentage > 60) color.set('#14b8a6');
        else if(percentage > 50) color.set('#22c55e');
        else if(percentage > 40) color.set('#eab308');
        else color.set('#ef4444');
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: false })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    scene.add(mesh)
    
    // Reference Plane
    const refPlaneGeom = new THREE.PlaneGeometry(gridSize.width, gridSize.height);
    const refPlaneMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const refPlane = new THREE.Mesh(refPlaneGeom, refPlaneMat);
    refPlane.rotation.x = -Math.PI / 2;
    refPlane.visible = showReference;
    scene.add(refPlane);

    // Min/Max Markers
    const minMaxGroup = new THREE.Group();
    const minPoint = processedData.find(p => p.thickness === minThickness)
    if(minPoint){
        const minMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000}));
        minMarker.position.set(minPoint.x, (minPoint.thickness - nominalThickness) * zScale, minPoint.y);
        minMaxGroup.add(minMarker);
    }
    const maxPoint = processedData.find(p => p.thickness === maxThickness)
    if(maxPoint){
        const maxMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({color: 0x0000ff}));
        maxMarker.position.set(maxPoint.x, (maxPoint.thickness - nominalThickness) * zScale, maxPoint.y);
        minMaxGroup.add(maxMarker);
    }
    minMaxGroup.visible = showMinMax;
    scene.add(minMaxGroup);
    
    // Selected Point Marker
    const selectedMarker = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 }));
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
              selectedMarker.position.set(selectedPoint.x, (thickness - nominalThickness) * zScale, selectedPoint.y);
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

    return () => {
      window.removeEventListener('resize', handleResize)
      if (mountRef.current) {
        mountRef.current.innerHTML = ''
      }
    }
  }, [inspectionResult, zScale, showReference, showMinMax, selectedPoint])
  
  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && inspectionResult) {
        const { gridSize } = inspectionResult.stats;
        cameraRef.current.position.set(gridSize.width / 2, gridSize.height, gridSize.width / 2);
        controlsRef.current.target.set(gridSize.width / 2, 0, gridSize.height / 2);
        controlsRef.current.update();
    }
  }

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="font-headline">3D Heightmap View</CardTitle>
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
            <div className="space-y-3">
              <Label>Z-Axis Scale: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={0.1} max={5} step={0.1} />
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
