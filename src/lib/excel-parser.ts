
import * as XLSX from 'xlsx';
import type { InspectionDataPoint } from './types';

export interface ParsedExcelResult {
  metadata: any[][];
  data: InspectionDataPoint[];
}

export function parseExcel(file: ArrayBuffer): ParsedExcelResult {
  const workbook = XLSX.read(file, { type: 'array' });

  // 1. Parse Metadata
  const metadataSheetName = workbook.SheetNames[0]; // Assuming first sheet is 'Metadata'
  if (!metadataSheetName) {
    throw new Error("Could not find 'Metadata' sheet in the Excel file.");
  }
  const metadataSheet = workbook.Sheets[metadataSheetName];
  const metadata = XLSX.utils.sheet_to_json<any[]>(metadataSheet, { header: 1 });

  // 2. Parse Thickness Data
  const dataSheetName = workbook.SheetNames[1]; // Assuming second sheet is 'Thickness Data'
  if (!dataSheetName) {
    throw new Error("Could not find 'Thickness Data' sheet in the Excel file.");
  }
  const dataSheet = workbook.Sheets[dataSheetName];
  const rawData = XLSX.utils.sheet_to_json<{ x: number; y: number; thickness: number | string }>(dataSheet);
  
  const data: InspectionDataPoint[] = rawData.map(row => {
    const thickness = typeof row.thickness === 'string' 
      ? parseFloat(row.thickness) 
      : row.thickness;
      
    return {
      x: row.x,
      y: row.y,
      thickness: (row.thickness === null || row.thickness === '' || isNaN(thickness)) ? null : thickness,
      deviation: null,
      percentage: null,
      wallLoss: null,
    };
  });

  return {
    metadata,
    data,
  };
}
