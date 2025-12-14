
import * as XLSX from 'xlsx';
import type { MergedGrid, InspectionStats, Condition, Plate, AssetType, SegmentBox, SeverityTier, PatchKind, GridCell, PatchRepresentation } from '../lib/types';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { type ProcessConfig } from '@/store/use-inspection-store';

export interface ThicknessConflict {
    fileName: string;
    fileBuffer: ArrayBuffer;
    originalThickness: number;
    conflictingThickness: number;
    mergeConfig: MergeFormValues;
}

interface PlateData {
    points: GridCell[][];
    minXmm: number;
    maxXmm: number;
    resolutionX: number;
    yResolution: number;
}

interface MasterGrid {
    points: GridCell[][];
    width: number;
    height: number;
    plates: { name: string; config: ProcessConfig; mergeConfig: MergeFormValues | null; detectedNominal: number | null }[];
    baseConfig: ProcessConfig;
    minXmm: number;
    maxXmm: number;
    resolutionX: number;
    yResolution: number;
}

const MICRO_PATCH_THRESHOLD = 10; // points
let MASTER_GRID: MasterGrid | null = null;
let FINAL_GRID: MergedGrid | null = null;

function universalParse(fileBuffer: ArrayBuffer, fileName: string): {rows: any[][], detectedNominal: number | null, indexStart: number, indexResolution: number} {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
      throw new Error("No sheets found in the Excel file.");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 100); i++) { 
    const row = rows[i];
    if (!row || row.length < 2) continue;
    let numberCount = 0;
    let validCells = 0;
    for (let j = 1; j < row.length; j++) {
      const cellVal = row[j];
      if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
        validCells++;
        const num = parseFloat(String(cellVal).trim());
        if (!isNaN(num) && isFinite(num)) {
          numberCount++;
        }
      }
    }
    if (validCells > 5 && (numberCount / validCells) > 0.8) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect Header Row. Please check file format.");
  }

  let detectedNominalThickness: number | null = null;
  let maxThicknessValue: number | null = null;
  let indexStart = 0;
  let indexResolution = 1;
  
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    if (!row) continue;
    
    let keyRaw = row[0] ? String(row[0]) : '';
    let valRaw = row[1] ? String(row[1]) : '';
    
    if (keyRaw.includes('=')) {
      const parts = keyRaw.split('=');
      keyRaw = parts[0].trim();
      valRaw = parts.slice(1).join('=').trim();
    } else {
        keyRaw = keyRaw.trim();
        valRaw = valRaw.trim();
    }

    const key = keyRaw.toLowerCase();
    const valStr = valRaw.trim();
    const valNum = parseFloat(valStr);

    if (key) {
        if (key.includes('nominal thickness') && !isNaN(valNum)) detectedNominalThickness = valNum;
        if (key.includes('max thickness') && !isNaN(valNum)) maxThicknessValue = valNum;
        if (key.includes('indexstart') && !isNaN(valNum)) indexStart = valNum;
        if (key.includes('index resol') && !isNaN(valNum)) indexResolution = valNum;
    }
  }
  
  if (detectedNominalThickness === null) detectedNominalThickness = maxThicknessValue;

  return { rows, detectedNominal: detectedNominalThickness, indexStart, indexResolution };
}

function getNormalizedColor(normalizedPercent: number | null): [number, number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128, 255]; // Grey for ND
    const p = Math.max(0, Math.min(1, normalizedPercent));
    const hue = 240 * (1 - p); 
    const saturation = 1;
    const value = 1;
    let r=0, g=0, b=0;
    const i = Math.floor(hue / 60);
    const f = hue / 60 - i;
    const p1 = value * (1 - saturation);
    const p2 = value * (1 - f * saturation);
    const p3 = value * (1 - (1 - f) * saturation);
    switch (i % 6) {
        case 0: r = value; g = p3; b = p1; break;
        case 1: r = p2; g = value; b = p1; break;
        case 2: r = p1; g = value; b = p3; break;
        case 3: r = p1; g = p2; b = value; break;
        case 4: r = p3; g = p1; b = value; break;
        case 5: r = value; g = p1; b = p2; break;
    }
    return [r * 255, g * 255, b * 255, 255];
}

