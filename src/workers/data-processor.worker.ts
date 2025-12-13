import * as XLSX from 'xlsx';
import type { MergedGrid, InspectionStats, Condition, Plate, AssetType, SegmentBox, SeverityTier, PatchKind } from '../lib/types';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { type ProcessConfig } from '@/store/use-inspection-store';

export interface ThicknessConflict {
    fileName: string;
    fileBuffer: ArrayBuffer;
    originalThickness: number;
    conflictingThickness: number;
    mergeConfig: MergeFormValues;
}

interface MasterGrid {
    points: { plateId: string; rawThickness: number }[][];
    width: number;
    height: number;
    plates: { name: string; config: ProcessConfig; mergeConfig: MergeFormValues | null; detectedNominal: number | null }[];
    baseConfig: ProcessConfig;
}

let MASTER_GRID: MasterGrid | null = null;
let FINAL_GRID: MergedGrid | null = null;

function universalParse(fileBuffer: ArrayBuffer, fileName: string): {rows: any[][], detectedNominal: number | null} {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
      throw new Error("No sheets found in the Excel file.");
  }
  const sheet = workbook.Sheets[sheetName];

  // 'defval' ensures we get empty strings for empty cells instead of undefined, keeping structure intact
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  
  let headerRowIndex = -1;

  // --- 1. FIND THE HEADER ROW (Robust Mode) ---
  for (let i = 0; i < Math.min(rows.length, 100); i++) { 
    const row = rows[i];
    if (!row || row.length < 2) continue;
    
    let numberCount = 0;
    let validCells = 0;

    // Start checking from index 1 (skip col 0)
    for (let j = 1; j < row.length; j++) {
      const cellVal = row[j];
      // Check if not empty
      if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
        validCells++;
        // Check if strictly a number
        const num = parseFloat(String(cellVal).trim());
        if (!isNaN(num) && isFinite(num)) {
          numberCount++;
        }
      }
    }

    // If >80% of data cells are valid numbers, this is the header.
    // We added 'validCells > 5' to avoid matching empty rows with 1 random number.
    if (validCells > 5 && (numberCount / validCells) > 0.8) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect Header Row. Please check file format.");
  }

  // --- 2. EXTRACT METADATA ---
  let detectedNominalThickness: number | null = null;
  let maxThicknessValue: number | null = null;
  const metadata: any[][] = [];
  
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // Attempt to read "Key = Value" from col 0 or "Key" "Value" from col 0,1
    let keyRaw = row[0] ? String(row[0]) : '';
    let valRaw = row[1] ? String(row[1]) : '';
    
    if (keyRaw.includes('=')) {
      const parts = keyRaw.split('=');
      keyRaw = parts[0];
      valRaw = parts[1]; // Value might be in the same cell
    }

    const key = keyRaw.toLowerCase();
    const valStr = valRaw.trim();
    const valNum = parseFloat(valStr);

    if (key) {
        metadata.push([keyRaw.trim(), valStr]);
        if (key.includes('nominal thickness') && !isNaN(valNum)) detectedNominalThickness = valNum;
        if (key.includes('max thickness') && !isNaN(valNum)) maxThicknessValue = valNum;
    }
  }
  
  if (detectedNominalThickness === null) detectedNominalThickness = maxThicknessValue;

    return { rows, detectedNominal: detectedNominalThickness };
}


