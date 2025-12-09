
import * as XLSX from 'xlsx';
import type { MergedGrid, InspectionStats, Condition, Plate, AssetType, SegmentBox, SeverityTier } from '../lib/types';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';
import { type ProcessConfig } from '@/store/use-inspection-store';

type ColorMode = 'mm' | '%';

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
    if (!sheetName) throw new Error(`No sheets found in ${fileName}.`);
    
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    let detectedNominal: number | null = null;
    let maxThickness: number | null = null;
    // Look for nominal thickness in metadata
    for (let i = 0; i < Math.min(18, rows.length); i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const key = String(row[0]).toLowerCase();
        const value = parseFloat(String(row[1]));
        if (key.includes('nominal thickness') && !isNaN(value)) {
            detectedNominal = value;
            break;
        }
        if (key.includes('max thickness') && !isNaN(value)) {
            maxThickness = value;
        }
    }

    if (detectedNominal === null && maxThickness !== null) {
        detectedNominal = maxThickness;
    }

    return { rows, detectedNominal };
}


function getAbsoluteColor(percentage: number | null): [number, number, number, number] {
    if (percentage === null) return [128, 128, 128, 255]; 
    if (percentage < 60) return [255, 0, 0, 255];
    if (percentage < 70) return [255, 165, 0, 255];
    if (percentage < 80) return [255, 255, 0, 255];
    if (percentage < 90) return [0, 255, 0, 255];
    return [0, 0, 255, 255];
}

function getNormalizedColor(normalizedPercent: number | null): [number, number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128, 255];
    const hue = 240 * (1 - normalizedPercent);
    const saturation = 1;
    const lightness = 0.5;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= hue && hue < 60) { [r, g, b] = [c, x, 0]; }
    else if (60 <= hue && hue < 120) { [r, g, b] = [x, c, 0]; }
    else if (120 <= hue && hue < 180) { [r, g, b] = [0, c, x]; }
    else if (180 <= hue && hue < 240) { [r, g, b] = [0, x, c]; }
    else if (240 <= hue && hue < 300) { [r, g, b] = [x, 0, c]; }
    else if (300 <= hue && hue < 360) { [r, g, b] = [c, 0, x]; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255, 255];
}

function computeStats(grid: MergedGrid, nominal: number) {
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
            const percentage = cell.percentage || 0;
            if (percentage < 80) areaBelow80++;
            if (percentage < 70) areaBelow70++;
            if (percentage < 60) areaBelow60++;
        }
    }
    
    minThickness = minThickness === Infinity ? 0 : minThickness;
    maxThickness = maxThickness === -Infinity ? 0 : maxThickness;
    
    const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
    const minPercentage = (minThickness / nominal) * 100;
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

function createFinalGrid(rawMergedGrid: {plateId: string, rawThickness: number}[][], nominalThickness: number): MergedGrid {
    const height = rawMergedGrid.length;
    const width = rawMergedGrid[0]?.length || 0;
    const finalGrid: MergedGrid = Array(height).fill(null).map(() => Array(width).fill(null));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = rawMergedGrid[y][x];
            let effectiveThickness: number | null = null, percentage: number | null = null;
            if (cell && cell.rawThickness > 0) {
                effectiveThickness = Math.min(cell.rawThickness, nominalThickness);
                percentage = (effectiveThickness / nominalThickness) * 100;
            }
            finalGrid[y][x] = {
                plateId: cell ? cell.plateId : null,
                rawThickness: cell && cell.rawThickness > 0 ? cell.rawThickness : null,
                effectiveThickness, percentage
            };
        }
    }
    return finalGrid;
}

function createBuffers(grid: MergedGrid, nominal: number, min: number, max: number, colorMode: ColorMode) {
    const height = grid.length, width = grid[0]?.length || 0;
    const displacementBuffer = new Float32Array(width * height);
    const colorBuffer = new Uint8Array(width * height * 4);
    const range = max - min;

     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const flippedY = height - 1 - y;
            const index = y * width + x;
            const cell = grid[flippedY][x]; 
            
            displacementBuffer[index] = cell.effectiveThickness !== null ? cell.effectiveThickness - nominal : 0;
            
            const rgba = colorMode === '%' ? getNormalizedColor(cell.effectiveThickness !== null && range > 0 ? (cell.effectiveThickness - min) / range : null) : getAbsoluteColor(cell.percentage);
            const colorIndex = index * 4;
            [colorBuffer[colorIndex], colorBuffer[colorIndex + 1], colorBuffer[colorIndex + 2], colorBuffer[colorIndex + 3]] = rgba;
        }
    }
    return { displacementBuffer, colorBuffer };
}

function parseFileToGrid(rows: any[][], fileName: string) {
    let headerRow = -1;
    for (let i = 0; i < Math.min(100, rows.length); i++) {
        if (String(rows[i][0]).trim().toLowerCase() === 'y-pos' && String(rows[i][1]).trim().toLowerCase() === 'x-pos') { headerRow = i; break; }
        if (String(rows[i][0]).trim() === '' && !isNaN(parseFloat(rows[i][1]))) { headerRow = i; break; }
        if (i === 18) { headerRow = 18; break; }
    }
    if (headerRow === -1) throw new Error(`Could not find a valid header row in ${fileName}.`);
    
    const dataGrid: {plateId: string, rawThickness: number}[][] = [];
    for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || (row.length < 2 && (row[0] === '' || row[0] === undefined)) || isNaN(parseFloat(String(row[0])))) continue;
        const cleanRow = row.slice(1).map((val: any) => ({ plateId: fileName, rawThickness: parseFloat(val) > 0 ? parseFloat(val) : -1 }));
        if (cleanRow.length > 0) dataGrid.push(cleanRow);
    }
    return dataGrid;
}