function computeStats(grid: MergedGrid, nominalInput: number) {
    const nominal = Number(nominalInput) || 0;
    let minThickness = Infinity, maxThickness = -Infinity, sumThickness = 0;
    let validPointsCount = 0, countND = 0, areaBelow80 = 0, areaBelow70 = 0, areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0, value: 0 }, bestLocation = { x: 0, y: 0, value: 0 };
    const height = grid.length, width = grid[0]?.length || 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (!cell || cell.isND || cell.effectiveThickness === null) {
                if (cell && cell.plateId) countND++;
                continue;
            }
            const value = cell.effectiveThickness;
            if (!isFinite(value)) continue;

            validPointsCount++;
            sumThickness += value;
            if (value < minThickness) {
                minThickness = value;
                worstLocation = { x, y, value };
            }
            if (value > maxThickness) {
                maxThickness = value;
                bestLocation = { x, y, value };
            }
            
            const nominalPercentage = nominal > 0 ? (value / nominal) * 100 : 0;
            if (nominalPercentage < 80) areaBelow80++;
            if (nominalPercentage < 70) areaBelow70++;
            if (nominalPercentage < 60) areaBelow60++;
        }
    }
    
    minThickness = isFinite(minThickness) ? minThickness : 0;
    maxThickness = isFinite(maxThickness) ? maxThickness : 0;
    
    const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
    const minPercentage = nominal > 0 ? (minThickness / nominal) * 100 : 0;
    const totalScannedPoints = validPointsCount + countND;

    const stats: InspectionStats = {
        minThickness, maxThickness, avgThickness,
        minPercentage: isFinite(minPercentage) ? minPercentage : 0,
        areaBelow80: totalScannedPoints > 0 ? (areaBelow80 / totalScannedPoints) * 100 : 0,
        areaBelow70: totalScannedPoints > 0 ? (areaBelow70 / totalScannedPoints) * 100 : 0,
        areaBelow60: totalScannedPoints > 0 ? (areaBelow60 / totalScannedPoints) * 100 : 0,
        countND, totalPoints: height * width,
        worstLocation, bestLocation,
        gridSize: { width, height },
        scannedArea: totalScannedPoints / 1_000_000,
    };
    
    let condition: Condition = 'N/A';
    if (isFinite(stats.minPercentage) && validPointsCount > 0) {
        if (stats.minPercentage >= 95) condition = 'Healthy';
        else if (stats.minPercentage >= 80) condition = 'Moderate';
        else if (stats.minPercentage >= 60) condition = 'Severe';
        else condition = 'Critical';
    }

    return { stats: { ...stats, nominalThickness: nominal }, condition };
}

function createFinalGrid(rawMergedGrid: GridCell[][], nominalInput: number): MergedGrid {
    const nominal = Number(nominalInput) || 0;
    const height = rawMergedGrid.length;
    const width = rawMergedGrid[0]?.length || 0;
    const finalGrid: MergedGrid = Array(height).fill(null).map(() => Array(width).fill(null));

    let minThick = Infinity;
    let maxThick = -Infinity;
     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = rawMergedGrid[y][x];
            if (cell && !cell.isND && cell.rawThickness !== null && cell.rawThickness > 0) {
                const effectiveThickness = Math.min(cell.rawThickness, nominal);
                if(effectiveThickness < minThick) minThick = effectiveThickness;
                if(effectiveThickness > maxThick) maxThick = effectiveThickness;
            }
        }
    }
    minThick = isFinite(minThick) ? minThick : 0;
    maxThick = isFinite(maxThick) ? maxThick : 0;
    const range = maxThick - minThick;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = rawMergedGrid[y][x];
             if (!cell) continue;

            if (cell.isND) {
                finalGrid[y][x] = { ...cell, effectiveThickness: null, percentage: null };
                continue;
            }

            let effectiveThickness: number | null = null;
            let percentage: number | null = null;
            
            if (cell.rawThickness !== null && cell.rawThickness > 0) {
                effectiveThickness = Math.min(cell.rawThickness, nominal);
                if (nominal > 0) {
                    percentage = (effectiveThickness / nominal) * 100;
                }
            }
            finalGrid[y][x] = {
                ...cell,
                effectiveThickness, 
                percentage
            };
        }
    }
    return finalGrid;
}

