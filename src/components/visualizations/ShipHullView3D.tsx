
"use client"

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useInspectionStore } from '@/store/use-inspection-store';
import { DataVault } from '@/store/data-vault';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatePercentLegend } from './PlatePercentLegend';
import type { ShipHullView3DRef as ShipHullView3DRefType } from '../tabs/three-dee-view-tab';

export type ShipHullView3DRef = ShipHullView3DRefType;

type HullPattern = 
    | 'GenericDisplacementHull' | 'FullBodiedTankerHull' | 'ContainerShipHull' 
    | 'BulkCarrierHull' | 'DoubleHullPattern' | 'FlatBottomHull' 
    | 'ShallowVHull' | 'DeepVHull' | 'BulbousBowInfluenceHull' | 'SymmetricEngineeringHull';

const HULL_PATTERNS: { value: HullPattern, label: string }[] = [
    { value: 'GenericDisplacementHull', label: 'Generic Displacement Hull' },
    { value: 'FullBodiedTankerHull', label: 'Full-Bodied Tanker Hull' },
    { value: 'ContainerShipHull', label: 'Container Ship Hull' },
    { value: 'BulkCarrierHull', label: 'Bulk Carrier Hull' },
    { value: 'DoubleHullPattern', label: 'Double Hull Pattern' },
    { value: 'FlatBottomHull', label: 'Flat Bottom Hull' },
    { value: 'ShallowVHull', label: 'Shallow V Hull' },
    { value: 'DeepVHull', label: 'Deep V Hull' },
    { value: 'BulbousBowInfluenceHull', label: 'Bulbous-Bow Influence Hull' },
    { value: 'SymmetricEngineeringHull', label: 'Symmetric Engineering Hull' },
];

// --- Deformation Functions ---
const deformationFns: Record<HullPattern, (u: number, v: number, width: number, height: number) => {x: number, y: number, z: number}> = {
    GenericDisplacementHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.1 * w * Math.pow(Math.cos(u * Math.PI), 2); return {x, y, z}; },
    FullBodiedTankerHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.15 * w * (1 - Math.pow(Math.abs(u-0.5)*2, 4)); return {x, y, z}; },
    ContainerShipHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = u > 0.1 && u < 0.9 ? -0.15 * w : -0.05 * w * Math.cos((u-0.1)*Math.PI/0.8); return {x, y, z}; },
    BulkCarrierHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.18 * w * (1 - Math.pow(Math.abs(u-0.5)*2, 3)); return {x, y, z}; },
    DoubleHullPattern: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.1 * w * Math.pow(Math.cos(u * Math.PI), 2) - (u > 0.2 && u < 0.8 ? 0.05 * w : 0); return {x, y, z}; },
    FlatBottomHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = u < 0.1 || u > 0.9 ? -0.05 * w * (1 - Math.cos((u < 0.1 ? u : 1-u)*Math.PI/0.1)) : -0.1*w; return {x, y, z}; },
    ShallowVHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.15 * w * Math.abs(u - 0.5); return {x, y, z}; },
    DeepVHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.3 * w * Math.abs(u - 0.5); return {x, y, z}; },
    BulbousBowInfluenceHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const bulb = v < 0.2 ? -0.1*w * Math.sin(v*Math.PI/0.2) : 0; const y = -0.1 * w * Math.pow(Math.cos(u * Math.PI), 2) + bulb; return {x, y, z}; },
    SymmetricEngineeringHull: (u, v, w, h) => { const x = (u - 0.5) * w; const z = v * h; const y = -0.15 * w * Math.sin(u * Math.PI); return {x, y, z}; },
};