function getNormalizedColor(normalizedPercent: number | null): [number, number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128, 255]; // Grey for ND
    // Ensure normalizedPercent is between 0 and 1
    const p = Math.max(0, Math.min(1, normalizedPercent));
    
    // Hue goes from blue (240) to red (0)
    const hue = 240 * (1 - p); 

    // Use a simple HSV to RGB conversion for vibrant colors
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
            if (!cell || cell.effectiveThickness === null) {
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
            
            // This percentage is based on nominal, used for stats only
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

function createFinalGrid(rawMergedGrid: {plateId: string, rawThickness: number}[][], nominalInput: number): MergedGrid {
    const nominal = Number(nominalInput) || 0;
    const height = rawMergedGrid.length;
    const width = rawMergedGrid[0]?.length || 0;
    const finalGrid: MergedGrid = Array(height).fill(null).map(() => Array(width).fill(null));

    // First pass to find min/max for normalization range for COLORS and TOOLTIPS
    let minThick = Infinity;
    let maxThick = -Infinity;
     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = rawMergedGrid[y][x];
            if (cell && cell.rawThickness > 0) {
                // Effective thickness is capped at nominal
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
            let effectiveThickness: number | null = null;
            let percentage: number | null = null;
            
            if (cell && cell.rawThickness > 0) {
                effectiveThickness = Math.min(cell.rawThickness, nominal);
                // The percentage for the tooltip is now also normalized to the min/max range of the asset
                if (range > 0) {
                    percentage = ((effectiveThickness - minThick) / range) * 100;
                } else {
                    percentage = 100;
                }
            }
            finalGrid[y][x] = {
                plateId: cell ? cell.plateId : null,
                rawThickness: cell && cell.rawThickness > 0 ? cell.rawThickness : null,
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

function parseFileToGrid(rows: any[][], fileName: string) {
    let headerRow = -1;

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
            headerRow = i;
            break;
        }
    }
    if (headerRow === -1) throw new Error(`Could not find a valid header row in ${fileName}.`);
    
    const headerRowData = rows[headerRow];
    const xCoords: (number | null)[] = [];
    for (let j = 1; j < headerRowData.length; j++) {
        const val = parseFloat(String(headerRowData[j]).trim());
        if (!isNaN(val) && isFinite(val)) {
            xCoords.push(val);
        } else {
            xCoords.push(null);
        }
    }

    const dataGrid: {plateId: string, rawThickness: number}[][] = [];
    let minX = Infinity;
    let gridOffsetX = 0;

    for(let i = 0; i < xCoords.length; i++) {
        if(xCoords[i] !== null) {
            minX = Math.min(minX, xCoords[i]!);
        }
    }

    if(isFinite(minX) && minX > 0) {
         const firstStep = xCoords[1]! - xCoords[0]!;
         gridOffsetX = Math.round(minX / firstStep);
    }
    
    const gridWidth = xCoords.length + gridOffsetX;

    for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || (row.length < 2 && (row[0] === '' || row[0] === undefined)) || isNaN(parseFloat(String(row[0])))) continue;
        
        const cleanRow = Array(gridWidth).fill({ plateId: 'ND', rawThickness: 0 }); 

        for (let c = 1; c < row.length; c++) {
            const xIndex = c - 1;
            const xCoord = xCoords[xIndex];
            if(xCoord === null) continue;

            const gridX = Math.round(xCoord / (xCoords[1]! - xCoords[0]!));
            
            let rawValue = String(row[c]).trim();
            if (rawValue === '---' || rawValue === 'ND' || rawValue === '' || rawValue.toLowerCase().includes('n/a')) {
                rawValue = '0';
            }
            const num = parseFloat(rawValue);
            const rawThickness = isNaN(num) || !isFinite(num) ? 0 : num;

            cleanRow[gridX] = { 
                plateId: fileName, 
                rawThickness
            };
        }
        
        dataGrid.push(cleanRow);
    }

    if (dataGrid.length > 1) {
        const firstY = parseFloat(String(rows[headerRow + 1][0]).trim());
        const lastY = parseFloat(String(rows[rows.length - 1][0]).trim());
        if (!isNaN(firstY) && !isNaN(lastY) && firstY > lastY) {
            console.log(`Flipping descending Y-axis for ${fileName} (firstY=${firstY} > lastY=${lastY})`);
            dataGrid.reverse();
        }
    }

    const flatGrid = dataGrid.flat().map(cell => cell.rawThickness);
    const voidPct = (flatGrid.filter(v => v === 0).length / flatGrid.length) * 100;
    console.log(`Grid validation for ${fileName}: ${dataGrid.length}x${dataGrid[0].length}, voids=${voidPct.toFixed(1)}%`);
    if (voidPct > 5) {
        console.warn(`High voids in ${fileName}—consider interpolation for smoother 3D`);
    }


    return dataGrid;
}

