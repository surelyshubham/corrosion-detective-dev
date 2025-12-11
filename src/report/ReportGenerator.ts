import * as THREE from 'three';
import jsPDF from 'jspdf';
import type { SegmentBox } from '@/lib/types';


// Helper to load image from URL to Base64 (avoids some PDF errors)
const loadBase64Image = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.setAttribute('crossOrigin', 'anonymous'); 
        image.onload = function () {
            const canvas = document.createElement('canvas');
            const thisImage = this as HTMLImageElement;
            canvas.width = thisImage.naturalWidth;
            canvas.height = thisImage.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(thisImage, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } else {
                reject(new Error('Could not get canvas context'));
            }
        };
        image.onerror = (err) => reject(err);
        image.src = url;
    });
};


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


// Add the getAIInsight function from Phase 1 here as a helper
function getAIInsight(patchId: number, minThickness: number, severity: string) {
    const formattedThick = minThickness.toFixed(2);
    // You can customize these thresholds
    if (severity === "Critical") {
        return `URGENT ACTION REQUIRED: Patch ${patchId} exhibits critical material loss with a minimum remaining thickness of ${formattedThick} mm. This is below the safety threshold. Immediate structural integrity assessment and repair planning (API 653/570) is recommended to prevent failure.`;
    } else if (severity === "Severe") {
        return `MONITORING REQUIRED: Patch ${patchId} shows signs of accelerated corrosion (Min Thk: ${formattedThick} mm). While currently stable, the corrosion rate suggests this area will reach critical levels within the next inspection interval. Schedule follow-up UT scanning.`;
    } else {
        return `OPTIMAL CONDITION: Patch ${patchId} indicates nominal wall thickness (${formattedThick} mm) with no significant localized pitting detected. Continue routine inspection schedule.`;
    }
}


export async function generateFinalReport(metadata: any, patches: any[]) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const margin = 15;
    
    // 1. Load Logo
    const logoUrl = "/logo.png";
    let logoData = null;
    try {
        logoData = await loadBase64Image(logoUrl);
    } catch (e) {
        console.warn("Could not load logo, skipping...");
    }

    // --- PAGE 1: MASTER SUMMARY ---
    
    // Header
    if (logoData) {
        doc.addImage(logoData, 'PNG', margin, 10, 40, 15); // Adjust w/h ratio as needed
    }
    doc.setFontSize(20);
    doc.setTextColor(0, 51, 102); // Sigma Blue
    doc.text("Corrosion Inspection Report", pageWidth - margin, 20, { align: 'right' });
    
    // Grey Divider
    doc.setDrawColor(200);
    doc.line(margin, 30, pageWidth - margin, 30);

    // Project Data Table (The fields you asked for)
    let y = 45;
    const lineHeight = 8;
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    
    // Function to draw a row
    const drawRow = (label: string, value: string) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(": " + value, margin + 40, y);
        y += lineHeight;
    };

    drawRow("Asset Name", metadata.assetName);
    drawRow("Location", metadata.location);
    drawRow("Inspection Date", metadata.inspectionDate);
    drawRow("Reporting Date", metadata.reportingDate);
    drawRow("Inspector", metadata.inspector);
    
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("General Remarks:", margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    // Multi-line text for remarks
    const splitRemarks = doc.splitTextToSize(metadata.remarks, pageWidth - (margin * 2));
    doc.text(splitRemarks, margin, y);
    
    // --- PATCH PAGES ---
    patches.forEach((patch) => {
        doc.addPage();
        
        // Header
        doc.setFillColor(240, 240, 240);
        doc.rect(0, 10, pageWidth, 20, 'F');
        doc.setFontSize(16);
        doc.setTextColor(0);
        doc.text(`Patch ${patch.id} Analysis`, margin, 23);
        
        // 2x2 Image Grid (As discussed)
        const imgSize = 85; 
        const startY = 40;
        const gap = 10;
        
        // Top Left
        if(patch.views.top) {
          doc.addImage(patch.views.top, 'PNG', margin, startY, imgSize, imgSize);
          doc.setFontSize(9);
          doc.text("Top View", margin, startY + imgSize + 5);
        }

        // Top Right
        if (patch.views.side) {
          doc.addImage(patch.views.side, 'PNG', margin + imgSize + gap, startY, imgSize, imgSize);
          doc.text("Side View", margin + imgSize + gap, startY + imgSize + 5);
        }

        // Bottom Left
        if (patch.views.iso) {
          doc.addImage(patch.views.iso, 'PNG', margin, startY + imgSize + 15, imgSize, imgSize);
          doc.text("Isometric View", margin, startY + (imgSize*2) + 20);
        }

        // Bottom Right
        if (patch.views.map) {
          doc.addImage(patch.views.map, 'PNG', margin + imgSize + gap, startY + imgSize + 15, imgSize, imgSize);
          doc.text("2D C-Scan Map", margin + imgSize + gap, startY + (imgSize*2) + 20);
        }

        // --- AI INSIGHT BOX ---
        const insightY = startY + (imgSize * 2) + 30;
        
        // Background for Insight
        doc.setFillColor(230, 240, 255); // Light Blue background
        doc.roundedRect(margin, insightY, pageWidth - (margin*2), 30, 3, 3, 'F');
        
        // Icon/Title
        doc.setTextColor(0, 51, 102);
        doc.setFont("helvetica", "bold");
        doc.text("AI Automated Insight", margin + 5, insightY + 8);
        
        // The Generated Text
        doc.setTextColor(0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        // Generate the text based on data
        const insightText = getAIInsight(patch.id, patch.worstThickness, patch.tier);
        const splitInsight = doc.splitTextToSize(insightText, pageWidth - (margin * 2) - 10);
        doc.text(splitInsight, margin + 5, insightY + 16);
    });

    doc.save(`${metadata.assetName}_Report.pdf`);
}

    