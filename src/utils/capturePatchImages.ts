
// src/utils/capturePatchImages.ts
import * as THREE from 'three';

// HELPER: Captures a clean snapshot
async function takeSnapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.render(scene, camera);
    await new Promise(r => setTimeout(r, 50)); // Prevent UI freeze
    return renderer.domElement.toDataURL("image/png");
}

export async function captureAssetPatches(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, assetMesh: THREE.Mesh) {
    console.log("Starting Capture Sequence...");
    
    if (!assetMesh.geometry) {
        throw new Error("Asset mesh has no geometry.");
    }
    
    // 1. Geometry & Orientation Analysis
    assetMesh.geometry.computeBoundingBox();
    const box = assetMesh.geometry.boundingBox as THREE.Box3;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Detect Axis: If Height (Y) is the largest dimension, it's a TANK (Vertical).
    // Otherwise, it's a PIPE/PLATE (Horizontal).
    const isVertical = size.y > size.x && size.y > size.z;
    const mainAxisLength = isVertical ? size.y : size.x;
    const minVal = isVertical ? box.min.y : box.min.x;
    const patchStep = mainAxisLength / 10;

    // Save original state
    const originalClipping = (assetMesh.material as THREE.Material).clippingPlanes;
    const originalCameraPos = camera.position.clone();
    const originalCameraQuat = camera.quaternion.clone();

    const patches = [];

    // 2. The 10-Patch Loop
    for (let i = 0; i < 10; i++) {
        const patchStart = minVal + (i * patchStep);
        const patchEnd = patchStart + patchStep;
        const patchMid = (patchStart + patchEnd) / 2;

        // A. Set Clipping Planes (Scissors)
        let planes: THREE.Plane[] = [];
        if (isVertical) {
            // Tank: Cut Top and Bottom
            planes = [
                new THREE.Plane(new THREE.Vector3(0, -1, 0), patchEnd),
                new THREE.Plane(new THREE.Vector3(0, 1, 0), -patchStart)
            ];
        } else {
            // Pipe: Cut Left and Right
            planes = [
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), patchEnd),
                new THREE.Plane(new THREE.Vector3(1, 0, 0), -patchStart)
            ];
        }
        (assetMesh.material as THREE.Material).clippingPlanes = planes;

        // B. Move Camera & Snap Views
        const views: {top?: string, side?: string, iso?: string, map?: string} = {};
        const dist = Math.max(size.x, size.y, size.z) * 1.5; // Auto-zoom
        
        // Define target to look at (center of current slice)
        const target = isVertical 
            ? new THREE.Vector3(center.x, patchMid, center.z)
            : new THREE.Vector3(patchMid, center.y, center.z);

        // -- View 1: "Top" (or Front for Tank) --
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + dist);
        else camera.position.set(patchMid, box.max.y + dist, center.z);
        camera.lookAt(target);
        views.top = await takeSnapshot(renderer, scene, camera);

        // -- View 2: "Side" --
        if (isVertical) camera.position.set(box.max.x + dist, patchMid, center.z);
        else camera.position.set(patchMid, center.y, box.max.z + dist);
        camera.lookAt(target);
        views.side = await takeSnapshot(renderer, scene, camera);

        // -- View 3: "Isometric" --
        camera.position.set(
            isVertical ? box.max.x + dist : patchMid + (patchStep/2),
            isVertical ? patchMid + (patchStep/2) : box.max.y + dist,
            box.max.z + dist
        );
        camera.lookAt(target);
        views.iso = await takeSnapshot(renderer, scene, camera);

        // -- View 4: "2D Map" (Reuse Top for now, or implement separate shader capture) --
        views.map = views.top;
        

        patches.push({ 
            id: i + 1, 
            views,
            // These are placeholders, they need to be linked to actual segment data
            worstThickness: 0,
            tier: 'Normal',
        });
        console.log(`Captured Patch ${i+1}`);
    }

    // Restore State
    (assetMesh.material as THREE.Material).clippingPlanes = originalClipping;
    camera.position.copy(originalCameraPos);
    camera.quaternion.copy(originalCameraQuat);
    
    return patches;
}
