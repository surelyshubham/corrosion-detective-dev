
import * as THREE from 'three';

async function takeSnapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.render(scene, camera);
    await new Promise(r => setTimeout(r, 80)); // Slightly longer delay for stability
    return renderer.domElement.toDataURL("image/png", 1.0);
}

export async function captureAssetPatches(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera, 
    renderer: THREE.WebGLRenderer, 
    assetMesh: THREE.Mesh
) {
    console.log("Starting Capture Sequence...");
    
    // 1. Geometry Setup
    if (!assetMesh.geometry.boundingBox) assetMesh.geometry.computeBoundingBox();
    const box = assetMesh.geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Detect Orientation
    const isVertical = size.y > size.x && size.y > size.z;
    const minVal = isVertical ? box.min.y : box.min.x;
    const patchStep = (isVertical ? size.y : size.x) / 10;

    // Save State
    const originalClipping = assetMesh.material instanceof THREE.Material ? assetMesh.material.clippingPlanes : [];
    const originalPos = camera.position.clone();
    const originalRot = camera.rotation.clone();

    const patches = [];

    // 2. The Loop
    for (let i = 0; i < 10; i++) {
        const patchStart = minVal + (i * patchStep);
        const patchEnd = patchStart + patchStep;
        const patchMid = (patchStart + patchEnd) / 2;

        // Calculate Specific Patch Center (For the PDF Report)
        const patchLocation = {
            x: isVertical ? center.x : patchMid,
            y: isVertical ? patchMid : center.y,
            z: center.z
        };

        // Clipping Planes
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

        // Move Camera & Snap
        const dist = Math.max(size.x, size.y, size.z) * 1.3;
        const target = new THREE.Vector3(patchLocation.x, patchLocation.y, patchLocation.z);

        // Top View
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + dist);
        else camera.position.set(patchMid, box.max.y + dist, center.z);
        camera.lookAt(target);
        const top = await takeSnapshot(renderer, scene, camera);

        // Side View
        if (isVertical) camera.position.set(box.max.x + dist, patchMid, center.z);
        else camera.position.set(patchMid, center.y, box.max.z + dist);
        camera.lookAt(target);
        const side = await takeSnapshot(renderer, scene, camera);

        // Iso View
        camera.position.set(
            isVertical ? box.max.x + dist : patchMid + (patchStep/2),
            isVertical ? patchMid + (patchStep/2) : box.max.y + dist,
            box.max.z + dist
        );
        camera.lookAt(target);
        const iso = await takeSnapshot(renderer, scene, camera);

        // 2D Map
        if (isVertical) camera.position.set(center.x, patchMid, box.max.z + (dist * 5)); 
        else camera.position.set(patchMid, box.max.y + (dist * 5), center.z);
        camera.lookAt(target);
        const map = await takeSnapshot(renderer, scene, camera);

        patches.push({ 
            id: i + 1, 
            location: patchLocation, // Sending X,Y,Z to PDF
            views: { top, side, iso, map } 
        });
    }

    // 3. Restore State (Fixes Blank Screen Issue)
    if (assetMesh.material instanceof THREE.Material) {
        assetMesh.material.clippingPlanes = originalClipping; // Remove scissors
        assetMesh.material.needsUpdate = true;
    }
    camera.position.copy(originalPos);
    camera.rotation.copy(originalRot);
    
    return patches;
}
