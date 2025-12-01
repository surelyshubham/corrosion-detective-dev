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
  thickness: number | null;
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

export type Condition = 'Healthy' | 'Moderate' | 'Localized' | 'Severe' | 'N/A';

export interface AIInsight {
  condition: string;
  recommendation: string;
}

export interface InspectionResult {
  fileName: string;
  assetType: AssetType;
  nominalThickness: number;
  processedData: InspectionDataPoint[];
  stats: InspectionStats;
  condition: Condition;
  metadata: any[][];
  aiInsight: AIInsight | null;
}