function createBuffers(grid: MergedGrid, nominal: number, min: number, max: number) {
    const height = grid.length, width = grid[0]?.length || 0;
    const displacementBuffer = new Float32Array(width * height);
    const colorBuffer = new Uint8Array(width * height * 4);
    const colorRange = max - min;

     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const flippedY = height - 1 - y;
            const index = y * width + x;
            const cell = grid[flippedY][x]; 
            
            let displacementValue = 0;
            if (cell && cell.effectiveThickness !== null) {
                displacementValue = cell.effectiveThickness;
            }
            displacementBuffer[index] = isFinite(displacementValue) ? displacementValue : 0;

            const normalizedColorValue = cell && cell.effectiveThickness !== null && colorRange > 0 
                ? (cell.effectiveThickness - min) / colorRange 
                : null;
            
            const rgba = getNormalizedColor(normalizedColorValue);
            const colorIndex = index * 4;
            [colorBuffer[colorIndex], colorBuffer[colorIndex + 1], colorBuffer[colorIndex + 2], colorBuffer[colorIndex + 3]] = rgba;
        }
    }
    return { displacementBuffer, colorBuffer };
}

function parseFileToGrid(rows: any[][], fileName: string, indexStart: number, indexResolution: number): PlateData {
    let headerRow = -1;

    for (let i = 0; i < Math.min(rows.length, 100); i++) { 
        const row = rows[i];
        if (!row || row.length < 2) continue;
        let numberCount = 0, validCells = 0;
        for (let j = 1; j < row.length; j++) {
            const cellVal = row[j];
            if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
                validCells++;
                const num = parseFloat(String(cellVal).trim());
                if (!isNaN(num) && isFinite(num)) numberCount++;
            }
        }
        if (validCells > 5 && (numberCount / validCells) > 0.8) {
            headerRow = i;
            break;
        }
    }
    if (headerRow === -1) throw new Error(`Could not find a valid header row in ${fileName}.`);
    
    const headerRowData = rows[headerRow];
    const xCoords: (number | null)[] = [];
    for (let j = 1; j < headerRowData.length; j++) {
        const val = parseFloat(String(headerRowData[j]).trim());
        xCoords.push(!isNaN(val) && isFinite(val) ? val : null);
    }
    
    const yCoords: number[] = [];
    const dataRows: any[][] = [];
     for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || (row.length < 2 && (row[0] === '' || row[0] === undefined)) || isNaN(parseFloat(String(row[0])))) continue;
        const yVal = parseFloat(String(row[0]).trim());
        yCoords.push(yVal);
        dataRows.push(row);
    }
    const yResolution = yCoords.length > 1 ? yCoords[1] - yCoords[0] : 1;


    const dataGrid: GridCell[][] = [];
    let minX = Infinity;
    let maxX = -Infinity;

    for(let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        const yMm = yCoords[r];
        const gridRow: GridCell[] = [];

        for (let c = 1; c < row.length; c++) {
            const xIndex = c - 1;
            const xCoord = xCoords[xIndex];
            if(xCoord === null) continue;

            const xMm = indexStart + xCoord * indexResolution;
            minX = Math.min(minX, xMm);
            maxX = Math.max(maxX, xMm);
            
            let rawValue = String(row[c]).trim();
            if (rawValue === '---' || rawValue === 'ND' || rawValue === '' || rawValue.toLowerCase().includes('n/a')) {
                rawValue = '';
            }
            const num = parseFloat(rawValue);
            const rawThickness = isNaN(num) || !isFinite(num) ? null : num;

            gridRow.push({ 
                plateId: fileName, 
                rawThickness,
                effectiveThickness: null,
                percentage: null,
                isND: rawThickness === null,
                xMm,
                yMm
            });
        }
        dataGrid.push(gridRow);
    }
    
    return { points: dataGrid, minXmm: minX, maxXmm: maxX, resolutionX: indexResolution, yResolution };
}

