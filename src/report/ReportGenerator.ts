import * as THREE from 'three';
import jsPDF from 'jspdf';

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
        let planes = [];
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
        const views: { top?: string, side?: string, iso?: string, map?: string } = {};
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

        patches.push({ id: i + 1, views });
        console.log(`Captured Patch ${i+1}`);
    }

    // Restore State
    (assetMesh.material as THREE.Material).clippingPlanes = originalClipping;
    camera.position.copy(originalCameraPos);
    camera.quaternion.copy(originalCameraQuat);
    
    return patches;
}


export function generatePDF(assetName: string, fullAssetImage: string, patches: {id: number, views: any}[]) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- PAGE 1: TITLE & OVERVIEW ---
    doc.setFontSize(22);
    doc.text("Corrosion Inspection Report", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Asset: ${assetName}`, 14, 35);
    doc.text(`Inspector: Sigma NDT`, 14, 42);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 49);

    // Full Asset Image
    if (fullAssetImage) {
        doc.addImage(fullAssetImage, 'PNG', 14, 60, 180, 100);
        doc.text("Figure 1: Full Asset Overview", 14, 165);
    }

    // --- PATCH PAGES (1 Patch per Block, maybe 2 per page) ---
    let yPos = 20;
    
    patches.forEach((patch, index) => {
        // Add new page every 2 patches to avoid clutter
        if (index > 0 && index % 2 === 0) {
            doc.addPage();
            yPos = 20; // Reset Y
        } else if (index > 0) {
            yPos += 140; // Move down for second patch
        } else if (index === 0) {
            doc.addPage();
             yPos = 20; // Reset Y for first patch on new page
        }


        // Header
        doc.setFontSize(14);
        doc.setFillColor(230, 230, 230); // Light gray background
        doc.rect(10, yPos - 10, pageWidth - 20, 10, 'F');
        doc.setTextColor(0);
        doc.text(`Patch ${patch.id}`, 14, yPos - 3);

        // Data Table Simulation
        doc.setFontSize(10);
        doc.text(`Area: 10% (Coverage)`, 14, yPos + 10);
        doc.text(`Min Thickness: 3.60 mm`, 14, yPos + 16);
        doc.text(`Severity: Critical`, 14, yPos + 22);

        // Images Grid (2x2)
        const imgSize = 40;
        const gap = 5;
        const startX = 70;
        
        // Top Row
        doc.addImage(patch.views.top, 'PNG', startX, yPos, imgSize, imgSize);
        doc.text("Top View", startX + imgSize/2 - 5, yPos + imgSize + 5);

        doc.addImage(patch.views.side, 'PNG', startX + imgSize + gap, yPos, imgSize, imgSize);
        doc.text("Side View", startX + imgSize + gap + imgSize/2 - 5, yPos + imgSize + 5);

        // Bottom Row
        doc.addImage(patch.views.iso, 'PNG', startX, yPos + imgSize + 15, imgSize, imgSize);
        doc.text("Iso View", startX + imgSize/2 - 5, yPos + (imgSize*2) + 20);

        doc.addImage(patch.views.map, 'PNG', startX + imgSize + gap, yPos + imgSize + 15, imgSize, imgSize);
        doc.text("2D Map", startX + imgSize + gap + imgSize/2 - 5, yPos + (imgSize*2) + 20);
    });

    doc.save(`${assetName}_Report.pdf`);
}