// Function to generate a small heatmap Data URL for a specific segment
function generatePatchHeatmap(grid: MergedGrid, patch: SegmentBox, overallMin: number, overallMax: number): Promise<string> {
    const { xMin, xMax, yMin, yMax } = patch.coordinates;
    const patchWidth = xMax - xMin + 1;
    const patchHeight = yMax - yMin + 1;

    // Use OffscreenCanvas for performance if available (in a real worker environment)
    // For simplicity here, we assume a basic canvas-like structure
    const canvas = new OffscreenCanvas(patchWidth, patchHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve('');
    
    const imageData = ctx.createImageData(patchWidth, patchHeight);
    const colorRange = overallMax - overallMin;

    for (let y = 0; y < patchHeight; y++) {
        for (let x = 0; x < patchWidth; x++) {
            const gridX = xMin + x;
            const gridY = yMin + y;
            const cell = grid[gridY]?.[gridX];

            const normalizedColorValue = cell && cell.effectiveThickness !== null && colorRange > 0
                ? (cell.effectiveThickness - overallMin) / colorRange
                : null;
            
            const rgba = getNormalizedColor(normalizedColorValue);
            const index = (y * patchWidth + x) * 4;
            imageData.data[index] = rgba[0];
            imageData.data[index + 1] = rgba[1];
            imageData.data[index + 2] = rgba[2];
            imageData.data[index + 3] = rgba[3];
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' }).then(blob => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    });
}


async function segmentAndAnalyze(grid: MergedGrid, nominalInput: number, threshold: number, overallMin: number, overallMax: number): Promise<SegmentBox[]> {
    const nominal = Number(nominalInput) || 0;
    const height = grid.length, width = grid[0]?.length || 0;
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const segments: SegmentBox[] = [];
    let segmentIdCounter = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            // Segmentation logic now uses nominal-based percentage for finding defects
            const nominalPercentage = cell && cell.effectiveThickness && nominal > 0 ? (cell.effectiveThickness / nominal) * 100 : 100;
            
            if (cell && nominalPercentage < threshold && !visited[y][x]) {
                const points: {x: number, y: number, cell: any}[] = [];
                const queue: [number, number][] = [[x, y]];
                visited[y][x] = true;
                let minThick = Infinity, sumThick = 0, xMin = x, xMax = x, yMin = y, yMax = y;

                while (queue.length > 0) {
                    const [curX, curY] = queue.shift()!;
                    const currentCell = grid[curY][curX];

                    if (currentCell && currentCell.effectiveThickness !== null) {
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
                            const neighborNominalPct = neighbor && neighbor.effectiveThickness && nominal > 0 ? (neighbor.effectiveThickness / nominal) * 100 : 100;
                            if (neighbor && neighborNominalPct < threshold) {
                                visited[ny][nx] = true;
                                queue.push([nx, ny]);
                            }
                        }
                    });
                }
                
                if (points.length > 0) {
                    const worstPct = nominal > 0 ? (minThick / nominal) * 100 : 0;
                    let tier: SeverityTier = 'Moderate';
                    if (worstPct < 60) tier = 'Critical';
                    else if (worstPct < 70) tier = 'Severe';
                    
                    const newSegment: SegmentBox = {
                        id: segmentIdCounter++,
                        kind: 'CORROSION',
                        tier, pointCount: points.length,
                        worstThickness: minThick,
                        avgThickness: sumThick / points.length,
                        severityScore: (1 - minThick / nominal) * points.length,
                        coordinates: { xMin, xMax, yMin, yMax },
                        center: { x: Math.round(xMin + (xMax - xMin) / 2), y: Math.round(yMin + (yMax - yMin) / 2) }
                    };

                    segments.push(newSegment);
                }
            }
        }
    }
    
    // After identifying all segments, generate their heatmaps
    const segmentsWithImages = await Promise.all(segments.map(async (seg) => {
        const heatmapDataUrl = await generatePatchHeatmap(grid, seg, overallMin, overallMax);
        return { ...seg, heatmapDataUrl };
    }));

    return segmentsWithImages.sort((a, b) => a.worstThickness! - b.worstThickness!);
}

