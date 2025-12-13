
import * as THREE from "three";
import type { MergedGrid, InspectionStats } from "@/lib/types";

export type HoverInfo = {
  gridX: number;
  gridY: number;
  worldX: number;
  worldY: number;
  effectiveThickness: number | null;
  percentage: number | null;
};

export class PlateEngine {
  // --- immutable inputs ---
  private grid: MergedGrid;
  private stats: InspectionStats;
  private nominalThickness: number;
  private depthExaggeration: number;

  // --- three.js ---
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private plateMesh!: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  
  // --- geometry mapping ---
  public readonly VISUAL_WIDTH: number;
  private readonly MAX_SEGMENTS = 250;
  public visualHeight: number;
  private cellWidth: number;
  private cellHeight: number;

  // --- world frame ---
  private axesHelper!: THREE.AxesHelper;
  private originMarker!: THREE.Mesh;

  // --- cursor ---
  private hoverCallback?: (info: HoverInfo | null) => void;

  constructor(params: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    grid: MergedGrid;
    stats: InspectionStats;
    nominalThickness: number;
    depthExaggeration: number;
  }) {
    this.scene = params.scene;
    this.camera = params.camera;
    this.grid = params.grid;
    this.stats = params.stats;
    this.nominalThickness = params.nominalThickness;
    this.depthExaggeration = params.depthExaggeration;

    const MAX_VISUAL_SIZE = 100;
    const plateWidth = this.stats.gridSize.width;
    const plateHeight = this.stats.gridSize.height;

    const scaleFactor = MAX_VISUAL_SIZE / Math.max(plateWidth, plateHeight);

    this.VISUAL_WIDTH = plateWidth * scaleFactor;
    this.visualHeight = plateHeight * scaleFactor;

    this.cellWidth = this.VISUAL_WIDTH / this.stats.gridSize.width;
    this.cellHeight = this.visualHeight / this.stats.gridSize.height;

    this.createPlate();
    this.createWorldFrame();
  }
  
  private getAbsColor(percentage: number | null): THREE.Color {
    const c = new THREE.Color();
    if (percentage === null) c.set(0x888888);        // ND
    else if (percentage < 70) c.set(0xff0000);       // Red
    else if (percentage < 80) c.set(0xffff00);       // Yellow
    else if (percentage < 90) c.set(0x00ff00);       // Green
    else c.set(0x0000ff);                            // Blue
    return c;
  }


  // ===============================
  // GEOMETRY (FLAT, FAST, IMMUTABLE)
  // ===============================
  private createPlate() {
    const gridW = this.stats.gridSize.width;
    const gridH = this.stats.gridSize.height;

    const widthSegments  = Math.min(gridW - 1, this.MAX_SEGMENTS);
    const heightSegments = Math.min(gridH - 1, this.MAX_SEGMENTS);

    const geom = new THREE.PlaneGeometry(
      this.VISUAL_WIDTH,
      this.visualHeight,
      widthSegments,
      heightSegments
    );

    geom.rotateX(-Math.PI / 2);
    geom.translate(this.VISUAL_WIDTH / 2, 0, this.visualHeight / 2);
    
    const colors: number[] = [];
    const positions = geom.attributes.position;
    const xStep = (gridW - 1) / widthSegments;
    const yStep = (gridH - 1) / heightSegments;
    const zScale = this.depthExaggeration;

    for (let y = 0; y <= heightSegments; y++) {
      for (let x = 0; x <= widthSegments; x++) {
        const gridX = Math.round(x * xStep);
        const gridY = Math.round(y * yStep);

        const cell = this.grid[gridY]?.[gridX];
        const percentage = cell?.percentage ?? null;
        const color = this.getAbsColor(percentage);
        colors.push(color.r, color.g, color.b);

        const wallLoss = (cell && cell.effectiveThickness !== null)
            ? this.nominalThickness - cell.effectiveThickness
            : 0;

        const i = y * (widthSegments + 1) + x;
        const z = -wallLoss * zScale;
        positions.setY(i, z);
      }
    }

    geom.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3)
    );
    positions.needsUpdate = true;
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.plateMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.plateMesh);
  }

  private createWorldFrame() {
    // 1️⃣ AXES (X=Red, Y=Green, Z=Blue)
    this.axesHelper = new THREE.AxesHelper(30);
    this.scene.add(this.axesHelper);
  
    // 2️⃣ ORIGIN MARKER (0,0,0)
    this.originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00ff }) // magenta
    );
    this.originMarker.position.set(0, 0, 0);
    this.scene.add(this.originMarker);
  }

  // ===============================
  // CURSOR HANDLING (NO LAG)
  // ===============================
  handleMouseMove(ndc: THREE.Vector2) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.plateMesh, false)[0];
    if (!hit) {
      this.hoverCallback?.(null);
      return;
    }

    const { x, z } = hit.point;

    const gridX = Math.floor(x / this.cellWidth);
    const gridY = Math.floor(z / this.cellHeight);

    if (
      gridX < 0 ||
      gridY < 0 ||
      gridY >= this.grid.length ||
      gridX >= this.grid[0].length
    ) {
      this.hoverCallback?.(null);
      return;
    }

    const cell = this.grid[gridY][gridX];
    if (!cell) {
      this.hoverCallback?.(null);
      return;
    }
    
    this.hoverCallback?.({
      gridX,
      gridY,
      worldX: x,
      worldY: z,
      effectiveThickness: cell.effectiveThickness,
      percentage: cell.percentage,
    });
  }

  // ===============================
  // PUBLIC API
  // ===============================
  onHover(cb: (info: HoverInfo | null) => void) {
    this.hoverCallback = cb;
  }

  dispose() {
    this.scene.remove(this.plateMesh);
    this.scene.remove(this.axesHelper);
    this.scene.remove(this.originMarker);
  
    this.plateMesh.geometry.dispose();
    (this.plateMesh.material as THREE.Material).dispose();
  }
}

    