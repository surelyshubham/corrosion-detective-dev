
import * as XLSX from 'xlsx';
import type { MergedGrid, MergedCell, InspectionStats, Condition, Plate, RawInspectionDataPoint, AssetType } from '../lib/types';
import { type MergeFormValues } from '@/components/tabs/merge-alert-dialog';

type ColorMode = 'mm' | '%';

interface MasterGrid {
    points: { plateId: string; rawThickness: number }[][];
    width: number;
    height: number;
    plates: Plate[];
    assetType: AssetType;
    nominalThickness: number;
    pipeOuterDiameter?: number;
    pipeLength?: number;
}

// The "Worker Vault" - This state persists between messages
let MASTER_GRID: MasterGrid | null = null;

function getAbsoluteColor(percentage: number | null): [number, number, number, number] {
    if (percentage === null) return [128, 128, 128, 255]; // Grey for ND
    if (percentage < 60) return [255, 0, 0, 255];   // Red
    if (percentage < 70) return [255, 165, 0, 255]; // Orange
    if (percentage < 80) return [255, 255, 0, 255]; // Yellow
    if (percentage < 90) return [0, 255, 0, 255];   // Green
    return [0, 0, 255, 255];                       // Blue
}

function getNormalizedColor(normalizedPercent: number | null): [number, number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128, 255]; // Grey for ND
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
    let minThickness = Infinity;
    let maxThickness = -Infinity;
    let sumThickness = 0;
    let validPointsCount = 0;
    let countND = 0;
    let areaBelow80 = 0, areaBelow70 = 0, areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0, value: 0 };
    let bestLocation = { x: 0, y: 0, value: 0 };
    const height = grid.length;
    const width = grid[0]?.length || 0;

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
        countND,
        totalPoints: height * width,
        worstLocation,
        bestLocation,
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
            let effectiveThickness: number | null = null;
            let percentage: number | null = null;
            
            if (cell && cell.rawThickness > 0) {
                effectiveThickness = Math.min(cell.rawThickness, nominalThickness);
                percentage = (effectiveThickness / nominalThickness) * 100;
            }

            finalGrid[y][x] = {
                plateId: cell ? cell.plateId : null,
                rawThickness: cell && cell.rawThickness > 0 ? cell.rawThickness : null,
                effectiveThickness: effectiveThickness,
                percentage: percentage,
            };
        }
    }
    return finalGrid;
}

function createBuffers(grid: MergedGrid, nominal: number, min: number, max: number, colorMode: ColorMode) {
    const height = grid.length;
    const width = grid[0]?.length || 0;
    const displacementBuffer = new Float32Array(width * height);
    const colorBuffer = new Uint8Array(width * height * 4);
    const range = max - min;

     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const flippedY = height - 1 - y;
            const index = y * width + x;
            const cell = grid[flippedY][x]; 
            
            displacementBuffer[index] = cell.effectiveThickness !== null ? cell.effectiveThickness : nominal;
            
            let rgba: [number, number, number, number];
            if (colorMode === '%') {
                 const normalized = cell.effectiveThickness !== null && range > 0 ? (cell.effectiveThickness - min) / range : null;
                 rgba = getNormalizedColor(normalized);
            } else {
                 rgba = getAbsoluteColor(cell.percentage);
            }
            const colorIndex = index * 4;
            colorBuffer[colorIndex] = rgba[0];
            colorBuffer[colorIndex + 1] = rgba[1];
            colorBuffer[colorIndex + 2] = rgba[2];
            colorBuffer[colorIndex + 3] = rgba[3];
        }
    }
    return { displacementBuffer, colorBuffer };
}

function parseFileToGrid(file: {name: string, buffer: ArrayBuffer}) {
    const rawData = universalParse(file.buffer);
    let headerRow = -1;
    for (let i = 0; i < Math.min(100, rawData.length); i++) {
        if (String(rawData[i][0]).trim().toLowerCase() === 'y-pos' && String(rawData[i][1]).trim().toLowerCase() === 'x-pos') {
            headerRow = i;
            break;
        }
        if (String(rawData[i][0]).trim() === '' && !isNaN(parseFloat(rawData[i][1]))) {
             headerRow = i;
             break;
        }
        if (i === 18) {
             headerRow = 18;
             break;
        }
    }

    if (headerRow === -1) {
        throw new Error(`Could not find a valid header row in ${file.name}. Expected row 19 or a row with Y/X coordinate headers.`);
    }

    const dataGrid: {plateId: string, rawThickness: number}[][] = [];
    const xCoords = rawData[headerRow].slice(1).map(x => parseFloat(String(x)));

    for (let r = headerRow + 1; r < rawData.length; r++) {
        const row = rawData[r];
        if (!row || (row.length < 2 && (row[0] === '' || row[0] === undefined))) continue;
        
        const yPos = parseFloat(String(row[0]));
        if (isNaN(yPos)) continue;

        const cleanRow = row.slice(1).map((val: any) => {
            const num = parseFloat(val);
            return isNaN(num) ? -1 : num;
        });

        if (cleanRow.length > 0) {
            dataGrid.push(cleanRow.map(val => ({ plateId: file.name, rawThickness: val })));
        }
    }
    return dataGrid;
}

