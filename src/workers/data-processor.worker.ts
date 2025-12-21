
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
    width: number;
    height: number;
    name: string;
    config: ProcessConfig;
    mergeConfig: MergeFormValues | null;
    detectedNominal: number | null;
}


interface MasterGrid {
    points: GridCell[][];
    width: number;
    height: number;
    minXmm: number;
    maxXmm: number;
    resolutionX: number;
    yResolution: number;
    baseConfig: ProcessConfig;
}

const MICRO_PATCH_THRESHOLD = 10; // points
let STAGED_PLATES: PlateData[] = [];
let FINAL_GRID: MergedGrid | null = null;
let FINAL_STATS: InspectionStats | null = null;
let FINAL_CONDITION: Condition | null = null;

// Pure function to parse an Excel file into a structured PlateData object
function parseFileToPlateData(fileBuffer: ArrayBuffer, fileName: string, config: ProcessConfig, mergeConfig: MergeFormValues | null): PlateData {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in the Excel file.");
  
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  
  let headerRowIndex = -1;
  let detectedNominal: number | null = null;
  let indexStart = 0;
  let indexResolution = 1;

  // Find header and metadata
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    
    if (headerRowIndex === -1) {
        let numberCount = 0;
        let validCells = 0;
        for (let j = 1; j < row.length; j++) {
            const cellVal = row[j];
            if (cellVal !== '' && cellVal !== null) {
                validCells++;
                if (!isNaN(parseFloat(String(cellVal)))) numberCount++;
            }
        }
        if (validCells > 5 && (numberCount / validCells) > 0.8) {
            headerRowIndex = i;
        }
    }

    let keyRaw = row[0] ? String(row[0]).trim() : '';
    let valRaw = row[1] ? String(row[1]).trim() : '';
    if (keyRaw.includes('=')) {
        const parts = keyRaw.split('=');
        keyRaw = parts[0].trim();
        valRaw = parts.slice(1).join('=').trim();
    }
    const key = keyRaw.toLowerCase();
    const valNum = parseFloat(valRaw);
    if (!isNaN(valNum)) {
        if (key.includes('nominal thickness')) detectedNominal = valNum;
        if (key.includes('indexstart')) indexStart = valNum;
        if (key.includes('index resol')) indexResolution = valNum;
    }
  }

  if (headerRowIndex === -1) throw new Error(`Could not detect Header Row in ${fileName}.`);

  const headerRow = rows[headerRowIndex];
  const xCoords = headerRow.slice(1).map(val => parseFloat(String(val).trim()));

  const platePoints: GridCell[][] = [];
  let minXmm = indexStart;
  let maxXmm = indexStart + (xCoords.length - 1) * indexResolution;
  
  const dataRows = rows.slice(headerRowIndex + 1).filter(row => row && !isNaN(parseFloat(String(row[0]))));
  const yCoords = dataRows.map(row => parseFloat(String(row[0]).trim()));
  const yResolution = yCoords.length > 1 ? yCoords[1] - yCoords[0] : 1;

  for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const yMm = yCoords[r];
      const gridRow: GridCell[] = [];
      for (let c = 0; c < xCoords.length; c++) {
          const localXIndex = xCoords[c];
          const rawValue = String(row[c + 1]).trim();
          const rawThickness = (rawValue === '' || rawValue === '---' || rawValue === 'ND') ? null : parseFloat(rawValue);

          gridRow.push({
              plateId: fileName, rawThickness, xMm: localXIndex, yMm: yMm, isND: rawThickness === null || isNaN(rawThickness),
              effectiveThickness: null, percentage: null,
          });
      }
      platePoints.push(gridRow);
  }

  return {
      points: platePoints,
      width: platePoints[0]?.length || 0,
      height: platePoints.length,
      minXmm, maxXmm, resolutionX: indexResolution, yResolution,
      name: fileName, config, mergeConfig, detectedNominal,
  };
}


function injectNDColumns(grid: MasterGrid, count: number) {
    if (count <= 0) return;
    for (let y = 0; y < grid.height; y++) {
        for (let i = 0; i < count; i++) {
            grid.points[y].push({
                plateId: null, rawThickness: null, effectiveThickness: null, percentage: null,
                isND: true, xMm: 0, yMm: 0 // placeholder coords
            });
        }
    }
    grid.width += count;
}

