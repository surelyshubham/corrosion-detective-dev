
import * as THREE from 'three';
import { DataVault } from '@/store/data-vault';

async function takeSnapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.render(scene, camera);
    await new Promise(r => setTimeout(r, 80)); // Stability delay
    return renderer.domElement.toDataURL("image/png", 1.0);
}

interface CaptureOptions {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    plateWidth: number;
    plateHeight: number;
}

export function createPlateSections(
  width: number,
  height: number,
  rows = 10,
  cols = 10
) {
  const sections = [];

  const cellW = width / cols;
  const cellH = height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sections.push({
        id: `R${r + 1}-C${c + 1}`,
        xMin: c * cellW,
        xMax: (c + 1) * cellW,
        yMin: r * cellH,
        yMax: (r + 1) * cellH
      });
    }
  }

  return sections;
}

export function analyzeSection(section: any, grid: any[][]) {
    const points = [];
    const gridRows = grid.length;
    if(gridRows === 0) return { inspected: false, minThickness: 0, maxCorrosion: 0 };
    const gridCols = grid[0]?.length || 0;

    for(let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            // Map grid coordinates to physical coordinates for checking
            const pointX = (c / (gridCols - 1)) * (gridCols); // Simplified, assuming grid maps to physical
            const pointY = (r / (gridRows - 1)) * (gridRows);

            if(pointX >= section.xMin && pointX <= section.xMax && pointY >= section.yMin && pointY <= section.yMax) {
                 const point = grid[r][c];
                 if (point && point.rawThickness > 0) {
                    points.push(point);
                }
            }
        }
    }

  if (!points.length) {
    return {
      inspected: false,
      minThickness: 0,
      maxCorrosion: 0
    };
  }
  
  const minThickness = Math.min(...points.map(p => p.rawThickness));
  const nominal = points[0]?.nominalThickness || minThickness;
  const maxCorrosion = Math.max(...points.map(p => ((nominal - p.rawThickness) / nominal) * 100));


  return {
    inspected: true,
    minThickness,
    maxCorrosion: isFinite(maxCorrosion) ? maxCorrosion : 0,
  };
}

export async function captureAssetPatches(options: CaptureOptions) {
    const { scene, camera, renderer, plateWidth, plateHeight } = options;
    console.log("Starting Section-Based Capture Sequence...");

    const originalPos = camera.position.clone();
    const originalTarget = new THREE.Vector3();
    camera.getWorldDirection(originalTarget).add(originalPos);

    const sections = createPlateSections(plateWidth, plateHeight);
    const analyzedPatches = [];

    for (const section of sections) {
        const analysis = analyzeSection(section, DataVault.gridMatrix || []);
        
        const centerX = (section.xMin + section.xMax) / 2;
        const centerY = (section.yMin + section.yMax) / 2;
        const target = new THREE.Vector3(centerX, centerY, 0);

        const sectionWidth = section.xMax - section.xMin;
        const sectionHeight = section.yMax - section.yMin;
        const distance = Math.max(sectionWidth, sectionHeight) * 2; // Zoom into the section

        // --- CAMERA SNAPSHOT PER SECTION ---
        camera.position.set(centerX, centerY, distance);
        camera.lookAt(target);
        const topView = await takeSnapshot(renderer, scene, camera);
        
        camera.position.set(centerX + distance, centerY, 0);
        camera.lookAt(target);
        const sideView = await takeSnapshot(renderer, scene, camera);

        camera.position.set(centerX + distance * 0.7, centerY + distance * 0.7, distance * 0.7);
        camera.lookAt(target);
        const isoView = await takeSnapshot(renderer, scene, camera);

        analyzedPatches.push({
            ...section,
            ...analysis,
            views: { top: topView, side: sideView, iso: isoView }
        });
    }

    // Restore camera
    camera.position.copy(originalPos);
    camera.lookAt(originalTarget);
    
    return analyzedPatches;
}

    