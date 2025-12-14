
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
  let minXmm = Infinity, maxXmm = -Infinity;
  
  const dataRows = rows.slice(headerRowIndex + 1).filter(row => row && !isNaN(parseFloat(String(row[0]))));
  const yCoords = dataRows.map(row => parseFloat(String(row[0]).trim()));
  const yResolution = yCoords.length > 1 ? yCoords[1] - yCoords[0] : 1;

  for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const yMm = yCoords[r];
      const gridRow: GridCell[] = [];
      for (let c = 0; c < xCoords.length; c++) {
          const xMm = indexStart + xCoords[c] * indexResolution;
          minXmm = Math.min(minXmm, xMm);
          maxXmm = Math.max(maxXmm, xMm);
          const rawValue = String(row[c + 1]).trim();
          const rawThickness = (rawValue === '' || rawValue === '---' || rawValue === 'ND') ? null : parseFloat(rawValue);

          gridRow.push({
              plateId: fileName, rawThickness, xMm, yMm, isND: rawThickness === null || isNaN(rawThickness),
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

function createEmptyGrid(height: number, yResolution: number): MasterGrid {
    const points: GridCell[][] = [];
    for (let y = 0; y < height; y++) {
        points.push([]);
    }
    return {
        points,
        width: 0,
        height,
        minXmm: 0,
        maxXmm: -Infinity,
        resolutionX: 1, // Default, will be updated by first plate
        yResolution: yResolution,
        baseConfig: {} as ProcessConfig,
    };
}

function appendNDGap(grid: MasterGrid, fromX: number, toX: number) {
    for (let x = fromX; x < toX; x += grid.resolutionX) {
        for (let y = 0; y < grid.height; y++) {
            grid.points[y].push({
                plateId: null, rawThickness: null, effectiveThickness: null, percentage: null,
                xMm: x, yMm: y * grid.yResolution, isND: true
            });
        }
        grid.width++;
    }
}

function appendPlate(grid: MasterGrid, plate: PlateData) {
    for (let col = 0; col < plate.width; col++) {
        for (let y = 0; y < grid.height; y++) {
            // If plate is shorter than grid, fill with ND
            const src = plate.points[y]?.[col];
            if(src) {
                grid.points[y].push({ ...src });
            } else {
                 grid.points[y].push({
                    plateId: null, rawThickness: null, effectiveThickness: null, percentage: null,
                    xMm: plate.points[0][col].xMm, yMm: y * grid.yResolution, isND: true
                });
            }
        }
        grid.width++;
    }
    grid.maxXmm = Math.max(grid.maxXmm, plate.maxXmm);
}

function freezeGrid<T extends { points: any[][] }>(grid: T): T {
    Object.freeze(grid);
    Object.freeze(grid.points);
    grid.points.forEach(r => Object.freeze(r));
    return grid;
}

function mergePlatesSequentially(plates: PlateData[]): MasterGrid {
    if (plates.length === 0) throw new Error("No plates to merge.");

    const maxHeight = Math.max(...plates.map(p => p.height));
    const firstPlate = plates[0];
    const yResolution = firstPlate.yResolution;

    const grid = createEmptyGrid(maxHeight, yResolution);
    grid.resolutionX = firstPlate.resolutionX;
    grid.baseConfig = firstPlate.config;
    
    let currentX = 0;

    for (const plate of plates) {
        const plateStartX = plate.minXmm;
        if (plateStartX > currentX) {
            appendNDGap(grid, currentX, plateStartX);
        }
        appendPlate(grid, plate);
        currentX = plate.maxXmm + grid.resolutionX;
    }
    
    grid.maxXmm = currentX - grid.resolutionX;
    return freezeGrid(grid);
}


// STATS, BUFFERS, AND SEGMENTATION (UNCHANGED LOGIC, OPERATES ON A GRID)

function getNormalizedColor(normalizedPercent: number | null): [number, number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128, 255];
    const p = Math.max(0, Math.min(1, normalizedPercent));
    const hue = 240 * (1 - p);
    const [r, g, b] = new THREE.Color().setHSL(hue / 360, 1.0, 0.5).toArray();
    return [r * 255, g * 255, b * 255, 255];
}

function computeStats(grid: MergedGrid, nominalInput: number) {
    const nominal = Number(nominalInput) || 0;
    let minThickness = Infinity, maxThickness = -Infinity, sumThickness = 0;
    let validPointsCount = 0, countND = 0, areaBelow80 = 0, areaBelow70 = 0, areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0, value: 0 }, bestLocation = { x: 0, y: 0, value: 0 };
    const height = grid.length, width = grid[0]?.length || 0;

    const firstCell = grid[0]?.find(c => c !== null);
    const resolutionX = grid[0]?.length > 1 && firstCell ? Math.abs(grid[0][1].xMm - grid[0][0].xMm) : 1;
    const resolutionY = grid.length > 1 && firstCell ? Math.abs(grid[1][0].yMm - grid[0][0].yMm) : 1;
    
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
    const totalScannedPoints = validPointsCount + countND;
    const scannedAreaM2 = (totalScannedPoints * resolutionX * resolutionY) / 1_000_000;

    const stats: InspectionStats = {
        minThickness, maxThickness, avgThickness,
        minPercentage: isFinite(minPercentage) ? minPercentage : 0,
        areaBelow80: totalScannedPoints > 0 ? (areaBelow80 / totalScannedPoints) * 100 : 0,
        areaBelow70: totalScannedPoints > 0 ? (areaBelow70 / totalScannedPoints) * 100 : 0,
        areaBelow60: totalScannedPoints > 0 ? (areaBelow60 / totalScannedPoints) * 100 : 0,
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
// For THREE JS
declare class THREE {
    static Color: any;
}
