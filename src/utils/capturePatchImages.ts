import * as THREE from 'three';
import { DataVault } from '@/store/data-vault';

async function takeSnapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.render(scene, camera);
    await new Promise(r => setTimeout(r, 80));
    return renderer.domElement.toDataURL("image/png", 1.0);
}

export async function captureAssetPatches(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera, 
    renderer: THREE.WebGLRenderer, 
    assetMesh: THREE.Mesh
) {
    console.log("Starting Robot Capture Sequence...");
    
    // Geometry & Stats
    if (!assetMesh.geometry.boundingBox) assetMesh.geometry.computeBoundingBox();
    const box = assetMesh.geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const isVertical = size.y > size.x && size.y > size.z;
    const mainAxisLength = isVertical ? size.y : size.x;
    const minVal = isVertical ? box.min.y : box.min.x;
    const patchStep = mainAxisLength / 10;

    const originalClipping = assetMesh.material instanceof THREE.Material ? assetMesh.material.clippingPlanes : [];
    const originalPos = camera.position.clone();
    const originalRot = camera.rotation.clone();

    // DataVault Checks for "Non-Inspection" Logic
    const gridMatrix = DataVault.gridMatrix || [];
    const totalRows = gridMatrix.length;
    
    const patches = [];

    for (let i = 0; i < 10; i++) {
        const patchStart = minVal + (i * patchStep);
        const patchEnd = patchStart + patchStep;
        const patchMid = (patchStart + patchEnd) / 2;

        const patchLocation = {
            x: isVertical ? center.x : patchMid,
            y: isVertical ? patchMid : center.y,
            z: center.z
        };

        // --- 1. SMART FILTER: Coverage Analysis ---
        // Calculate which Grid Rows correspond to this patch
        const rowStart = Math.floor((i / 10) * totalRows);
        const rowEnd = Math.floor(((i + 1) / 10) * totalRows);
        
        let validPoints = 0;
        let totalPoints = 0;
        let minThick = 999;

        for (let r = rowStart; r < rowEnd; r++) {
            if (!gridMatrix[r]) continue;
            for (let c = 0; c < gridMatrix[r].length; c++) {
                totalPoints++;
                const point = gridMatrix[r][c];
                // Check if valid reading
                if (point && typeof point.rawThickness === 'number' && point.rawThickness > 0) {
                    validPoints++;
                    if (point.rawThickness < minThick) minThick = point.rawThickness;
                }
            }
        }

        const coverage = totalPoints > 0 ? (validPoints / totalPoints) * 100 : 0;
        const THICKNESS_THRESHOLD = 5.0; // Adjust as needed
        const COVERAGE_THRESHOLD = 90.0;

        let status = 'SAFE';
        if (coverage < COVERAGE_THRESHOLD) status = 'NON_INSPECTION'; // Missing Data
        else if (minThick < THICKNESS_THRESHOLD) status = 'CRITICAL'; // Corrosion

        // OPTIONAL: Skip if Safe? (User asked to include non-inspection)
        // If you want to ONLY show bad patches, uncomment this:
        // if (status === 'SAFE') continue; 

        // --- 2. CLIPPING ---
        let planes: THREE.Plane[] = [];
        if (isVertical) {
            planes = [
                new THREE.Plane(new THREE.Vector3(0, -1, 0), patchEnd),
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -patchStart)
            ];
        } else {
            planes = [
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), patchEnd),
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -patchStart)
            ];
        }
        
        if (assetMesh.material instanceof THREE.Material) {
            assetMesh.material.clippingPlanes = planes;
            assetMesh.material.needsUpdate = true;
        }

        // --- 3. CAMERA LOGIC (Fixed for Zoom) ---
        // Use PATCH SIZE for zoom, not Asset Size
        const patchVisualSize = Math.max(patchStep, size.z); 
        const dist = patchVisualSize * 1.5; // Tighter zoom
        
        const target = new THREE.Vector3(patchLocation.x, patchLocation.y, patchLocation.z);

        // Top
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + dist);
        else camera.position.set(patchMid, box.max.y + dist, center.z);
        camera.lookAt(target);
        const top = await takeSnapshot(renderer, scene, camera);

        // Side
        if (isVertical) camera.position.set(box.max.x + dist, patchMid, center.z);
        else camera.position.set(patchMid, center.y, box.max.z + dist);
        camera.lookAt(target);
        const side = await takeSnapshot(renderer, scene, camera);

        // Iso
        camera.position.set(
            isVertical ? box.max.x + dist : patchMid + (patchStep/2),
            isVertical ? patchMid + (patchStep/2) : box.max.y + dist,
            box.max.z + dist
        );
        camera.lookAt(target);
        const iso = await takeSnapshot(renderer, scene, camera);

        // 2D Map (Far Zoom)
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + (dist * 10)); 
        else camera.position.set(patchMid, box.max.y + (dist * 10), center.z);
        camera.lookAt(target);
        const map = await takeSnapshot(renderer, scene, camera);

        patches.push({ 
            id: i + 1, 
            status: status,
            coverage: coverage.toFixed(1),
            location: patchLocation,
            views: { top, side, iso, map } 
        });
    }

    // Restore
    if (assetMesh.material instanceof THREE.Material) {
        assetMesh.material.clippingPlanes = originalClipping;
        assetMesh.material.needsUpdate = true;
    }
    camera.position.copy(originalPos);
    camera.rotation.copy(originalRot);
    
    return patches;
}