function generatePatchHeatmap(grid: MergedGrid, patch: SegmentBox): Promise<string> {
    const { xMin, xMax, yMin, yMax } = patch.coordinates;
    const patchWidth = xMax - xMin + 1;
    const patchHeight = yMax - yMin + 1;
    const canvas = new OffscreenCanvas(patchWidth, patchHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve('');
    const imageData = ctx.createImageData(patchWidth, patchHeight);

    let minThick = Infinity;
    let maxThick = -Infinity;
    for (let y = yMin; y <= yMax; y++) {
        for (let x = xMin; x <= xMax; x++) {
            const cell = grid[y]?.[x];
            if(cell && !cell.isND && cell.effectiveThickness !== null) {
                minThick = Math.min(minThick, cell.effectiveThickness);
                maxThick = Math.max(maxThick, cell.effectiveThickness);
            }
        }
    }
    const colorRange = maxThick - minThick;

    for (let y = 0; y < patchHeight; y++) {
        for (let x = 0; x < patchWidth; x++) {
            const gridX = xMin + x, gridY = yMin + y;
            const cell = grid[gridY]?.[gridX];
            const normalizedColorValue = cell && !cell.isND && cell.effectiveThickness !== null && colorRange > 0 ? (cell.effectiveThickness - minThick) / colorRange : null;
            const rgba = getNormalizedColor(normalizedColorValue);
            const index = (y * patchWidth + x) * 4;
            imageData.data.set(rgba, index);
        }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' }).then(blob => new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    }));
}

function evaluatePatchRepresentation(patch: Omit<SegmentBox, 'representation'>, kind: PatchKind): PatchRepresentation {
    if (kind === 'NON_INSPECTED') {
        return 'TABLE_ONLY';
    }
    if (patch.pointCount < MICRO_PATCH_THRESHOLD) {
        return 'TABLE_ONLY';
    }
    return 'IMAGE';
}


async function segmentAndAnalyze(grid: MergedGrid, nominalInput: number, threshold: number): Promise<SegmentBox[]> {
    const nominal = Number(nominalInput) || 0;
    const height = grid.length, width = grid[0]?.length || 0;
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const segments: SegmentBox[] = [];
    let segmentIdCounter = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (!cell || cell.isND || visited[y][x]) continue;

            const percentage = cell.percentage ?? 100;
            
            if (percentage < threshold) {
                const points: {x: number, y: number, cell: GridCell}[] = [];
                const queue: [number, number][] = [[x, y]];
                visited[y][x] = true;
                let minThick = Infinity, sumThick = 0, xMin = x, xMax = x, yMin = y, yMax = y;

                while (queue.length > 0) {
                    const [curX, curY] = queue.shift()!;
                    const currentCell = grid[curY][curX];

                    if (currentCell && !currentCell.isND && currentCell.effectiveThickness !== null) {
                        points.push({ x: curX, y: curY, cell: currentCell });
                        minThick = Math.min(minThick, currentCell.effectiveThickness);
                        sumThick += currentCell.effectiveThickness;
                        xMin = Math.min(xMin, curX); xMax = Math.max(xMax, curX);
                        yMin = Math.min(yMin, curY); yMax = Math.max(yMax, curY);
                    }
                    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
                        const nx = curX + dx, ny = curY + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx]) {
                            const neighbor = grid[ny][nx];
                            if (neighbor && !neighbor.isND) {
                                const neighborNominalPct = neighbor.percentage ?? 100;
                                if (neighborNominalPct < threshold) {
                                    visited[ny][nx] = true;
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    });
                }
                
                if (points.length > 0) {
                    const worstPct = nominal > 0 ? (minThick / nominal) * 100 : 0;
                    let tier: SeverityTier = 'Moderate';
                    if (worstPct < 60) tier = 'Critical';
                    else if (worstPct < 70) tier = 'Severe';

                    const partialPatch = {
                        id: segmentIdCounter++,
                        kind: 'CORROSION' as PatchKind,
                        tier, 
                        pointCount: points.length,
                        worstThickness: minThick,
                        avgThickness: sumThick / points.length,
                        severityScore: (1 - minThick / nominal) * points.length,
                        coordinates: { xMin, xMax, yMin, yMax },
                        center: { x: Math.round(xMin + (xMax - xMin) / 2), y: Math.round(yMin + (yMax - yMin) / 2) }
                    };

                    const representation = evaluatePatchRepresentation(partialPatch, 'CORROSION');
                    const fullPatch: SegmentBox = { ...partialPatch, representation };

                    if (representation === 'IMAGE') {
                       fullPatch.heatmapDataUrl = await generatePatchHeatmap(grid, fullPatch);
                    } else {
                       fullPatch.cells = points.map(p => ({ 
                           x: p.x, 
                           y: p.y, 
                           xMm: p.cell.xMm, 
                           yMm: p.cell.yMm, 
                           rawThickness: p.cell.rawThickness, 
                           effectiveThickness: p.cell.effectiveThickness 
                        }));
                    }
                    
                    segments.push(fullPatch);
                }
            }
        }
    }
    
    return segments.sort((a, b) => (a.worstThickness ?? Infinity) - (b.worstThickness ?? Infinity));
}