function injectNDRows(grid: MasterGrid, count: number) {
    if (count <= 0) return;
    const ndRow = Array(grid.width).fill(null).map(() => ({
        plateId: null, rawThickness: null, effectiveThickness: null, percentage: null,
        isND: true, xMm: 0, yMm: 0 // placeholder coords
    }));
    for (let i = 0; i < count; i++) {
        grid.points.push(JSON.parse(JSON.stringify(ndRow)));
    }
    grid.height += count;
}


function appendPlateHorizontally(grid: MasterGrid, plate: PlateData, startColumn: number) {
    const requiredWidth = startColumn + plate.width;
    if (grid.width < requiredWidth) {
        injectNDColumns(grid, requiredWidth - grid.width);
    }
    for (let y = 0; y < plate.height; y++) {
        for (let x = 0; x < plate.width; x++) {
            if (grid.points[y] && grid.points[y][startColumn + x]) {
                grid.points[y][startColumn + x] = plate.points[y][x];
            }
        }
    }
}

function appendPlateVertically(grid: MasterGrid, plate: PlateData, startRow: number) {
    const requiredHeight = startRow + plate.height;
    if (grid.height < requiredHeight) {
        injectNDRows(grid, requiredHeight - grid.height);
    }
    for (let y = 0; y < plate.height; y++) {
        for (let x = 0; x < plate.width; x++) {
            if (grid.points[startRow + y]) {
                 grid.points[startRow + y][x] = plate.points[y][x];
            }
        }
    }
}


function mergePlatesSequentially(plates: PlateData[]): MasterGrid {
    if (plates.length === 0) throw new Error("No plates to merge.");
    const firstPlate = plates[0];
    
    let grid: MasterGrid = {
        points: JSON.parse(JSON.stringify(firstPlate.points)),
        width: firstPlate.width,
        height: firstPlate.height,
        minXmm: firstPlate.minXmm,
        maxXmm: firstPlate.maxXmm,
        resolutionX: firstPlate.resolutionX,
        yResolution: firstPlate.yResolution,
        baseConfig: firstPlate.config,
    };

    for (let i = 1; i < plates.length; i++) {
        const plate = plates[i];
        const mergeConfig = plate.mergeConfig;
        if (!mergeConfig) throw new Error(`Plate ${plate.name} is missing merge configuration.`);

        const start = mergeConfig.start;
        switch (mergeConfig.direction) {
            case 'right': {
                const gap = start - grid.width;
                if(gap > 0) injectNDColumns(grid, gap);
                appendPlateHorizontally(grid, plate, grid.width);
                break;
            }
            case 'bottom': {
                 const gap = start - grid.height;
                if (gap > 0) injectNDRows(grid, gap);
                // Ensure new plate has same width as grid, pad if necessary
                if (plate.width < grid.width) {
                    plate.points.forEach(row => {
                        for(let k=plate.width; k < grid.width; k++) {
                            row.push({plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, isND: true, xMm: 0, yMm: 0});
                        }
                    });
                    plate.width = grid.width;
                }
                appendPlateVertically(grid, plate, grid.height);
                break;
            }
             case 'left': {
                const gap = start - plate.width;
                const newPoints: GridCell[][] = Array(grid.height).fill(0).map(() => []);
                
                // Add new plate
                for (let y = 0; y < plate.height; y++) {
                    for (let x = 0; x < plate.width; x++) {
                        newPoints[y].push(plate.points[y][x]);
                    }
                }
                // Add gap
                if (gap > 0) {
                   for (let y = 0; y < grid.height; y++) {
                        for(let i=0; i<gap; i++) newPoints[y].push({plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, isND: true, xMm: 0, yMm: 0});
                   }
                }
                // Add original grid
                for (let y = 0; y < grid.height; y++) {
                    newPoints[y].push(...grid.points[y]);
                }
                grid.points = newPoints;
                grid.width = newPoints[0].length;
                break;
            }
             case 'top': {
                const gap = start - plate.height;
                const newPoints: GridCell[][] = [];
                 if (plate.width < grid.width) {
                    plate.points.forEach(row => {
                        for(let k=plate.width; k < grid.width; k++) {
                            row.push({plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, isND: true, xMm: 0, yMm: 0});
                        }
                    });
                    plate.width = grid.width;
                }
                // Add new plate rows
                for(let y=0; y<plate.height; y++) newPoints.push(plate.points[y]);
                // Add gap rows
                if (gap > 0) {
                    const ndRow = Array(grid.width).fill(null).map(()=> ({plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, isND: true, xMm: 0, yMm: 0}));
                    for(let i=0; i<gap; i++) newPoints.push(JSON.parse(JSON.stringify(ndRow)));
                }
                // Add original grid
                newPoints.push(...grid.points);
                grid.points = newPoints;
                grid.height = newPoints.length;
                break;
            }
        }
    }
    
    return grid;
}


