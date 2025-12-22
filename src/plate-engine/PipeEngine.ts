import * as THREE from "three";
import type { MergedGrid, InspectionStats, GridCell } from "@/lib/types";

export type HoverInfo = {
  gridX: number;
  gridY: number;
  worldX: number;
  worldY: number;
  effectiveThickness: number | null;
  percentage: number | null;
};

export class PipeEngine {
  private grid: MergedGrid;
  private stats: InspectionStats;
  private nominalThickness: number;
  private pipeRadius: number;
  private pipeHeight: number;
  private depthExaggeration: number;

  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private pipeMesh!: THREE.Mesh;
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
    pipeHeight: number;
    depthExaggeration: number;
  }) {
    this.scene = params.scene;
    this.camera = params.camera;
    this.grid = params.grid;
    this.stats = params.stats;
    this.nominalThickness = params.nominalThickness;
    this.pipeRadius = params.pipeRadius;
    this.pipeHeight = params.pipeHeight;
    this.depthExaggeration = params.depthExaggeration;

    this.cellWidth = (Math.PI * 2 * this.pipeRadius) / this.stats.gridSize.width;
    this.cellHeight = this.pipeHeight / this.stats.gridSize.height;

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

    const geom = new THREE.CylinderGeometry(this.pipeRadius, this.pipeRadius, this.pipeHeight, widthSegments, heightSegments, true);
    geom.translate(0, 0, 0); // Center the pipe
    
    const colors: number[] = [];
    const positions = geom.attributes.position;
    const normals = geom.attributes.normal;
    const xStep = gridW / widthSegments;
    const yStep = (gridH - 1) / heightSegments;

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
        const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
        
        originalPos.addScaledVector(normal, radialDisplacement);
        positions.setXYZ(i, originalPos.x, originalPos.y, originalPos.z);
    }

    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.pipeMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.pipeMesh);
  }

  private createWorldFrame() {
    const caps = new THREE.Group();
    const capGeo = new THREE.CircleGeometry(this.pipeRadius, 64);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
    
    const topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = this.pipeHeight / 2;
    topCap.rotation.x = Math.PI / 2;
    caps.add(topCap);

    const bottomCap = new THREE.Mesh(capGeo, capMat);
    bottomCap.position.y = -this.pipeHeight / 2;
    bottomCap.rotation.x = -Math.PI / 2;
    caps.add(bottomCap);

    this.scene.add(caps);
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
      gridX, gridY, worldX: hit.point.x, worldY: hit.point.z,
      effectiveThickness: cell.effectiveThickness, percentage: cell.percentage,
    });
  }

  onHover(cb: (info: HoverInfo | null) => void) { this.hoverCallback = cb; }
  
  gridToWorld(gridX: number, gridY: number): THREE.Vector3 {
      const angle = (gridX / this.stats.gridSize.width) * 2 * Math.PI;
      const h = (gridY / this.stats.gridSize.height) * this.pipeHeight - (this.pipeHeight / 2);
      
      const cell = this.grid[gridY]?.[gridX];
      const wallLoss = (cell && !cell.isND && cell.effectiveThickness !== null) ? this.nominalThickness - cell.effectiveThickness : 0;
      const currentRadius = this.pipeRadius - (wallLoss * this.depthExaggeration);

      const x = currentRadius * Math.cos(angle);
      const z = currentRadius * Math.sin(angle);
      return new THREE.Vector3(x, h, z);
  }

  setDepthExaggeration(scale: number) {
    this.depthExaggeration = scale;
    const positions = this.pipeMesh.geometry.attributes.position;
    const normals = this.pipeMesh.geometry.attributes.normal;
    
    const gridW = this.stats.gridSize.width;
    const gridH = this.stats.gridSize.height;

    // We need to rebuild the positions based on the original geometry + new exaggeration
    const originalPositions = this.pipeMesh.geometry.clone().attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
        const u = this.pipeMesh.geometry.attributes.uv.getX(i);
        const v = this.pipeMesh.geometry.attributes.uv.getY(i);
        
        const gridX = Math.floor(u * (gridW -1));
        const gridY = Math.floor((1 - v) * (gridH - 1));
        const cell = this.grid[gridY]?.[gridX];
        
        const isND = !cell || cell.isND;
        const wallLoss = (cell && !isND && cell.effectiveThickness !== null) ? this.nominalThickness - cell.effectiveThickness : 0;
        const radialDisplacement = -wallLoss * this.depthExaggeration;

        const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
        
        // This is tricky: we can't just use the base cylinder, because our segments don't match.
        // The best way is to recalculate from scratch, or store base positions.
        // For simplicity, we'll dispose and recreate.
    }
    // This is a simplified approach; a more optimized one would not dispose.
    this.scene.remove(this.pipeMesh);
    this.pipeMesh.geometry.dispose();
    (this.pipeMesh.material as THREE.Material).dispose();
    this.createPipe();
  }

  dispose() {
    this.scene.remove(this.pipeMesh);
    this.pipeMesh.geometry.dispose();
    (this.pipeMesh.material as THREE.Material).dispose();
  }
}
