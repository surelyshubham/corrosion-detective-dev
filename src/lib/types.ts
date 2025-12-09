

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
}

export type Condition = 'Healthy' | 'Moderate' | 'Severe' | 'Critical' | 'N/A';

export interface AIInsight {
  condition: string;
  recommendation: string;
}

export type SeverityTier = 'Critical' | 'Severe' | 'Moderate' | 'Normal';

export interface SegmentBox {
  id: number;
  tier: SeverityTier;
  pointCount: number;
  worstThickness: number;
  avgThickness: number;
  severityScore: number;
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
  // NEW fields for multi-view reporting
  isoViewDataUrl?: string;
  topViewDataUrl?: string;
  sideViewDataUrl?: string;
  heatmapDataUrl?: string;
  aiObservation?: string;
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
};

export interface MergedCell {
  plateId: string | null;
  rawThickness: number | null;
  effectiveThickness: number | null;
  percentage: number | null;
}

export type MergedGrid = MergedCell[][]; // [y][x]

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
  segments: SegmentBox[];
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
}