// Re-implementation of getNormalizedColor without THREE.js
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getNormalizedColor(normalizedPercent: number | null): [number, number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128, 255];
    const p = Math.max(0, Math.min(1, normalizedPercent));
    const hue = (240 * (1 - p)) / 360; // Convert hue to 0-1 range for HSL
    const [r, g, b] = hslToRgb(hue, 1.0, 0.5);
    return [r, g, b, 255];
}


function computeStats(grid: MergedGrid, nominalInput: number) {
    const nominal = Number(nominalInput) || 0;
    let minThickness = Infinity, maxThickness = -Infinity, sumThickness = 0;
    let validPointsCount = 0, countND = 0, areaBelow80 = 0, areaBelow70 = 0, areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0, value: 0 }, bestLocation = { x: 0, y: 0, value: 0 };
    const height = grid.length, width = grid[0]?.length || 0;

    const firstValidCell = grid[0]?.find(c => c !== null);
    const yResolution = grid.length > 1 && grid[0][0] && grid[1][0] ? Math.abs(grid[1][0].yMm - grid[0][0].yMm) : 1;
    const xResolution = width > 1 && grid[0][0] && grid[0][1] ? Math.abs(grid[0][1].xMm - grid[0][0].xMm) : 1;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (!cell || cell.isND) {
                if (cell && cell.plateId) countND++;
                continue;
            }
            if (cell.effectiveThickness === null || !isFinite(cell.effectiveThickness)) continue;

            const value = cell.effectiveThickness;
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
            const p = cell.percentage ?? 100;
            if (p < 80) areaBelow80++;
            if (p < 70) areaBelow70++;
            if (p < 60) areaBelow60++;
        }
    }
    
    minThickness = isFinite(minThickness) ? minThickness : 0;
    maxThickness = isFinite(maxThickness) ? maxThickness : 0;
    const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
    const minPercentage = nominal > 0 ? (minThickness / nominal) * 100 : 0;
    const scannedCells = validPointsCount + countND;
    const scannedAreaM2 = (scannedCells * xResolution * yResolution) / 1_000_000;

    const stats: InspectionStats = {
        minThickness, maxThickness, avgThickness,
        minPercentage: isFinite(minPercentage) ? minPercentage : 0,
        areaBelow80: validPointsCount > 0 ? (areaBelow80 / validPointsCount) * 100 : 0,
        areaBelow70: validPointsCount > 0 ? (areaBelow70 / validPointsCount) * 100 : 0,
        areaBelow60: validPointsCount > 0 ? (areaBelow60 / validPointsCount) * 100 : 0,
        countND, totalPoints: height * width,
        worstLocation, bestLocation,
        gridSize: { width, height },
        scannedArea: scannedAreaM2,
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

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = rawMergedGrid[y][x];
             if (!cell) {
                finalGrid[y][x] = { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null, isND: true, xMm: 0, yMm: 0 };
                continue;
             };

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
            finalGrid[y][x] = { ...cell, effectiveThickness, percentage };
        }
    }
    return finalGrid;
}

function createBuffers(grid: MergedGrid, min: number, max: number) {
    const height = grid.length, width = grid[0]?.length || 0;
    const displacementBuffer = new Float32Array(width * height);
    const colorBuffer = new Uint8Array(width * height * 4);
    const colorRange = max - min;

     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const flippedY = height - 1 - y;
            const index = y * width + x;
            const cell = grid[flippedY][x]; 
            
            displacementBuffer[index] = cell?.effectiveThickness ?? 0;
            const normalizedColorValue = cell && cell.effectiveThickness !== null && colorRange > 0 
                ? (cell.effectiveThickness - min) / colorRange 
                : null;
            
            const rgba = getNormalizedColor(normalizedColorValue);
            colorBuffer.set(rgba, index * 4);
        }
    }
    return { displacementBuffer, colorBuffer };
}

function evaluatePatchRepresentation(patch: Omit<SegmentBox, 'representation'>, kind: PatchKind): PatchRepresentation {
    if (kind === 'NON_INSPECTED') return 'TABLE_ONLY';
    if (patch.pointCount < MICRO_PATCH_THRESHOLD) return 'TABLE_ONLY';
    return 'IMAGE';
}

