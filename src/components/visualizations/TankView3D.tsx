
"use client"

import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useInspectionStore } from '@/store/use-inspection-store';
import { DataVault } from '@/store/data-vault';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, LocateFixed, Pin, Loader2 } from 'lucide-react';
import { PlatePercentLegend } from './PlatePercentLegend';

export type TankView3DRef = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface TankView3DProps {}

const getAbsColor = (percentage: number | null, isND: boolean): THREE.Color => {
    const c = new THREE.Color();
    if (isND) {
      c.set(0x888888); 
      return c;
    }
    if (percentage === null) c.set(0x444444);
    else if (percentage < 70) c.set(0xff0000);
    else if (percentage < 80) c.set(0xffff00);
    else if (percentage < 90) c.set(0x00ff00);
    else c.set(0x0000ff);
    return c;
}

export const TankView3D = React.forwardRef<TankView3DRef, TankView3DProps>((props, ref) => {
  const { inspectionResult, dataVersion } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.gridMatrix && !!inspectionResult?.pipeOuterDiameter && !!inspectionResult?.pipeLength;
  
  const [zScale, setZScale] = useState(15);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const capsRef = useRef<THREE.Group | null>(null);
  const reqRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const { nominalThickness, pipeOuterDiameter, pipeLength } = inspectionResult || {};
  const stats = DataVault.stats;
  const gridMatrix = DataVault.gridMatrix;

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    reqRef.current = requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  const setView = useCallback((view: 'iso' | 'top' | 'side') => {
    if (cameraRef.current && controlsRef.current && pipeOuterDiameter && pipeLength) {
        controlsRef.current.target.set(0, 0, 0);
        const distance = Math.max(pipeOuterDiameter, pipeLength) * 1.5;
        switch (view) {
            case 'top':
                cameraRef.current.position.set(0, distance * 1.001, 0);
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
    if (!isReady || !mountRef.current || !stats || !pipeOuterDiameter || !pipeLength || !nominalThickness || !gridMatrix) return;
    
    const currentMount = mountRef.current;
    
    sceneRef.current = new THREE.Scene();
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 5000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(pipeOuterDiameter, pipeLength * 2, pipeOuterDiameter);
    sceneRef.current.add(dirLight);

    const { width, height } = stats.gridSize;
    const geometry = new THREE.CylinderGeometry(pipeOuterDiameter / 2, pipeOuterDiameter / 2, pipeLength, width > 1 ? width - 1 : 64, height > 1 ? height - 1 : 1, true);
    
    const colors: number[] = [];
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
        const u = geometry.attributes.uv.getX(i);
        const v = 1.0 - geometry.attributes.uv.getY(i);
        
        const gridX = Math.floor(u * (width - 1));
        const gridY = Math.floor(v * (height - 1));
        
        const cell = gridMatrix?.[gridY]?.[gridX];
        const isND = !cell || cell.isND;
        const color = getAbsColor(cell?.percentage ?? null, isND);
        colors.push(color.r, color.g, color.b);

        const wallLoss = (cell && !isND && cell.effectiveThickness !== null) ? nominalThickness - cell.effectiveThickness : 0;
        const radialDisplacement = -wallLoss * zScale;
        const currentRadius = pipeOuterDiameter / 2 + radialDisplacement;
        
        const originalPos = new THREE.Vector3().fromBufferAttribute(positions, i);
        const angle = Math.atan2(originalPos.z, originalPos.x);

        positions.setXYZ(i, currentRadius * Math.cos(angle), originalPos.y, currentRadius * Math.sin(angle));
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    meshRef.current = new THREE.Mesh(geometry, mat);
    sceneRef.current.add(meshRef.current);

    capsRef.current = new THREE.Group();
    const capGeo = new THREE.CircleGeometry(pipeOuterDiameter / 2, 64);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = pipeLength / 2 + 0.01;
    topCap.rotation.x = Math.PI / 2;
    capsRef.current.add(topCap);
    const bottomCap = new THREE.Mesh(capGeo, capMat);
    bottomCap.position.y = -pipeLength / 2 - 0.01;
    bottomCap.rotation.x = -Math.PI / 2;
    capsRef.current.add(bottomCap);
    sceneRef.current.add(capsRef.current);

    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!rendererRef.current || !cameraRef.current || !meshRef.current || !gridMatrix) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const intersects = raycasterRef.current.intersectObject(meshRef.current);

        if (intersects.length > 0 && intersects[0].uv) {
            const uv = intersects[0].uv;
            const gridX = Math.floor(uv.x * (width - 1));
            const gridY = Math.floor((1 - uv.y) * (height - 1));
            const cell = gridMatrix[gridY]?.[gridX];
            
            if (cell) {
                setHoveredPoint({
                    x: gridX,
                    y: gridY,
                    rawThickness: cell.rawThickness,
                    effectiveThickness: cell.effectiveThickness,
                    percentage: cell.percentage,
                    plateId: cell.plateId,
                    clientX: event.clientX,
                    clientY: event.clientY,
                });
            } else {
                setHoveredPoint(null);
            }
        } else {
            setHoveredPoint(null);
        }
    };
    
    currentMount.addEventListener('mousemove', onMouseMove);
    currentMount.addEventListener('mouseleave', () => setHoveredPoint(null));
    window.addEventListener('resize', handleResize);
    
    resetCamera();
    animate();

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener('resize', handleResize);
       if (currentMount) {
        currentMount.removeEventListener('mousemove', onMouseMove);
        currentMount.removeEventListener('mouseleave', () => setHoveredPoint(null));
      }
      sceneRef.current?.remove(meshRef.current!);
      sceneRef.current?.remove(capsRef.current!);
      meshRef.current?.geometry.dispose();
      (meshRef.current?.material as THREE.Material)?.dispose();
      capsRef.current?.children.forEach(c => {
        (c as THREE.Mesh).geometry.dispose();
        ((c as THREE.Mesh).material as THREE.Material).dispose();
      });
      rendererRef.current?.dispose();
    };
  }, [isReady, pipeOuterDiameter, pipeLength, nominalThickness, animate, resetCamera, stats, zScale, gridMatrix]);
  
  if (!isReady) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

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
        <Card>
          <CardHeader><CardTitle className="text-lg font-headline">Legend</CardTitle></CardHeader>
          <CardContent><PlatePercentLegend /></CardContent>
        </Card>
      </div>
    </div>
  )
});
TankView3D.displayName = "TankView3D";

    

    