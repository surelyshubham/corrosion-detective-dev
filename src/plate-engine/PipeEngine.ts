import * as THREE from "three";
import type { MergedGrid, InspectionStats, GridCell } from "@/lib/types";

export type HoverInfo = {
  gridX: number;
  gridY: number;
  worldX: number;
  worldZ: number; // Switched from Y to Z for horizontal pipe
  effectiveThickness: number | null;
  percentage: number | null;
};

export class PipeEngine {
  private grid: MergedGrid;
  private stats: InspectionStats;
  private nominalThickness: number;
  private pipeRadius: number;
  private pipeLength: number; // Changed from pipeHeight
  private depthExaggeration: number;
  private startAngle: number; // in degrees

  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private pipeMesh!: THREE.Mesh;
  private seamLine?: THREE.Line;
  private raycaster = new THREE.Raycaster();
  
  public readonly cellWidth: number;
  public readonly cellHeight: number;

  private hoverCallback?: (info: HoverInfo | null) => void;

  constructor(params: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    grid: MergedGrid;
    stats: InspectionStats;
    nominalThickness: number;
    pipeRadius: number;
    pipeHeight: number; // Interpreted as length
    depthExaggeration: number;
    startAngle: number;
  }) {
    this.scene = params.scene;
    this.camera = params.camera;
    this.grid = params.grid;
    this.stats = params.stats;
    this.nominalThickness = params.nominalThickness;
    this.pipeRadius = params.pipeRadius;
    this.pipeLength = params.pipeHeight; // Use height as length
    this.depthExaggeration = params.depthExaggeration;
    this.startAngle = params.startAngle;

    this.cellWidth = (Math.PI * 2 * this.pipeRadius) / this.stats.gridSize.width;
    this.cellHeight = this.pipeLength / this.stats.gridSize.height;

    this.createPipe();
    this.createWorldFrame();
  }
  
  private getAbsColor(percentage: number | null, isND: boolean): THREE.Color {
    const c = new THREE.Color();
    if (isND) {
      c.set(0x888888); 
      return c;
    }
    if (percentage === null) c.set(0x444444);
    else if (percentage < 70) c.set(0xff0000);
    else if (percentage < 80) c.set(0xffff00);
    else if (percentage < 90) c.set(0x00ff00);
    else c.set(0x0000ff);
    return c;
  }

  private createPipe() {
    const gridW = this.stats.gridSize.width;
    const gridH = this.stats.gridSize.height;
    const MAX_SEGMENTS = 250;
    const widthSegments  = Math.min(gridW, MAX_SEGMENTS);
    const heightSegments = Math.min(gridH - 1, MAX_SEGMENTS);
    const startAngleRad = THREE.MathUtils.degToRad(this.startAngle);

    // Create a cylinder aligned with Y-axis, which we will then rotate
    const geom = new THREE.CylinderGeometry(this.pipeRadius, this.pipeRadius, this.pipeLength, widthSegments, heightSegments, true);
    
    const colors: number[] = [];
    const positions = geom.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        const u = geom.attributes.uv.getX(i);
        const v = geom.attributes.uv.getY(i);
        
        const gridX = Math.floor(u * (gridW -1));
        const gridY = Math.floor((1 - v) * (gridH - 1));
        const cell = this.grid[gridY]?.[gridX];
        
        const isND = !cell || cell.isND;
        const percentage = cell?.percentage ?? null;
        const color = this.getAbsColor(percentage, isND);
        colors.push(color.r, color.g, color.b);

        const wallLoss = (cell && !isND && cell.effectiveThickness !== null) ? this.nominalThickness - cell.effectiveThickness : 0;
        const radialDisplacement = -wallLoss * this.depthExaggeration;

        const originalPos = new THREE.Vector3().fromBufferAttribute(positions, i);
        
        // The cylinder is vertical, so its radius is in XZ plane
        const currentRadius = this.pipeRadius + radialDisplacement;
        const newX = currentRadius * Math.cos(originalPos.x / this.pipeRadius * Math.PI * 2);
        const newZ = currentRadius * Math.sin(originalPos.x / this.pipeRadius * Math.PI * 2);
        
        // This displacement logic is for a vertical cylinder
        const angle = u * Math.PI * 2;
        positions.setXYZ(
          i,
          currentRadius * Math.cos(angle), 
          originalPos.y, // Y is the height/length axis for the base cylinder
          currentRadius * Math.sin(angle)
        );
    }
    
    geom.rotateY(startAngleRad);
    geom.rotateX(Math.PI / 2); // Rotate to be horizontal along Z axis

    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.pipeMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.pipeMesh);
    
    this.createSeamLine();
  }

  private createSeamLine() {
    if (this.seamLine) {
        this.scene.remove(this.seamLine);
        this.seamLine.geometry.dispose();
        (this.seamLine.material as THREE.Material).dispose();
    }
    const seamMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const startAngleRad = THREE.MathUtils.degToRad(this.startAngle);
    
    const seamX = (this.pipeRadius + 1) * Math.cos(startAngleRad);
    const seamY = (this.pipeRadius + 1) * Math.sin(startAngleRad);

    const points = [
        new THREE.Vector3(seamX, seamY, -this.pipeLength / 2),
        new THREE.Vector3(seamX, seamY, this.pipeLength / 2)
    ];
    const seamGeometry = new THREE.BufferGeometry().setFromPoints(points);
    this.seamLine = new THREE.Line(seamGeometry, seamMaterial);
    this.scene.add(this.seamLine);
  }

  private createWorldFrame() {
    // No caps for a pipe
  }

  handleMouseMove(ndc: THREE.Vector2) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.pipeMesh, false)[0];
    if (!hit || !hit.uv) {
      this.hoverCallback?.(null);
      return;
    }
    const {uv} = hit;
    const gridX = Math.floor(uv.x * (this.stats.gridSize.width - 1));
    const gridY = Math.floor((1 - uv.y) * (this.stats.gridSize.height - 1));
    
    if (gridX < 0 || gridY < 0 || gridY >= this.grid.length || gridX >= this.grid[0].length) {
      this.hoverCallback?.(null);
      return;
    }
    const cell = this.grid[gridY][gridX];
    if (!cell) {
      this.hoverCallback?.(null);
      return;
    }
    this.hoverCallback?.({
      gridX, gridY, worldX: hit.point.x, worldZ: hit.point.z,
      effectiveThickness: cell.effectiveThickness, percentage: cell.percentage,
    });
  }

  onHover(cb: (info: HoverInfo | null) => void) { this.hoverCallback = cb; }
  
  gridToWorld(gridX: number, gridY: number): THREE.Vector3 {
      const startAngleRad = THREE.MathUtils.degToRad(this.startAngle);
      const angle = (gridX / this.stats.gridSize.width) * 2 * Math.PI + startAngleRad;
      const h = (gridY / this.stats.gridSize.height) * this.pipeLength - (this.pipeLength / 2);
      
      const cell = this.grid[gridY]?.[gridX];
      const wallLoss = (cell && !cell.isND && cell.effectiveThickness !== null) ? this.nominalThickness - cell.effectiveThickness : 0;
      const currentRadius = this.pipeRadius - (wallLoss * this.depthExaggeration);

      // Coordinates for horizontal pipe along Z-axis
      const x = currentRadius * Math.cos(angle);
      const y = currentRadius * Math.sin(angle);
      return new THREE.Vector3(x, y, h);
  }

  setDepthExaggeration(scale: number) {
    this.depthExaggeration = scale;
    this.dispose();
    this.createPipe();
  }

  setStartAngle(angle: number) {
    this.startAngle = angle;
    this.dispose();
    this.createPipe();
  }

  dispose() {
    if(this.pipeMesh) this.scene.remove(this.pipeMesh);
    if(this.seamLine) this.scene.remove(this.seamLine);

    this.pipeMesh?.geometry.dispose();
    if (this.pipeMesh?.material) {
        if (Array.isArray(this.pipeMesh.material)) {
            this.pipeMesh.material.forEach(m => m.dispose());
        } else {
            this.pipeMesh.material.dispose();
        }
    }
   
    if(this.seamLine) {
        this.seamLine.geometry.dispose();
        (this.seamLine.material as THREE.Material).dispose();
    }
  }
}