async function generatePatchHeatmap(grid: MergedGrid, patch: SegmentBox): Promise<string> {
    const { xMin, xMax, yMin, yMax } = patch.coordinates;
    const patchWidth = xMax - xMin + 1;
    const patchHeight = yMax - yMin + 1;
    
    if (typeof OffscreenCanvas === 'undefined') return Promise.resolve('');
    
    const canvas = new OffscreenCanvas(patchWidth, patchHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve('');
    const imageData = ctx.createImageData(patchWidth, patchHeight);

    let minThick = Infinity, maxThick = -Infinity;
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
            imageData.data.set(rgba, (y * patchWidth + x) * 4);
        }
    }
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}


async function segmentAndAnalyze(grid: MergedGrid, nominalInput: number, threshold: number): Promise<SegmentBox[]> {
    const nominal = Number(nominalInput) || 0;
    const height = grid.length, width = grid[0]?.length || 0;
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const segments: SegmentBox[] = [];
    let segmentIdCounter = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (visited[y][x]) continue;
            const cell = grid[y][x];
            if (!cell || cell.isND || (cell.percentage ?? 100) >= threshold) continue;

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
                        if (neighbor && !neighbor.isND && (neighbor.percentage ?? 100) < threshold) {
                            visited[ny][nx] = true;
                            queue.push([nx, ny]);
                        }
                    }
                });
            }
            
            if (points.length > 0) {
                const worstPct = nominal > 0 ? (minThick / nominal) * 100 : 0;
                let tier: SeverityTier = worstPct < 60 ? 'Critical' : worstPct < 70 ? 'Severe' : 'Moderate';
                
                const partialPatch = {
                    id: segmentIdCounter++,
                    kind: 'CORROSION' as PatchKind,
                    tier, pointCount: points.length,
                    worstThickness: minThick, avgThickness: sumThick / points.length,
                    severityScore: (1 - minThick / nominal) * points.length,
                    coordinates: { xMin, xMax, yMin, yMax },
                    center: { x: Math.round(xMin + (xMax - xMin) / 2), y: Math.round(yMin + (yMax - yMin) / 2) }
                };
                const representation = evaluatePatchRepresentation(partialPatch, 'CORROSION');
                const fullPatch: SegmentBox = { ...partialPatch, representation };

                if (representation === 'IMAGE') {
                   fullPatch.heatmapDataUrl = await generatePatchHeatmap(grid, fullPatch);
                } else {
                   fullPatch.cells = points.map(p => ({ x: p.x, y: p.y, xMm: p.cell.xMm, yMm: p.cell.yMm, rawThickness: p.cell.rawThickness, effectiveThickness: p.cell.effectiveThickness }));
                }
                segments.push(fullPatch);
            }
        }
    }
    return segments.sort((a, b) => (a.worstThickness ?? Infinity) - (b.worstThickness ?? Infinity));
}

function segmentNonInspected(grid: MergedGrid): SegmentBox[] {
    const height = grid.length, width = grid[0]?.length || 0;
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const ndPatches: SegmentBox[] = [];
    let patchId = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (visited[y][x] || !grid[y][x]?.isND) continue;
            const queue: [number, number][] = [[x, y]];
            visited[y][x] = true;
            let xMin = x, xMax = x, yMin = y, yMax = y, count = 0;
            while (queue.length) {
                const [cx, cy] = queue.shift()!;
                count++;
                xMin = Math.min(xMin, cx); xMax = Math.max(xMax, cx);
                yMin = Math.min(yMin, cy); yMax = Math.max(yMax, cy);
                [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height && !visited[ny][nx] && grid[ny][nx]?.isND) {
                        visited[ny][nx] = true;
                        queue.push([nx, ny]);
                    }
                });
            }
            ndPatches.push({
                id: patchId++, kind: 'NON_INSPECTED', pointCount: count,
                coordinates: { xMin, xMax, yMin, yMax },
                center: { x: Math.round(xMin + (xMax - xMin) / 2), y: Math.round(yMin + (yMax - yMin) / 2) },
                representation: 'TABLE_ONLY', reason: 'Gap between plates or unscanned region'
            });
        }
    }
    return ndPatches.sort((a, b) => b.pointCount - a.pointCount);
}