function segmentNonInspected(grid: MergedGrid): SegmentBox[] {
    const height = grid.length;
    const width = grid[0]?.length || 0;
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const ndPatches: SegmentBox[] = [];
    let patchId = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (!cell || !cell.isND || visited[y][x]) continue;

            const queue: [number, number][] = [[x, y]];
            visited[y][x] = true;
            let xMin = x, xMax = x, yMin = y, yMax = y;
            let count = 0;

            while (queue.length) {
                const [cx, cy] = queue.shift()!;
                count++;
                xMin = Math.min(xMin, cx); xMax = Math.max(xMax, cx);
                yMin = Math.min(yMin, cy); yMax = Math.max(yMax, cy);
                [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height && !visited[ny][nx]) {
                        const nCell = grid[ny][nx];
                        if (nCell && nCell.isND) {
                            visited[ny][nx] = true;
                            queue.push([nx, ny]);
                        }
                    }
                });
            }

            ndPatches.push({
                id: patchId++,
                kind: 'NON_INSPECTED',
                pointCount: count,
                coordinates: { xMin, xMax, yMin, yMax },
                center: { x: Math.round(xMin + (xMax - xMin) / 2), y: Math.round(yMin + (yMax - yMin) / 2) },
                representation: 'TABLE_ONLY',
                reason: 'Gap between plates or unscanned region'
            });
        }
    }
    return ndPatches.sort((a,b) => b.pointCount - a.pointCount);
}

function injectNDGapColumns(
  masterGrid: MasterGrid,
  newPlateStartX: number,
  yResolution: number
) {
  const prevMaxX = masterGrid.maxXmm;
  const step = masterGrid.resolutionX;

  // NO GAP -> DO NOTHING
  if (newPlateStartX <= prevMaxX + step) return;

  // CREATE PHYSICAL ND COLUMNS
  for (let x = prevMaxX + step; x < newPlateStartX; x += step) {
    for (let y = 0; y < masterGrid.height; y++) {
      masterGrid.points[y].push({
        plateId: null,
        rawThickness: null,
        effectiveThickness: null,
        percentage: null,
        xMm: x,
        yMm: y * yResolution,
        isND: true
      });
    }
    masterGrid.width++;
  }
}

async function finalizeProcessing(threshold: number) {
    if (!MASTER_GRID) throw new Error("Cannot finalize: MASTER_GRID is not initialized.");
    self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Processing merged data...' });

    FINAL_GRID = createFinalGrid(MASTER_GRID.points, MASTER_GRID.baseConfig.nominalThickness);
    const { stats, condition } = computeStats(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness);
    self.postMessage({ type: 'PROGRESS', progress: 60, message: 'Analyzing patches...' });
    
    const corrosionPatches = await segmentAndAnalyze(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, threshold);
    self.postMessage({ type: 'PROGRESS', progress: 80, message: 'Generating images...' });

    const ndPatches = segmentNonInspected(FINAL_GRID);
    self.postMessage({ type: 'PROGRESS', progress: 90, message: 'Building tables...' });
    
    const { displacementBuffer, colorBuffer } = createBuffers(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, stats.minThickness, stats.maxThickness);
    
    const plates = MASTER_GRID.plates.map(p => ({
        id: p.name, fileName: p.name, ...p.config
    })) as Plate[];
    
    self.postMessage({
        type: 'FINALIZED', displacementBuffer, colorBuffer,
        gridMatrix: FINAL_GRID, stats, condition, plates, corrosionPatches, ndPatches,
    }, [displacementBuffer.buffer, colorBuffer.buffer]);
}

async function resegment(threshold: number) {
    if (!FINAL_GRID || !MASTER_GRID) throw new Error("Cannot resegment: data not finalized.");
    const corrosionPatches = await segmentAndAnalyze(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, threshold);
    const ndPatches = segmentNonInspected(FINAL_GRID);
    self.postMessage({ type: 'SEGMENTS_UPDATED', corrosionPatches, ndPatches });
}