function segmentAndAnalyze(grid: MergedGrid, nominal: number, threshold: number): SegmentBox[] {
    const height = grid.length, width = grid[0]?.length || 0;
    const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
    const segments: SegmentBox[] = [];
    let segmentIdCounter = 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (cell && cell.percentage !== null && cell.percentage < threshold && !visited[y][x]) {
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
                            if (neighbor && neighbor.percentage !== null && neighbor.percentage < threshold) {
                                visited[ny][nx] = true;
                                queue.push([nx, ny]);
                            }
                        }
                    });
                }
                
                if (points.length > 0) {
                    const worstPct = (minThick / nominal) * 100;
                    let tier: SeverityTier = 'Moderate';
                    if (worstPct < 60) tier = 'Critical';
                    else if (worstPct < 70) tier = 'Severe';

                    segments.push({
                        id: segmentIdCounter++,
                        tier, pointCount: points.length,
                        worstThickness: minThick,
                        avgThickness: sumThick / points.length,
                        severityScore: (1 - minThick / nominal) * points.length,
                        coordinates: { xMin, xMax, yMin, yMax },
                        center: { x: Math.round(xMin + (xMax - xMin) / 2), y: Math.round(yMin + (yMax - yMin) / 2) }
                    });
                }
            }
        }
    }
    return segments.sort((a, b) => a.worstThickness - b.worstThickness);
}

function finalizeProcessing(colorMode: ColorMode, threshold: number) {
    if (!MASTER_GRID) throw new Error("Cannot finalize: MASTER_GRID is not initialized.");
    self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Processing merged data...' });

    FINAL_GRID = createFinalGrid(MASTER_GRID.points, MASTER_GRID.baseConfig.nominalThickness);
    const { stats, condition } = computeStats(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness);
    const { displacementBuffer, colorBuffer } = createBuffers(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, stats.minThickness, stats.maxThickness, colorMode);
    const segments = segmentAndAnalyze(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, threshold);
    
    const plates = MASTER_GRID.plates.map(p => ({
        id: p.name, fileName: p.name, ...p.config
    })) as Plate[];
    
    self.postMessage({
        type: 'FINALIZED', displacementBuffer, colorBuffer,
        gridMatrix: FINAL_GRID, stats, condition, plates, segments,
    }, [displacementBuffer.buffer, colorBuffer.buffer]);
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
            
            const finalConfig = { ...config, nominalThickness: detectedNominal ?? config.nominalThickness };

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
                     MASTER_GRID.baseConfig.nominalThickness = detectedNominal ?? MASTER_GRID.baseConfig.nominalThickness;
                } else if (resolution.type === 'useCustom') {
                    MASTER_GRID.baseConfig.nominalThickness = resolution.value;
                }
            }
            
            const newPoints = parseFileToGrid(rows, file.name);
            const { direction, start: offset } = mergeConfig;

            if (direction === 'right') {
                const height = Math.max(MASTER_GRID.height, newPoints.length);
                const width = offset + newPoints[0].length;
                const newMaster = Array(height).fill(null).map(() => Array(width).fill({ plateId: 'ND', rawThickness: -1 }));
                for(let y=0; y < MASTER_GRID.height; y++) for(let x=0; x < MASTER_GRID.width; x++) newMaster[y][x] = MASTER_GRID.points[y][x];
                for(let y = 0; y < newPoints.length; y++) for (let x = 0; x < newPoints[0].length; x++) newMaster[y][offset + x] = newPoints[y][x];
                MASTER_GRID.points = newMaster; MASTER_GRID.width = width; MASTER_GRID.height = height;
            } else if (direction === 'bottom') {
                 const width = Math.max(MASTER_GRID.width, newPoints[0].length);
                 const height = offset + newPoints.length;
                 const newMaster = Array(height).fill(null).map(() => Array(width).fill({ plateId: 'ND', rawThickness: -1 }));
                 for(let y=0; y < MASTER_GRID.height; y++) for(let x=0; x < MASTER_GRID.width; x++) newMaster[y][x] = MASTER_GRID.points[y][x];
                 for(let y = 0; y < newPoints.length; y++) for (let x = 0; x < newPoints[0].length; x++) newMaster[offset + y][x] = newPoints[y][x];
                 MASTER_GRID.points = newMaster; MASTER_GRID.width = width; MASTER_GRID.height = height;
            }
            
            MASTER_GRID.plates.push({ name: file.name, config: MASTER_GRID.baseConfig, mergeConfig, detectedNominal: null }); // Nominal already handled
            self.postMessage({ type: 'STAGED', dimensions: { width: MASTER_GRID.width, height: MASTER_GRID.height }});
            return;
        }

        if (type === 'FINALIZE') {
             finalizeProcessing(payload.colorMode, payload.threshold);
        } else if (type === 'RESEGMENT') {
            if (!FINAL_GRID || !MASTER_GRID) return;
            const segments = segmentAndAnalyze(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, payload.threshold);
            self.postMessage({ type: 'SEGMENTS_UPDATED', segments: segments });
        } else if (type === 'RECOLOR') {
             if (!FINAL_GRID || !MASTER_GRID) return;
             const { stats } = computeStats(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness);
             const { displacementBuffer, colorBuffer } = createBuffers(FINAL_GRID, MASTER_GRID.baseConfig.nominalThickness, stats.minThickness, stats.maxThickness, payload.colorMode);
             self.postMessage({ type: 'FINALIZED', displacementBuffer, colorBuffer }, [displacementBuffer.buffer, colorBuffer.buffer]);
        }
    } catch (error: any) {
        console.error("Worker CRASH:", error);
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

export {};

    