function generateResponse(colorMode: ColorMode) {
    if (!MASTER_GRID) {
        throw new Error("Cannot generate response: MASTER_GRID is not initialized.");
    }
    self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Processing data...' });

    const finalGrid = createFinalGrid(MASTER_GRID.points, MASTER_GRID.nominalThickness);
    const { stats, condition } = computeStats(finalGrid, MASTER_GRID.nominalThickness);
    const { displacementBuffer, colorBuffer } = createBuffers(finalGrid, MASTER_GRID.nominalThickness, stats.minThickness, stats.maxThickness, colorMode);
    
    self.postMessage({
        type: 'DONE',
        displacementBuffer,
        colorBuffer,
        gridMatrix: finalGrid,
        stats,
        condition,
        plates: MASTER_GRID.plates,
    }, [displacementBuffer.buffer, colorBuffer.buffer]);
}

self.onmessage = async (event: MessageEvent<any>) => {
    const { type, ...payload } = event.data;
    try {
        if (type === 'RESET') {
            MASTER_GRID = null;
            return;
        }
        if (type === 'INIT') {
            const { file, nominalThickness, colorMode, assetType, pipeOuterDiameter, pipeLength } = payload;
            self.postMessage({ type: 'PROGRESS', progress: 10, message: 'Parsing initial file...' });
            const points = parseFileToGrid(file);

            if (points.length === 0 || points[0].length === 0) {
                throw new Error("Parsing resulted in empty data grid. Please check file format and content.");
            }
            
            const plate: Plate = { id: file.name, fileName: file.name, rawGridData: [], processedData: [], stats: {} as InspectionStats, metadata: [], assetType, nominalThickness };

            MASTER_GRID = {
                points,
                width: points[0].length,
                height: points.length,
                plates: [plate],
                assetType,
                nominalThickness,
                pipeOuterDiameter,
                pipeLength,
            };
            generateResponse(colorMode);
        } else if (type === 'MERGE') {
            if (!MASTER_GRID) {
                throw new Error("Cannot merge: Initial file not processed yet.");
            }
            const { file, mergeConfig, colorMode } = payload as { file: { name: string, buffer: ArrayBuffer }, mergeConfig: MergeFormValues, colorMode: ColorMode };
            self.postMessage({ type: 'PROGRESS', progress: 10, message: `Parsing ${file.name}...` });

            const newPoints = parseFileToGrid(file);
            const { direction, start: offset } = mergeConfig;

            const oldWidth = MASTER_GRID.width;
            const oldHeight = MASTER_GRID.height;
            const newWidth = newPoints[0].length;
            const newHeight = newPoints.length;

            if (direction === 'right') {
                const height = Math.max(oldHeight, newHeight);
                const width = offset + newWidth;
                const newMaster = Array(height).fill(null).map(() => Array(width).fill({ plateId: 'ND', rawThickness: -1 }));
                
                for(let y=0; y < oldHeight; y++) {
                    for(let x=0; x < oldWidth; x++) {
                        newMaster[y][x] = MASTER_GRID.points[y][x];
                    }
                }
                for(let y = 0; y < newHeight; y++) {
                    for (let x = 0; x < newWidth; x++) {
                        newMaster[y][offset + x] = newPoints[y][x];
                    }
                }
                MASTER_GRID.points = newMaster;
                MASTER_GRID.width = width;
                MASTER_GRID.height = height;

            } else if (direction === 'bottom') {
                 const width = Math.max(oldWidth, newWidth);
                 const height = offset + newHeight;
                 const newMaster = Array(height).fill(null).map(() => Array(width).fill({ plateId: 'ND', rawThickness: -1 }));
                
                for(let y=0; y < oldHeight; y++) {
                    for(let x=0; x < oldWidth; x++) {
                        newMaster[y][x] = MASTER_GRID.points[y][x];
                    }
                }
                 for(let y = 0; y < newHeight; y++) {
                    for (let x = 0; x < newWidth; x++) {
                        newMaster[offset + y][x] = newPoints[y][x];
                    }
                }
                MASTER_GRID.points = newMaster;
                MASTER_GRID.width = width;
                MASTER_GRID.height = height;
            }
            // Future: Implement 'left' and 'top'
            
            const plate: Plate = { id: file.name, fileName: file.name, rawGridData: [], processedData: [], stats: {} as InspectionStats, metadata: [], assetType: MASTER_GRID.assetType, nominalThickness: MASTER_GRID.nominalThickness };
            MASTER_GRID.plates.push(plate);

            generateResponse(colorMode);

        } else if (type === 'REPROCESS' || type === 'RECOLOR') {
             if (!MASTER_GRID) throw new Error("Cannot re-process: No data loaded.");
             if (type === 'REPROCESS') {
                MASTER_GRID.nominalThickness = payload.nominalThickness;
             }
             generateResponse(payload.colorMode);
        }
    } catch (error: any) {
        console.error("Worker CRASH:", error);
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

export {};
