

export type AssetType = 
  | 'Plate'
  | 'Tank'
  | 'Vessel'
  | 'Pipe'
  | 'Pipe Elbow'
  | 'Ship Hull'
  | 'LPG/Gas Bullet';

export const assetTypes: AssetType[] = [
  'Plate',
  'Tank',
  'Vessel',
  'Pipe',
  'Pipe Elbow',
  'Ship Hull',
  'LPG/Gas Bullet',
];

// New types for Pipe Elbow configuration
export type ElbowAngle = 30 | 45 | 90;
export type ElbowRadiusType = 'Long' | 'Short';


export interface GridCell {
  plateId: string | null;
  rawThickness: number | null;
  effectiveThickness: number | null;
  percentage: number | null;
  isND: boolean;
  xMm: number;
  yMm: number;
}

export interface InspectionDataPoint {
  x: number;
  y: number;
  rawThickness: number | null;
  effectiveThickness: number | null;
  deviation: number | null;
  percentage: number | null;
  wallLoss: number | null;
}

export type RawInspectionDataPoint = Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>

export interface InspectionStats {
  minThickness: number;
  maxThickness: number;
  avgThickness: number;
  minPercentage: number;
  areaBelow80: number;
  areaBelow70: number;
  areaBelow60: number;
  countND: number;
  totalPoints: number;
  worstLocation: { x: number; y: number; value: number };
  bestLocation: { x: number; y: number; value: number };
  gridSize: { width: number; height: number };
  scannedArea: number;
  nominalThickness?: number;
}

export type Condition = 'Healthy' | 'Moderate' | 'Severe' | 'Critical' | 'N/A';

export interface AIInsight {
  condition: string;
  recommendation: string;
}

export type SeverityTier = 'Critical' | 'Severe' | 'Moderate' | 'Normal';
export type PatchKind = 'CORROSION' | 'NON_INSPECTED';
export type PatchRepresentation = 'IMAGE' | 'TABLE_ONLY';

export interface SegmentBox {
  id: number;
  kind: PatchKind;
  pointCount: number;
  coordinates: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  center: {
    x: number;
    y: number;
  };
  representation: PatchRepresentation;
  
  // Corrosion-specific
  tier?: SeverityTier;
  worstThickness?: number;
  avgThickness?: number;
  severityScore?: number;
  
  // Reporting data
  heatmapDataUrl?: string;
  
  // For micro-patches
  cells?: { x: number, y: number, xMm: number, yMm: number, rawThickness: number | null, effectiveThickness: number | null }[];

  // For ND patches
  reason?: string;
}

export type Plate = {
  id: string; // Typically the filename
  fileName: string;
  rawGridData: RawInspectionDataPoint[];
  processedData: InspectionDataPoint[];
  stats: InspectionStats;
  metadata: any[][];
  assetType: AssetType;
  nominalThickness: number;
  pipeOuterDiameter?: number;
  pipeLength?: number;
  // Elbow specific
  elbowStartLength?: number;
  elbowAngle?: ElbowAngle;
  elbowRadiusType?: ElbowRadiusType;
};

export type MergedGrid = GridCell[][]; // [y][x]

export interface MergedInspectionResult {
  plates: Plate[];
  mergedGrid: MergedGrid;
  nominalThickness: number;
  assetType: AssetType;
  pipeOuterDiameter?: number;
  pipeLength?: number;
  stats: InspectionStats; 
  condition: Condition;
  aiInsight: AIInsight | null;
  corrosionPatches: SegmentBox[];
  ndPatches: SegmentBox[];
  // Elbow specific
  elbowStartLength?: number;
  elbowAngle?: ElbowAngle;
  elbowRadiusType?: ElbowRadiusType;
}


// Reporting Types
export interface ReportMetadata {
  companyName: string;
  projectName: string;
  assetName: string;
  scanDate?: Date;
  reportDate?: Date;
  area: string;
  operatorName: string;
  remarks: string;
  defectThreshold: number;
}