self.onmessage = async (event: MessageEvent<any>) => {
    const { type, ...payload } = event.data;
    try {
        if (type === 'RESET') {
            MASTER_GRID = null;
            FINAL_GRID = null;
            return;
        }

        if (type === 'INIT') {
            const { file, config } = payload as { file: { name: string, buffer: ArrayBuffer }, config: ProcessConfig };
            self.postMessage({ type: 'PROGRESS' });
            const { rows, detectedNominal, indexStart, indexResolution } = universalParse(file.buffer, file.name);
            const plateData = parseFileToGrid(rows, file.name, indexStart, indexResolution);

            if (plateData.points.length === 0 || plateData.points[0].length === 0) throw new Error("Parsing resulted in empty data grid.");
            
            const finalConfig = { ...config, nominalThickness: Number(detectedNominal ?? config.nominalThickness) };

            MASTER_GRID = {
                points: plateData.points, 
                width: plateData.points[0].length, 
                height: plateData.points.length,
                plates: [{ name: file.name, config: finalConfig, mergeConfig: null, detectedNominal }],
                baseConfig: finalConfig,
                minXmm: plateData.minXmm,
                maxXmm: plateData.maxXmm,
                resolutionX: plateData.resolutionX,
                yResolution: plateData.yResolution
            };
            
            self.postMessage({ type: 'STAGED', dimensions: { width: MASTER_GRID.width, height: MASTER_GRID.height }});
            return;
        }

        if (type === 'MERGE') {
            if (!MASTER_GRID) throw new Error("Cannot merge: Initial file not processed yet.");

            const { file, config, mergeConfig, resolution } = payload;
            self.postMessage({ type: 'PROGRESS' });
            const { rows, detectedNominal, indexStart, indexResolution } = universalParse(file.buffer, file.name);
            
            if (!resolution) {
                if (detectedNominal && Math.abs(detectedNominal - MASTER_GRID.baseConfig.nominalThickness) > 0.01) {
                    self.postMessage({ type: 'THICKNESS_CONFLICT', conflict: {
                        fileName: file.name, fileBuffer: file.buffer,
                        originalThickness: MASTER_GRID.baseConfig.nominalThickness,
                        conflictingThickness: detectedNominal,
                        mergeConfig: mergeConfig,
                    }}, [file.buffer]);
                    return;
                }
            } else {
                if (resolution.type === 'useNew') MASTER_GRID.baseConfig.nominalThickness = Number(detectedNominal ?? MASTER_GRID.baseConfig.nominalThickness);
                else if (resolution.type === 'useCustom') MASTER_GRID.baseConfig.nominalThickness = resolution.value;
            }
            
            const newPlateData = parseFileToGrid(rows, file.name, indexStart, indexResolution);

            // 1. Inject ND gap if it exists
            injectNDGapColumns(MASTER_GRID, newPlateData.minXmm, MASTER_GRID.yResolution);

            // 2. Now merge the new plate
            const targetHeight = Math.max(MASTER_GRID.height, newPlateData.points.length);
            const newPlateWidth = newPlateData.points[0]?.length || 0;
            
            // Resize master grid height if new plate is taller
            if (targetHeight > MASTER_GRID.height) {
                for (let y = MASTER_GRID.height; y < targetHeight; y++) {
                    MASTER_GRID.points.push(Array(MASTER_GRID.width).fill(null).map((_, i) => ({ plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, xMm: MASTER_GRID!.points[0][i].xMm, yMm: y * MASTER_GRID!.yResolution, isND: true })));
                }
                 MASTER_GRID.height = targetHeight;
            }

            // Add new plate columns, resizing height if master is taller
            for (let x = 0; x < newPlateWidth; x++) {
                for (let y = 0; y < targetHeight; y++) {
                     if (y < newPlateData.points.length) {
                        MASTER_GRID.points[y].push(newPlateData.points[y][x]);
                    } else {
                        MASTER_GRID.points[y].push({ plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, xMm: newPlateData.points[0][x].xMm, yMm: y * MASTER_GRID.yResolution, isND: true });
                    }
                }
            }

            MASTER_GRID.width += newPlateWidth;

            // 3. Update master grid's max X coordinate
            MASTER_GRID.maxXmm = Math.max(MASTER_GRID.maxXmm, newPlateData.maxXmm);
            MASTER_GRID.plates.push({ name: file.name, config: MASTER_GRID.baseConfig, mergeConfig, detectedNominal: null });

            self.postMessage({ type: 'STAGED', dimensions: { width: MASTER_GRID.width, height: MASTER_GRID.height }});
            return;
        }

        if (type === 'FINALIZE') await finalizeProcessing(payload.threshold);
        else if (type === 'RESEGMENT') await resegment(payload.threshold);
        
    } catch (error: any) {
        console.error("Worker CRASH:", error);
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

export {};

    