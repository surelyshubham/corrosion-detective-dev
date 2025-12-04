
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
  worstLocation: { x: number; y: number };
  gridSize: { width: number; height: number };
  scannedArea: number;
}

export type Condition = 'Healthy' | 'Moderate' | 'Severe' | 'Critical' | 'N/A';

export interface AIInsight {
  condition: string;
  recommendation: string;
}

// New types for merging
export type Plate = {
  id: string; // Typically the filename
  fileName: string;
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
  // Global stats are calculated from the merged grid
  stats: InspectionStats; 
  condition: Condition;
  aiInsight: AIInsight | null;
}