function segmentNonInspected(grid: MergedGrid): SegmentBox[] {
    const height = grid.length;
    const width = grid[0]?.length || 0;

    const visited: boolean[][] = Array(height)
        .fill(null)
        .map(() => Array(width).fill(false));

    const ndPatches: SegmentBox[] = [];
    let patchId = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];

            const isND =
                !cell ||
                cell.rawThickness === null ||
                cell.rawThickness === 0 ||
                cell.effectiveThickness === null;

            if (!isND || visited[y][x]) continue;

            // BFS start
            const queue: [number, number][] = [[x, y]];
            visited[y][x] = true;

            let xMin = x, xMax = x, yMin = y, yMax = y;
            let count = 0;

            while (queue.length) {
                const [cx, cy] = queue.shift()!;
                count++;

                xMin = Math.min(xMin, cx);
                xMax = Math.max(xMax, cx);
                yMin = Math.min(yMin, cy);
                yMax = Math.max(yMax, cy);

                const neighbors = [
                    [cx - 1, cy],
                    [cx + 1, cy],
                    [cx, cy - 1],
                    [cx, cy + 1],
                ];

                for (const [nx, ny] of neighbors) {
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    if (visited[ny][nx]) continue;

                    const nCell = grid[ny][nx];
                    const nIsND =
                        !nCell ||
                        nCell.rawThickness === null ||
                        nCell.rawThickness === 0 ||
                        nCell.effectiveThickness === null;

                    if (nIsND) {
                        visited[ny][nx] = true;
                        queue.push([nx, ny]);
                    }
                }
            }

            // Create ND patch (no threshold, no severity)
            ndPatches.push({
                id: patchId++,
                kind: 'NON_INSPECTED',
                pointCount: count,
                coordinates: { xMin, xMax, yMin, yMax },
                center: {
                    x: Math.round(xMin + (xMax - xMin) / 2),
                    y: Math.round(yMin + (yMax - yMin) / 2),
                },
            });
        }
    }
    return ndPatches;
}

