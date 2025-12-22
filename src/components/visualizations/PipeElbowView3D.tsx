
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
import { RefreshCw, Loader2 } from 'lucide-react';
import { PlatePercentLegend } from './PlatePercentLegend';

export type PipeElbowView3DRef = {
  capture: () => Promise<string>;
  focus: (x: number, y: number, zoomIn: boolean, boxSize: number) => Promise<void>;
  resetCamera: () => Promise<void>;
  setView: (view: 'iso' | 'top' | 'side') => Promise<void>;
};

interface PipeElbowView3DProps {}

const getAbsColor = (percentage: number | null, isND: boolean): THREE.Color => {
    const c = new THREE.Color();
    if (isND) { c.set(0x888888); return c; }
    if (percentage === null) c.set(0x444444);
    else if (percentage < 70) c.set(0xff0000);
    else if (percentage < 80) c.set(0xffff00);
    else if (percentage < 90) c.set(0x00ff00);
    else c.set(0x0000ff);
    return c;
}

export const PipeElbowView3D = forwardRef<PipeElbowView3DRef, PipeElbowView3DProps>((props, ref) => {
  const { inspectionResult, dataVersion } = useInspectionStore();
  const mountRef = useRef<HTMLDivElement>(null);
  
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.gridMatrix &&
                  !!inspectionResult?.pipeOuterDiameter && !!inspectionResult?.pipeLength &&
                  !!inspectionResult?.elbowStartLength && !!inspectionResult?.elbowAngle && !!inspectionResult?.elbowRadiusType;

  const [zScale, setZScale] = useState(15);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pipeGroupRef = useRef<THREE.Group | null>(null);
  const reqRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const { nominalThickness, pipeOuterDiameter, pipeLength, elbowStartLength, elbowAngle, elbowRadiusType } = inspectionResult || {};
  const stats = DataVault.stats;
  const gridMatrix = DataVault.gridMatrix;

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    reqRef.current = requestAnimationFrame(animate);
    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  const setView = useCallback(async (view: 'iso' | 'top' | 'side') => {
    if (!cameraRef.current || !controlsRef.current || !pipeLength) return;
    const distance = pipeLength * 1.5;
    controlsRef.current.target.set(0, 0, 0);
    switch (view) {
        case 'top': cameraRef.current.position.set(0, distance, 0); break;
        case 'side': cameraRef.current.position.set(distance, 0, 0); break;
        case 'iso': default: cameraRef.current.position.set(distance * 0.7, distance * 0.5, distance * 0.7); break;
    }
    controlsRef.current.update();
  }, [pipeLength]);

  const resetCamera = useCallback(async () => { setView('iso'); }, [setView]);

  useImperativeHandle(ref, () => ({
    capture: async () => rendererRef.current?.domElement.toDataURL() || '',
    focus: async (x: number, y: number, zoomIn: boolean, boxSize: number) => { /* Focus logic TBD for elbow */ },
    resetCamera: resetCamera,
    setView: setView,
  }));
  
  useEffect(() => {
    if (!isReady || !mountRef.current || !stats || !nominalThickness || !pipeOuterDiameter || !pipeLength || !elbowStartLength || !elbowAngle || !elbowRadiusType) return;
    
    const currentMount = mountRef.current;
    
    sceneRef.current = new THREE.Scene();
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100000);
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.innerHTML = '';
    currentMount.appendChild(rendererRef.current.domElement);
    
    sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(pipeLength, pipeLength, pipeLength);
    sceneRef.current.add(dirLight);

    pipeGroupRef.current = new THREE.Group();
    sceneRef.current.add(pipeGroupRef.current);
    
    const { width: gridW, height: gridH } = stats.gridSize;
    const pipeRadius = pipeOuterDiameter / 2;
    const totalDataLength = gridH; 

    const bendRadius = (elbowRadiusType === 'Short' ? 1.0 : 1.5) * pipeOuterDiameter;
    const bendAngleRad = THREE.MathUtils.degToRad(elbowAngle);
    const bendArcLength = bendRadius * bendAngleRad;

    const dataLengthPerUnit = gridH / pipeLength;
    const elbowStartDataIndex = Math.floor(elbowStartLength * dataLengthPerUnit);
    const elbowArcDataLength = Math.floor(bendArcLength * dataLengthPerUnit);
    
    // --- Section 1: Straight Pipe ---
    const len1 = elbowStartLength;
    const geom1 = new THREE.CylinderGeometry(pipeRadius, pipeRadius, len1, gridW, elbowStartDataIndex, true);
    geom1.translate(0, len1 / 2, 0); // Position it to start at origin
    
    // --- Section 2: Elbow ---
    const geom2 = new THREE.TorusGeometry(bendRadius, pipeRadius, gridW, elbowArcDataLength, bendAngleRad);
    // Position and rotate the torus to connect to the first pipe
    const bendGroup = new THREE.Group();
    bendGroup.add(new THREE.Mesh(geom2));
    bendGroup.position.set(bendRadius, len1, 0);
    bendGroup.rotation.y = Math.PI / 2;
    
    // --- Section 3: Straight Pipe ---
    const len3 = pipeLength - len1 - bendArcLength;
    if (len3 > 0) {
      const geom3 = new THREE.CylinderGeometry(pipeRadius, pipeRadius, len3, gridW, gridH - elbowStartDataIndex - elbowArcDataLength, true);
      const endPointOfBend = new THREE.Vector3(bendRadius * Math.cos(bendAngleRad), len1 + bendRadius * Math.sin(bendAngleRad), 0);
      geom3.translate(0, len3 / 2, 0);
      const mesh3 = new THREE.Mesh(geom3);
      mesh3.position.set(endPointOfBend.x, endPointOfBend.y, 0);
      mesh3.rotation.z = -bendAngleRad;
      pipeGroupRef.current.add(mesh3);
    }
    
    // Combine and color (simplified for now)
    const mesh1 = new THREE.Mesh(geom1);
    pipeGroupRef.current.add(mesh1);
    pipeGroupRef.current.add(bendGroup);
    
    const allMeshes: THREE.Mesh[] = pipeGroupRef.current.children.flatMap(child => child instanceof THREE.Group ? child.children : child) as THREE.Mesh[];

    allMeshes.forEach(mesh => {
        const geom = mesh.geometry;
        const positions = geom.attributes.position;
        const colors: number[] = [];
        for (let i = 0; i < positions.count; i++) {
            const u = geom.attributes.uv.getX(i);
            const v = 1.0 - geom.attributes.uv.getY(i);
            
            // This mapping is simplified and needs to be continuous across sections
            const gridX = Math.floor(u * (gridW - 1));
            const gridY = Math.floor(v * (gridH - 1)); 

            const cell = gridMatrix[gridY]?.[gridX];
            const isND = !cell || cell.isND;
            const color = getAbsColor(cell?.percentage ?? null, isND);
            colors.push(color.r, color.g, color.b);
        }
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geom.computeVertexNormals();
        mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    });

    const handleResize = () => {
      if (rendererRef.current && cameraRef.current && currentMount) {
        cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    resetCamera();
    animate();

    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener('resize', handleResize);
      rendererRef.current?.dispose();
    };
  }, [isReady, nominalThickness, pipeOuterDiameter, pipeLength, elbowStartLength, elbowAngle, elbowRadiusType, animate, resetCamera, stats, zScale, gridMatrix]);

  if (!isReady) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /> Loading...</div>;

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col border">
          <CardHeader><CardTitle className="font-headline">3D Pipe Elbow View</CardTitle></CardHeader>
          <CardContent className="flex-grow p-0 relative">
            <div ref={mountRef} className="w-full h-full" />
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-1 space-y-4">
        <Card>
           <CardHeader><CardTitle className="text-lg font-headline">Controls</CardTitle></CardHeader>
          <CardContent className="space-y-6">
             <div className="space-y-3">
              <Label>Depth Exaggeration: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={1} max={50} step={0.5} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg font-headline">Camera</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={resetCamera} className="col-span-2"><RefreshCw className="mr-2 h-4 w-4" /> Reset View</Button>
            <Button variant="outline" onClick={() => setView('top')}>Top</Button>
            <Button variant="outline" onClick={() => setView('side')}>Side</Button>
            <Button variant="outline" onClick={() => setView('iso')}>Isometric</Button>
          </CardContent>
        </Card>
        <PlatePercentLegend />
      </div>
    </div>
  )
});
PipeElbowView3D.displayName = "PipeElbowView3D";
