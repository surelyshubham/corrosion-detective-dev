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

  // --- three.js ---
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private plateMesh!: THREE.Mesh;
  private raycaster = new THREE.Raycaster();

  // --- geometry mapping ---
  private readonly VISUAL_WIDTH = 100;
  private visualHeight: number;
  private cellWidth: number;
  private cellHeight: number;

  // --- cursor ---
  private hoverCallback?: (info: HoverInfo | null) => void;

  constructor(params: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    grid: MergedGrid;
    stats: InspectionStats;
    nominalThickness: number;
  }) {
    this.scene = params.scene;
    this.camera = params.camera;
    this.grid = params.grid;
    this.stats = params.stats;
    this.nominalThickness = params.nominalThickness;

    const { width, height } = this.stats.gridSize;
    this.visualHeight = this.VISUAL_WIDTH * (height / width);
    this.cellWidth = this.VISUAL_WIDTH / width;
    this.cellHeight = this.visualHeight / height;

    this.createPlate();
  }

  // ===============================
  // GEOMETRY (FLAT, FAST, IMMUTABLE)
  // ===============================
  private createPlate() {
    const geom = new THREE.PlaneGeometry(
      this.VISUAL_WIDTH,
      this.visualHeight,
      1,
      1
    );
    geom.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: false,
      side: THREE.DoubleSide,
    });

    this.plateMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.plateMesh);
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

    const gridX = Math.floor((x + this.VISUAL_WIDTH / 2) / this.cellWidth);
    const gridY = Math.floor((z + this.visualHeight / 2) / this.cellHeight);

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
    this.plateMesh.geometry.dispose();
    (this.plateMesh.material as THREE.Material).dispose();
  }
}
