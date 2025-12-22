
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

// Centerline Path Class
class PipePath {
    private segments: { type: 'line' | 'arc', length: number, startPoint: THREE.Vector3, endPoint: THREE.Vector3, direction?: THREE.Vector3, arcCenter?: THREE.Vector3, arcRadius?: number, arcAngle?: number }[] = [];
    public totalLength: number = 0;

    constructor(startLength: number, bendRadius: number, bendAngleRad: number, endLength: number) {
        // Segment 1: Initial Straight Pipe
        const seg1Start = new THREE.Vector3(0, 0, 0);
        const seg1End = new THREE.Vector3(0, startLength, 0);
        this.addSegment('line', startLength, seg1Start, seg1End, new THREE.Vector3(0, 1, 0));

        // Segment 2: Elbow Bend
        const arcCenter = new THREE.Vector3(bendRadius, startLength, 0);
        const arcStart = seg1End;
        const arcEnd = new THREE.Vector3(
            bendRadius * (1 - Math.cos(bendAngleRad)),
            startLength + bendRadius * Math.sin(bendAngleRad),
            0
        );
        this.addSegment('arc', bendRadius * bendAngleRad, arcStart, arcEnd, undefined, arcCenter, bendRadius, bendAngleRad);

        // Segment 3: Final Straight Pipe
        const seg3Dir = new THREE.Vector3(Math.sin(bendAngleRad), Math.cos(bendAngleRad), 0).normalize();
        const seg3Start = arcEnd;
        const seg3End = seg3Start.clone().add(seg3Dir.clone().multiplyScalar(endLength));
        this.addSegment('line', endLength, seg3Start, seg3End, seg3Dir);
    }

    private addSegment(type: 'line' | 'arc', length: number, startPoint: THREE.Vector3, endPoint: THREE.Vector3, direction?: THREE.Vector3, arcCenter?: THREE.Vector3, arcRadius?: number, arcAngle?: number) {
        this.segments.push({ type, length, startPoint, endPoint, direction, arcCenter, arcRadius, arcAngle });
        this.totalLength += length;
    }

    getPoint(s: number): { point: THREE.Vector3, tangent: THREE.Vector3, normal: THREE.Vector3, binormal: THREE.Vector3 } {
        let accumulatedLength = 0;
        for (const segment of this.segments) {
            if (s <= accumulatedLength + segment.length + 1e-6) {
                const local_s = s - accumulatedLength;
                if (segment.type === 'line') {
                    const point = segment.startPoint.clone().add(segment.direction!.clone().multiplyScalar(local_s));
                    const tangent = segment.direction!.clone();
                    const normal = new THREE.Vector3(1, 0, 0); // Arbitrary normal for vertical pipe
                    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
                    return { point, tangent, normal, binormal };
                } else { // arc
                    const angle = local_s / segment.arcRadius!;
                    const point = new THREE.Vector3(
                        segment.arcCenter!.x - segment.arcRadius! * Math.cos(angle),
                        segment.arcCenter!.y + segment.arcRadius! * Math.sin(angle),
                        segment.arcCenter!.z
                    );
                    const tangent = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0).normalize();
                    const binormal = new THREE.Vector3(0, 0, 1); // For a planar arc in XY
                    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
                    return { point, tangent, normal, binormal };
                }
            }
            accumulatedLength += segment.length;
        }
        // fallback for s > totalLength
        const lastSeg = this.segments[this.segments.length-1];
        return this.getPoint(lastSeg.length + accumulatedLength - 1e-6);
    }
}


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
  const pipeMeshRef = useRef<THREE.Mesh | null>(null);
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
        case 'top': cameraRef.current.position.set(0, pipeLength / 2, distance); break;
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

    const { width: gridW, height: gridH } = stats.gridSize;
    const pipeRadius = pipeOuterDiameter / 2;
    const bendRadius = (elbowRadiusType === 'Short' ? 1.0 : 1.5) * pipeOuterDiameter;
    const bendAngleRad = THREE.MathUtils.degToRad(elbowAngle);
    const bendArcLength = bendRadius * bendAngleRad;
    const endLength = Math.max(0, pipeLength - elbowStartLength - bendArcLength);

    const path = new PipePath(elbowStartLength, bendRadius, bendAngleRad, endLength);
    const totalPathLength = path.totalLength;

    const vertices: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const tubularSegments = Math.min(gridH -1, 200);
    const radialSegments = Math.min(gridW-1, 64);

    for (let j = 0; j <= tubularSegments; j++) {
        const v = j / tubularSegments;
        const s = v * totalPathLength;
        const gridY = Math.floor(v * (gridH-1));

        const { point, tangent, normal, binormal } = path.getPoint(s);

        for (let i = 0; i <= radialSegments; i++) {
            const u = i / radialSegments;
            const theta = u * Math.PI * 2;
            const gridX = Math.floor(u * (gridW-1));
            
            const cell = gridMatrix[gridY]?.[gridX];
            const isND = !cell || cell.isND;
            const wallLoss = (cell && !isND && cell.effectiveThickness !== null) ? nominalThickness - cell.effectiveThickness : 0;
            const currentRadius = pipeRadius - (wallLoss * zScale);
            
            const color = getAbsColor(cell?.percentage ?? null, isND);
            colors.push(color.r, color.g, color.b);

            const dx = Math.cos(theta);
            const dy = Math.sin(theta);

            const vertexNormal = new THREE.Vector3().addVectors(
                normal.clone().multiplyScalar(dx),
                binormal.clone().multiplyScalar(dy)
            ).normalize();
            
            const vertex = new THREE.Vector3().addVectors(
                point,
                vertexNormal.clone().multiplyScalar(currentRadius)
            );
            
            vertices.push(vertex.x, vertex.y, vertex.z);
            normals.push(vertexNormal.x, vertexNormal.y, vertexNormal.z);
        }
    }

    for (let j = 0; j < tubularSegments; j++) {
        for (let i = 0; i < radialSegments; i++) {
            const a = j * (radialSegments + 1) + i;
            const b = a + 1;
            const c = (j + 1) * (radialSegments + 1) + i;
            const d = c + 1;
            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    pipeMeshRef.current = new THREE.Mesh(geometry, material);
    sceneRef.current.add(pipeMeshRef.current);
    

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
      if (pipeMeshRef.current) {
        sceneRef.current?.remove(pipeMeshRef.current);
        pipeMeshRef.current.geometry.dispose();
        (pipeMeshRef.current.material as THREE.Material).dispose();
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
         <Card>
          <CardHeader><CardTitle className="text-lg font-headline">Legend</CardTitle></CardHeader>
          <CardContent><PlatePercentLegend /></CardContent>
        </Card>
      </div>
    </div>
  )
});
PipeElbowView3D.displayName = "PipeElbowView3D";
