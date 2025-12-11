
import * as THREE from 'three';

// HELPER: Captures a clean snapshot
async function takeSnapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.render(scene, camera);
    await new Promise(r => setTimeout(r, 60)); // Short delay to prevent UI freeze
    return renderer.domElement.toDataURL("image/png", 1.0);
}

export async function captureAssetPatches(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera, 
    renderer: THREE.WebGLRenderer, 
    assetMesh: THREE.Mesh
) {
    console.log("Starting Robot Capture Sequence...");
    
    // 1. Geometry & Orientation Analysis
    // We must ensure bounding box is up to date
    if (!assetMesh.geometry.boundingBox) assetMesh.geometry.computeBoundingBox();
    const box = assetMesh.geometry.boundingBox!;
    
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Detect Axis: If Height (Y) is the largest, it's a TANK (Vertical).
    // Otherwise, it's a PIPE/PLATE (Horizontal).
    const isVertical = size.y > size.x && size.y > size.z;
    const mainAxisLength = isVertical ? size.y : size.x;
    const minVal = isVertical ? box.min.y : box.min.x;
    const patchStep = mainAxisLength / 10;

    // Save original state to restore later
    const originalClipping = assetMesh.material instanceof THREE.Material ? assetMesh.material.clippingPlanes : [];
    const originalPos = camera.position.clone();
    const originalRot = camera.rotation.clone();
    const originalTarget = new THREE.Vector3(0,0,0); // Assuming controls target was 0,0,0

    const patches = [];

    // 2. The 10-Patch Loop
    for (let i = 0; i < 10; i++) {
        const patchStart = minVal + (i * patchStep);
        const patchEnd = patchStart + patchStep;
        const patchMid = (patchStart + patchEnd) / 2;

        // A. Set Clipping Planes ("The Scissors")
        // We cut everything before and after the current slice
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
        
        // Apply planes to material
        if (assetMesh.material instanceof THREE.Material) {
            assetMesh.material.clippingPlanes = planes;
            assetMesh.material.needsUpdate = true;
        }

        // B. Move Camera & Snap Views
        const views: any = {};
        // Auto-zoom distance based on asset thickness
        const dist = Math.max(size.x, size.y, size.z) * 1.2; 
        
        // Define target to look at (center of current slice)
        const target = isVertical 
            ? new THREE.Vector3(center.x, patchMid, center.z)
            : new THREE.Vector3(patchMid, center.y, center.z);

        // --- 1. Top/Front View ---
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + dist);
        else camera.position.set(patchMid, box.max.y + dist, center.z);
        camera.lookAt(target);
        views.top = await takeSnapshot(renderer, scene, camera);

        // --- 2. Side View ---
        if (isVertical) camera.position.set(box.max.x + dist, patchMid, center.z);
        else camera.position.set(patchMid, center.y, box.max.z + dist);
        camera.lookAt(target);
        views.side = await takeSnapshot(renderer, scene, camera);

        // --- 3. Isometric View ---
        camera.position.set(
            isVertical ? box.max.x + dist : patchMid + (patchStep/2),
            isVertical ? patchMid + (patchStep/2) : box.max.y + dist,
            box.max.z + dist
        );
        camera.lookAt(target);
        views.iso = await takeSnapshot(renderer, scene, camera);

        // --- 4. 2D Map (Simulated Ortho) ---
        // Move far away and look straight down
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + (dist * 5)); 
        else camera.position.set(patchMid, box.max.y + (dist * 5), center.z);
        camera.lookAt(target);
        views.map = await takeSnapshot(renderer, scene, camera);

        patches.push({ id: i + 1, views });
        console.log(`Captured Patch ${i+1}/10`);
    }

    // 3. Cleanup & Restore
    if (assetMesh.material instanceof THREE.Material) {
        assetMesh.material.clippingPlanes = originalClipping;
        assetMesh.material.needsUpdate = true;
    }
    camera.position.copy(originalPos);
    camera.rotation.copy(originalRot);
    
    console.log("Capture Complete.");
    return patches;
}