async function finalizeProcessing(threshold: number) {
    if (!MASTER_GRID) throw new Error("Cannot finalize: MASTER_GRID is not initialized.");
    self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Processing merged data...' });

    FINAL_GRID = createFinalGrid(MASTER_GRID.points, MASTER_GRID.baseConfig.nominalThickness);
    const { stats, condition } = computeStats(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness);
    const { displacementBuffer, colorBuffer } = createBuffers(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, stats.minThickness, stats.maxThickness);
    const corrosionPatches = await segmentAndAnalyze(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, threshold, stats.minThickness, stats.maxThickness);
    const ndPatches = segmentNonInspected(FINAL_GRID);
    
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
    const { stats } = computeStats(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness);
    const corrosionPatches = await segmentAndAnalyze(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, threshold, stats.minThickness, stats.maxThickness);
    const ndPatches = segmentNonInspected(FINAL_GRID); // ND patches don't depend on threshold but good to recalculate
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
            const { rows, detectedNominal } = universalParse(file.buffer, file.name);
            const points = parseFileToGrid(rows, file.name);

            if (points.length === 0 || points[0].length === 0) throw new Error("Parsing resulted in empty data grid.");
            
            const finalConfig = { ...config, nominalThickness: Number(detectedNominal ?? config.nominalThickness) };

            MASTER_GRID = {
                points, width: points[0].length, height: points.length,
                plates: [{ name: file.name, config: finalConfig, mergeConfig: null, detectedNominal }],
                baseConfig: finalConfig,
            };
            
            self.postMessage({ type: 'STAGED', dimensions: { width: MASTER_GRID.width, height: MASTER_GRID.height }});
            return;
        }

        if (type === 'MERGE') {
            if (!MASTER_GRID) throw new Error("Cannot merge: Initial file not processed yet.");

            const { file, config, mergeConfig, resolution } = payload;
            self.postMessage({ type: 'PROGRESS' });
            const { rows, detectedNominal } = universalParse(file.buffer, file.name);
            
            if (!resolution) {
                if (detectedNominal && Math.abs(detectedNominal - MASTER_GRID.baseConfig.nominalThickness) > 0.01) {
                    const conflict: ThicknessConflict = {
                        fileName: file.name, fileBuffer: file.buffer,
                        originalThickness: MASTER_GRID.baseConfig.nominalThickness,
                        conflictingThickness: detectedNominal,
                        mergeConfig: mergeConfig,
                    };
                    self.postMessage({ type: 'THICKNESS_CONFLICT', conflict: conflict }, [file.buffer]);
                    return;
                }
            } else {
                if (resolution === 'useNew') {
                     MASTER_GRID.baseConfig.nominalThickness = Number(detectedNominal ?? MASTER_GRID.baseConfig.nominalThickness);
                } else if (resolution.type === 'useCustom') {
                    MASTER_GRID.baseConfig.nominalThickness = resolution.value;
                }
            }
            
            const newPoints = parseFileToGrid(rows, file.name);
            const { direction, start: offset } = mergeConfig;

            if (direction === 'right') {
                const height = Math.max(MASTER_GRID.height, newPoints.length);
                const width = offset + newPoints[0].length;
                const newMaster = Array(height).fill(null).map(() => Array(width).fill({ plateId: 'ND', rawThickness: 0 }));
                for(let y=0; y < MASTER_GRID.height; y++) for(let x=0; x < MASTER_GRID.width; x++) newMaster[y][x] = MASTER_GRID.points[y][x];
                for(let y = 0; y < newPoints.length; y++) for (let x = 0; x < newPoints[0].length; x++) newMaster[y][offset + x] = newPoints[y][x];
                MASTER_GRID.points = newMaster; MASTER_GRID.width = width; MASTER_GRID.height = height;
            } else if (direction === 'bottom') {
                 const width = Math.max(MASTER_GRID.width, newPoints[0].length);
                 const height = offset + newPoints.length;
                 const newMaster = Array(height).fill(null).map(() => Array(width).fill({ plateId: 'ND', rawThickness: 0 }));
                 for(let y=0; y < MASTER_GRID.height; y++) for(let x=0; x < MASTER_GRID.width; x++) newMaster[y][x] = MASTER_GRID.points[y][x];
                 for(let y = 0; y < newPoints.length; y++) for (let x = 0; x < newPoints[0].length; x++) newMaster[offset + y][x] = newPoints[y][x];
                 MASTER_GRID.points = newMaster; MASTER_GRID.width = width; MASTER_GRID.height = height;
            }
            
            MASTER_GRID.plates.push({ name: file.name, config: MASTER_GRID.baseConfig, mergeConfig, detectedNominal: null });
            self.postMessage({ type: 'STAGED', dimensions: { width: MASTER_GRID.width, height: MASTER_GRID.height }});
            return;
        }

        if (type === 'FINALIZE') {
             await finalizeProcessing(payload.threshold);
        } else if (type === 'RESEGMENT') {
            await resegment(payload.threshold);
        } else if (type === 'RECOLOR') {
             if (!FINAL_GRID || !MASTER_GRID) return;
             const { stats } = computeStats(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness);
             const { displacementBuffer, colorBuffer } = createBuffers(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, stats.minThickness, stats.maxThickness);
             self.postMessage({ type: 'FINALIZED', displacementBuffer, colorBuffer }, [displacementBuffer.buffer, colorBuffer.buffer]);
        }
    } catch (error: any) {
        console.error("Worker CRASH:", error);
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

export {};
