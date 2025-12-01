import type { InspectionDataPoint, InspectionStats, Condition, AssetType } from './types';

interface ProcessDataResult {
  processedData: InspectionDataPoint[];
  stats: InspectionStats;
  condition: Condition;
}

export const processData = (
  data: InspectionDataPoint[],
  nominalThickness: number
): ProcessDataResult => {
  if (data.length === 0) {
    const emptyStats: InspectionStats = {
      minThickness: 0,
      maxThickness: 0,
      avgThickness: 0,
      minPercentage: 0,
      areaBelow80: 0,
      areaBelow70: 0,
      areaBelow60: 0,
      countND: 0,
      totalPoints: 0,
      worstLocation: { x: 0, y: 0 },
      gridSize: { width: 0, height: 0 },
    };
    return { processedData: [], stats: emptyStats, condition: 'N/A' };
  }

  let minThickness = Infinity;
  let maxThickness = -Infinity;
  let sumThickness = 0;
  let validPointsCount = 0;
  let countND = 0;
  let areaBelow80 = 0;
  let areaBelow70 = 0;
  let areaBelow60 = 0;
  let worstLocation = { x: 0, y: 0 };
  let maxX = 0;
  let maxY = 0;

  const processedData = data.map(point => {
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);

    if (point.thickness === null) {
      countND++;
      return { ...point };
    }

    const thickness = point.thickness;
    validPointsCount++;
    sumThickness += thickness;

    if (thickness < minThickness) {
      minThickness = thickness;
      worstLocation = { x: point.x, y: point.y };
    }
    if (thickness > maxThickness) {
      maxThickness = thickness;
    }

    const percentage = (thickness / nominalThickness) * 100;

    if (percentage < 80) areaBelow80++;
    if (percentage < 70) areaBelow70++;
    if (percentage < 60) areaBelow60++;

    return {
      ...point,
      deviation: thickness - nominalThickness,
      percentage: percentage,
      wallLoss: nominalThickness - thickness,
    };
  });
  
  if (validPointsCount === 0) {
      minThickness = 0;
      maxThickness = 0;
  }

  const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
  const minPercentage = (minThickness / nominalThickness) * 100;
  const totalPoints = data.length;

  const stats: InspectionStats = {
    minThickness: minThickness === Infinity ? 0 : minThickness,
    maxThickness: maxThickness === -Infinity ? 0 : maxThickness,
    avgThickness,
    minPercentage: isFinite(minPercentage) ? minPercentage : 0,
    areaBelow80: totalPoints > 0 ? (areaBelow80 / totalPoints) * 100 : 0,
    areaBelow70: totalPoints > 0 ? (areaBelow70 / totalPoints) * 100 : 0,
    areaBelow60: totalPoints > 0 ? (areaBelow60 / totalPoints) * 100 : 0,
    countND,
    totalPoints,
    worstLocation,
    gridSize: { width: maxX + 1, height: maxY + 1 },
  };

  // Condition evaluation
  let condition: Condition;
  if (stats.minPercentage >= 80 && stats.areaBelow80 < 5) {
    condition = 'Healthy';
  } else if (stats.minPercentage >= 70 && stats.areaBelow70 < 10) {
    condition = 'Moderate';
  } else if (stats.minPercentage >= 60) {
    condition = 'Localized';
  } else {
    condition = 'Severe';
  }
  
  if (validPointsCount === 0) {
    condition = 'N/A'
  }

  return { processedData, stats, condition };
};