// Main message handler
self.onmessage = async (event: MessageEvent<any>) => {
    const { type, ...payload } = event.data;
    try {
        if (type === 'RESET') {
            STAGED_PLATES = [];
            FINAL_GRID = null;
            return;
        }

        if (type === 'ADD_FILE') {
            const { file, config, mergeConfig } = payload;
            const plateData = parseFileToPlateData(file.buffer, file.name, config, mergeConfig);
            
            // Handle thickness conflicts
            if (STAGED_PLATES.length > 0 && plateData.detectedNominal) {
                const baseNominal = STAGED_PLATES[0].config.nominalThickness;
                if (Math.abs(plateData.detectedNominal - Number(baseNominal)) > 0.01) {
                     self.postMessage({ type: 'THICKNESS_CONFLICT', conflict: {
                        fileName: file.name, fileBuffer: file.buffer,
                        originalThickness: baseNominal,
                        conflictingThickness: plateData.detectedNominal,
                        mergeConfig: mergeConfig,
                    }}, [file.buffer]);
                    return;
                }
            }

            STAGED_PLATES.push(plateData);
            const tempMaster = mergePlatesSequentially(STAGED_PLATES);
            self.postMessage({ type: 'STAGED', dimensions: { width: tempMaster.width, height: tempMaster.height }});
            return;
        }

        if (type === 'RESOLVE_CONFLICT_AND_ADD') {
             const { file, config, mergeConfig, resolution } = payload;
             if (resolution.type === 'useNew' && resolution.value) {
                STAGED_PLATES.forEach(p => p.config.nominalThickness = resolution.value);
             } else if (resolution.type === 'useCustom' && resolution.value) {
                STAGED_PLATES.forEach(p => p.config.nominalThickness = resolution.value);
             }
             const plateData = parseFileToPlateData(file.buffer, file.name, config, mergeConfig);
             STAGED_PLATES.push(plateData);
             const tempMaster = mergePlatesSequentially(STAGED_PLATES);
             self.postMessage({ type: 'STAGED', dimensions: { width: tempMaster.width, height: tempMaster.height }});
             return;
        }

        if (type === 'FINALIZE') {
            self.postMessage({ type: 'PROGRESS', progress: 10, message: 'Merging plates...' });
            if(STAGED_PLATES.length === 0) throw new Error("No files staged to finalize.");
            
            const mergedMasterGrid = mergePlatesSequentially(STAGED_PLATES);
            const nominalThickness = mergedMasterGrid.baseConfig.nominalThickness;

            self.postMessage({ type: 'PROGRESS', progress: 30, message: 'Creating final grid...' });
            FINAL_GRID = createFinalGrid(mergedMasterGrid.points, nominalThickness);

            self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Computing statistics...' });
            const { stats, condition } = computeStats(FINAL_GRID, nominalThickness);
            FINAL_STATS = stats;
            FINAL_CONDITION = condition;

            self.postMessage({ type: 'PROGRESS', progress: 70, message: 'Analyzing patches...' });
            const corrosionPatches = await segmentAndAnalyze(FINAL_GRID, nominalThickness, payload.threshold);
            const ndPatches = segmentNonInspected(FINAL_GRID);

            self.postMessage({ type: 'PROGRESS', progress: 90, message: 'Generating buffers...' });
            const { displacementBuffer, colorBuffer } = createBuffers(FINAL_GRID, stats.minThickness, stats.maxThickness);
            
            const platesForStore = STAGED_PLATES.map(p => ({ id: p.name, fileName: p.name, ...p.config, rawGridData:[], processedData:[], stats:{} as InspectionStats, metadata:[] } as Plate));
            
            self.postMessage({
                type: 'FINALIZED', displacementBuffer, colorBuffer,
                gridMatrix: FINAL_GRID, stats, condition, plates: platesForStore, corrosionPatches, ndPatches,
            }, [displacementBuffer.buffer, colorBuffer.buffer]);
            return;
        }

        if (type === 'RESEGMENT') {
             if (!FINAL_GRID || !FINAL_STATS) throw new Error("Cannot resegment: data not finalized.");
             self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Re-analyzing patches...' });
             const corrosionPatches = await segmentAndAnalyze(FINAL_GRID, FINAL_STATS.nominalThickness!, payload.threshold);
             const ndPatches = segmentNonInspected(FINAL_GRID);
             self.postMessage({ type: 'SEGMENTS_UPDATED', corrosionPatches, ndPatches });
             return;
        }

    } catch (error: any) {
        console.error("Worker CRASH:", error);
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

// Required to be a module
export {};