export const ShipHullView3D = React.forwardRef<ShipHullView3DRef, {}>((props, ref) => {
    const { inspectionResult, dataVersion } = useInspectionStore();
    const mountRef = useRef<HTMLDivElement>(null);
    const isReady = dataVersion > 0 && !!DataVault.stats && !!DataVault.gridMatrix;
    
    const [depthExaggeration, setDepthExaggeration] = useState(10);
    const [hullPattern, setHullPattern] = useState<HullPattern>('GenericDisplacementHull');
    const [hoveredPoint, setHoveredPoint] = useState<any>(null);

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const hullMeshRef = useRef<THREE.Mesh | null>(null);
    const reqRef = useRef<number>(0);
    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());

    const { nominalThickness } = inspectionResult || {};
    const stats = DataVault.stats;
    const gridMatrix = DataVault.gridMatrix;

    const animate = useCallback(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;
        reqRef.current = requestAnimationFrame(animate);
        controlsRef.current.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
    }, []);

    const setView = useCallback((view: 'iso' | 'top' | 'side') => {
        if (!cameraRef.current || !controlsRef.current || !stats) return;
        const { width, height } = stats.gridSize;
        const target = new THREE.Vector3(0, 0, height/2);
        const dist = Math.max(width, height) * 1.5;
        switch (view) {
            case 'top': cameraRef.current.position.set(0, dist, height/2); break;
            case 'side': cameraRef.current.position.set(dist, 0, height/2); break;
            case 'iso': default: cameraRef.current.position.set(dist*0.7, dist*0.5, dist*0.7); break;
        }
        controlsRef.current.target.copy(target);
        controlsRef.current.update();
    }, [stats]);

    const resetCamera = useCallback(() => setView('iso'), [setView]);

    React.useImperativeHandle(ref, () => ({
        capture: async () => rendererRef.current?.domElement.toDataURL() || '',
        focus: async (x, y, zoomIn) => {},
        resetCamera,
        setView,
    }));

    useEffect(() => {
        if (!isReady || !mountRef.current || !stats || !nominalThickness || !gridMatrix) return;
        
        const currentMount = mountRef.current;
        sceneRef.current = new THREE.Scene();
        rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 10000);
        controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
        rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.innerHTML = '';
        currentMount.appendChild(rendererRef.current.domElement);
        sceneRef.current.add(new THREE.AmbientLight(0xffffff, 1.0));
        sceneRef.current.add(new THREE.DirectionalLight(0xffffff, 1.5));

        const createHull = (pattern: HullPattern) => {
            if (hullMeshRef.current) sceneRef.current?.remove(hullMeshRef.current);
            
            const gridW = stats.gridSize.width, gridH = stats.gridSize.height;
            const geom = new THREE.PlaneGeometry(gridW, gridH, Math.min(gridW - 1, 200), Math.min(gridH - 1, 200));
            const positions = geom.attributes.position;
            const colors: number[] = [];
            const deformationFn = deformationFns[pattern];

            for (let i = 0; i < positions.count; i++) {
                const u = (positions.getX(i) + gridW / 2) / gridW; // 0-1
                const v = (positions.getY(i) + gridH / 2) / gridH; // 0-1
                const gridX = Math.floor(u * (gridW-1));
                const gridY = Math.floor(v * (gridH-1));

                const cell = gridMatrix[gridY]?.[gridX];
                const isND = !cell || cell.isND;
                const percentage = cell?.percentage ?? null;

                const color = new THREE.Color();
                if (isND) color.set(0x888888);
                else if (percentage === null) color.set(0x444444);
                else if (percentage < 70) color.set(0xff0000);
                else if (percentage < 80) color.set(0xffff00);
                else if (percentage < 90) color.set(0x00ff00);
                else color.set(0x0000ff);
                colors.push(color.r, color.g, color.b);

                const basePos = deformationFn(u, v, gridW, gridH);
                const wallLoss = (cell && !isND && cell.effectiveThickness !== null) ? nominalThickness - cell.effectiveThickness : 0;
                const depthOffset = wallLoss * depthExaggeration;

                positions.setXYZ(i, basePos.x, basePos.y - depthOffset, basePos.z);
            }

            geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            positions.needsUpdate = true;
            geom.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
            hullMeshRef.current = new THREE.Mesh(geom, mat);
            sceneRef.current?.add(hullMeshRef.current);
        };
        
        createHull(hullPattern);
        
        const handleResize = () => {
            if (!rendererRef.current || !cameraRef.current || !currentMount) return;
            cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };

        const onMouseMove = (event: MouseEvent) => {
            if (!rendererRef.current || !cameraRef.current || !hullMeshRef.current || !gridMatrix) return;
            const rect = rendererRef.current.domElement.getBoundingClientRect();
            mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
            raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
            const intersects = raycasterRef.current.intersectObject(hullMeshRef.current);
    
            if (intersects.length > 0 && intersects[0].uv) {
                const uv = intersects[0].uv;
                const gridX = Math.floor(uv.x * (stats.gridSize.width - 1));
                const gridY = Math.floor(uv.y * (stats.gridSize.height - 1));
                const cell = gridMatrix[gridY]?.[gridX];
                
                if (cell) {
                    setHoveredPoint({
                        x: gridX, y: gridY, rawThickness: cell.rawThickness, effectiveThickness: cell.effectiveThickness, percentage: cell.percentage, plateId: cell.plateId, clientX: event.clientX, clientY: event.clientY,
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
            if(currentMount) {
                currentMount.removeEventListener('mousemove', onMouseMove);
                currentMount.removeEventListener('mouseleave', () => setHoveredPoint(null));
            }
            if (hullMeshRef.current) sceneRef.current?.remove(hullMeshRef.current);
            rendererRef.current?.dispose();
        };
    }, [isReady, stats, nominalThickness, gridMatrix, animate, resetCamera, hullPattern, depthExaggeration]);

    if (!isReady) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="grid md:grid-cols-4 gap-6 h-full">
            <div className="md:col-span-3 h-full relative">
                <Card className="h-full flex flex-col border">
                    <CardHeader><CardTitle className="font-headline">3D Ship Hull View</CardTitle></CardHeader>
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
                    <CardHeader><CardTitle className="text-lg font-headline">Controls</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                            <Label>Hull Pattern</Label>
                             <Select onValueChange={(v) => setHullPattern(v as HullPattern)} defaultValue={hullPattern}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {HULL_PATTERNS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-3">
                            <Label>Depth Exaggeration: {depthExaggeration.toFixed(1)}x</Label>
                            <Slider value={[depthExaggeration]} onValueChange={([val]) => setDepthExaggeration(val)} min={1} max={50} step={0.5} />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-lg font-headline">Camera</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={resetCamera} className="col-span-2"><RefreshCw className="mr-2" /> Reset</Button>
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
    );
});
ShipHullView3D.displayName = "ShipHullView3D";

