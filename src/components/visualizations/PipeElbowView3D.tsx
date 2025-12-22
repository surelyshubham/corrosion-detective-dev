
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
import type { GridCell } from '@/lib/types';


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

const mapDataToVertices = (geom: THREE.BufferGeometry, gridMatrix: GridCell[][], nominalThickness: number, zScale: number, startY: number, endY: number) => {
    const { width: gridW, height: gridH } = DataVault.stats!.gridSize;
    const positions = geom.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
        const u = geom.attributes.uv.getX(i);
        const v = geom.attributes.uv.getY(i);
        
        const gridX = Math.floor(u * (gridW - 1));
        const gridY = Math.floor(startY + v * (endY - startY));

        const cell = gridMatrix[gridY]?.[gridX];
        const isND = !cell || cell.isND;
        const color = getAbsColor(cell?.percentage ?? null, isND);
        colors.push(color.r, color.g, color.b);

        const wallLoss = (cell && !isND && cell.effectiveThickness !== null) ? nominalThickness - cell.effectiveThickness : 0;
        const radialDisplacement = -wallLoss * zScale;

        const originalPos = new THREE.Vector3().fromBufferAttribute(positions, i);
        const normal = new THREE.Vector3().fromBufferAttribute(geom.attributes.normal, i);
        
        originalPos.add(normal.multiplyScalar(radialDisplacement));

        positions.setXYZ(i, originalPos.x, originalPos.y, originalPos.z);
    }
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
};


export const PipeElbowView3D = forwardRef<PipeElbowView3DRef, PipeElbowView3DProps>((props, ref) => {
  const { inspectionResult, dataVersion } = useInspectionStore();
  const mountRef = useRef<HTMLDivElement>(null);
  
  const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.gridMatrix &&
                  !!inspectionResult?.pipeOuterDiameter && !!inspectionResult?.pipeLength &&
                  inspectionResult?.elbowStartLength !== undefined && !!inspectionResult?.elbowAngle && !!inspectionResult?.elbowRadiusType;

  const [zScale, setZScale] = useState(15);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pipeGroupRef = useRef<THREE.Group | null>(null);
  const reqRef = useRef<number>(0);

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
    controlsRef.current.target.set(0, pipeLength / 2, 0); // Center on approx middle of asset
    switch (view) {
        case 'top': cameraRef.current.position.set(0, pipeLength + distance, 0); break;
        case 'side': cameraRef.current.position.set(distance, pipeLength / 2, 0); break;
        case 'iso': default: cameraRef.current.position.set(distance * 0.7, pipeLength * 0.7, distance * 0.7); break;
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
    if (!isReady || !mountRef.current || !stats || !nominalThickness || !pipeOuterDiameter || !pipeLength || elbowStartLength === undefined || !elbowAngle || !elbowRadiusType || !gridMatrix) return;
    
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

    const dataLengthPerUnit = gridH / pipeLength;
    const bendRadius = (elbowRadiusType === 'Short' ? 1.0 : 1.5) * pipeOuterDiameter;
    const bendAngleRad = THREE.MathUtils.degToRad(elbowAngle);
    const bendArcLength = bendRadius * bendAngleRad;

    const dataIndex_sec1_end = Math.floor(elbowStartLength * dataLengthPerUnit);
    const dataIndex_sec2_end = dataIndex_sec1_end + Math.floor(bendArcLength * dataLengthPerUnit);

    // --- Section 1: Straight Pipe ---
    const len1 = elbowStartLength;
    if (len1 > 0) {
      const geom1 = new THREE.CylinderGeometry(pipeRadius, pipeRadius, len1, gridW, dataIndex_sec1_end, true);
      geom1.translate(0, len1 / 2, 0); 
      mapDataToVertices(geom1, gridMatrix, nominalThickness, zScale, 0, dataIndex_sec1_end);
      pipeGroupRef.current.add(new THREE.Mesh(geom1, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
    
    // --- Section 2: Elbow ---
    const len2_data = dataIndex_sec2_end - dataIndex_sec1_end;
    if (len2_data > 0) {
        const geom2 = new THREE.TorusGeometry(bendRadius, pipeRadius, gridW, len2_data, bendAngleRad);
        geom2.rotateY(Math.PI / 2);
        geom2.translate(bendRadius, len1, 0);
        mapDataToVertices(geom2, gridMatrix, nominalThickness, zScale, dataIndex_sec1_end, dataIndex_sec2_end);
        pipeGroupRef.current.add(new THREE.Mesh(geom2, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
    
    // --- Section 3: Straight Pipe ---
    const len3 = pipeLength - len1 - bendArcLength;
    const len3_data = gridH - dataIndex_sec2_end;
    if (len3 > 0 && len3_data > 0) {
      const geom3 = new THREE.CylinderGeometry(pipeRadius, pipeRadius, len3, gridW, len3_data, true);
      
      const endPointOfBend = new THREE.Vector3(
        bendRadius * Math.cos(bendAngleRad),
        len1 + bendRadius * Math.sin(bendAngleRad),
        0
      );

      const directionOfEnd = new THREE.Vector3(
         Math.sin(bendAngleRad),
         Math.cos(bendAngleRad),
         0
      ).normalize();
      
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), directionOfEnd);
      geom3.applyQuaternion(quaternion);

      geom3.translate(
        endPointOfBend.x + directionOfEnd.x * len3 / 2,
        endPointOfBend.y + directionOfEnd.y * len3 / 2,
        endPointOfBend.z + directionOfEnd.z * len3 / 2
      );

      mapDataToVertices(geom3, gridMatrix, nominalThickness, zScale, dataIndex_sec2_end, gridH);
      pipeGroupRef.current.add(new THREE.Mesh(geom3, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }

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
      if (pipeGroupRef.current) {
        pipeGroupRef.current.children.forEach(child => {
            const mesh = child as THREE.Mesh;
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });
        sceneRef.current?.remove(pipeGroupRef.current);
      }
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
