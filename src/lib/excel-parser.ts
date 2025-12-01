import * as XLSX from 'xlsx';
import type { InspectionDataPoint } from './types';

export interface ParsedExcelData {
  metadata: any[][];
  data: InspectionDataPoint[];
}

export const parseExcel = (arrayBuffer: ArrayBuffer): ParsedExcelData => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // 1. Parse Metadata (Sheet 1)
  const metadataSheetName = workbook.SheetNames[0];
  const metadataSheet = workbook.Sheets[metadataSheetName];
  const metadata = XLSX.utils.sheet_to_json<any[]>(metadataSheet, { header: 1 });

  // 2. Parse Thickness Data (Sheet 2)
  const dataSheetName = workbook.SheetNames[1];
  const dataSheet = workbook.Sheets[dataSheetName];
  const thicknessDataRaw = XLSX.utils.sheet_to_json<{ x: any; y: any; thickness: any }>(dataSheet);

  const data: InspectionDataPoint[] = thicknessDataRaw.map(row => {
    const x = parseInt(row.x, 10);
    const y = parseInt(row.y, 10);
    
    let thickness: number | null = null;
    const rawThickness = row.thickness;

    if (rawThickness !== undefined && rawThickness !== null && String(rawThickness).trim().toUpperCase() !== 'ND' && String(rawThickness).trim() !== '' && !isNaN(Number(rawThickness))) {
      thickness = Number(rawThickness);
    }

    return {
      x,
      y,
      thickness,
      deviation: null,
      percentage: null,
      wallLoss: null,
    };
  }).filter(point => !isNaN(point.x) && !isNaN(point.y));

  return { metadata, data };
};
