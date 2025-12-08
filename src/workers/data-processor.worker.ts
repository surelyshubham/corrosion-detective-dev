
import * as XLSX from 'xlsx';
import type { MergedGrid, MergedCell, InspectionStats, Condition } from '../lib/types';

type ColorMode = 'mm' | '%';

// --- Color Helper ---
function getAbsoluteColor(percentage: number | null): [number, number, number, number] {
    if (percentage === null) return [128, 128, 128, 255]; // Grey for ND
    if (percentage < 70) return [255, 0, 0, 255];   // Red
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

// --- Main Logic ---

function computeStats(grid: MergedGrid, nominal: number) {
    let minThickness = Infinity;
    let maxThickness = -Infinity;
    let sumThickness = 0;
    let validPointsCount = 0;
    let countND = 0;
    let areaBelow80 = 0, areaBelow70 = 0, areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0 };
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
                worstLocation = { x, y };
            }
            maxThickness = Math.max(maxThickness, value);
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
        worstLocation: minThickness === 0 ? {x: 0, y: 0} : worstLocation,
        gridSize: { width, height },
        scannedArea: totalScannedPoints / 1_000_000, // Assuming 1 point = 1mm^2
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
            
            if (cell.rawThickness > 0) {
                effectiveThickness = Math.min(cell.rawThickness, nominalThickness);
                percentage = (effectiveThickness / nominalThickness) * 100;
            }

            finalGrid[y][x] = {
                plateId: cell.plateId,
                rawThickness: cell.rawThickness > 0 ? cell.rawThickness : null,
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
    const colorBuffer = new Uint8Array(width * height * 4); // RGBA
    const range = max - min;

     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const cell = grid[y][x];
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


// --- Universal Parser ---
function universalParse(buffer: ArrayBuffer): any[][] {
    console.log("Worker: UniversalParse received buffer, size:", buffer.byteLength);
    // 1. Try XLSX parsing first
    try {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (sheetName) {
            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            if (data && data.length > 1) {
                console.log("Worker: Successfully parsed as XLSX.");
                return data;
            }
        }
    } catch (e) {
        console.log("Worker: XLSX parsing failed, falling back to text parsing.", e);
    }

    // 2. Fallback to Text/CSV parsing
    console.log("Worker: Attempting text/CSV parsing.");
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);
    const lines = text.split(/[\r\n]+/);
    return lines.map(line => {
        // Robust CSV splitting
        const row = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        return row.map(cell => cell.trim().replace(/^"|"$/g, '')); // Handle quoted cells
    });
}


self.onmessage = async (event: MessageEvent<any>) => {
    const { type } = event.data;
    try {
        if (type === 'PROCESS') {
            const { files, nominalThickness, colorMode } = event.data;
            let rawMergedGrid: {plateId: string, rawThickness: number}[][] = [];
            self.postMessage({ type: 'PROGRESS', progress: 10, message: 'Parsing files...' });
            
            for (const file of files) {
                const rawData = universalParse(file.buffer);
                console.log(`Worker: UniversalParse returned ${rawData.length} rows for file ${file.name}.`);

                // Robust Header Hunt
                let headerRow = -1;
                const headerKeywords = ['mm', 'thickness', 'scan', 'index'];
                for(let i = 0; i < Math.min(100, rawData.length); i++) {
                    const rowStr = JSON.stringify(rawData[i]).toLowerCase();
                    if(headerKeywords.some(key => rowStr.includes(key))) {
                        headerRow = i;
                        console.log(`Worker: Found header for ${file.name} at row ${i} with content: ${rowStr}`);
                        break;
                    }
                }
                if (headerRow === -1) {
                    console.warn(`Worker: Could not find a valid header in ${file.name}. Skipping file.`);
                    continue;
                }

                const dataGrid: {plateId: string, rawThickness: number}[][] = [];
                for (let r = headerRow + 1; r < rawData.length; r++) {
                    const row = rawData[r];
                    if (!row || row.length < 2) continue;
                    const cleanRow = row.slice(1).map((val: any) => {
                        const num = parseFloat(val);
                        return isNaN(num) ? -1 : num;
                    });
                    if (cleanRow.some(v => v !== -1)) { // Only add rows with some valid data
                        dataGrid.push(cleanRow.map(val => ({ plateId: file.name, rawThickness: val })));
                    }
                }
                console.log(`Worker: Extracted ${dataGrid.length} data rows from ${file.name}.`);
                
                if (dataGrid.length === 0) continue;
                
                // Merge logic
                if (rawMergedGrid.length === 0) {
                    rawMergedGrid = dataGrid;
                } else {
                     const targetRows = Math.max(rawMergedGrid.length, dataGrid.length);
                     const padCell = { plateId: 'ND', rawThickness: -1 };
                     while(rawMergedGrid.length < targetRows) rawMergedGrid.push(new Array(rawMergedGrid[0].length).fill(padCell));
                     while(dataGrid.length < targetRows) dataGrid.push(new Array(dataGrid[0].length).fill(padCell));
                     for(let i=0; i<targetRows; i++) {
                        rawMergedGrid[i] = (rawMergedGrid[i] || []).concat(dataGrid[i] || []);
                     }
                }
            }
            
            if (rawMergedGrid.length === 0 || rawMergedGrid[0].length === 0) {
                throw new Error("Parsing resulted in empty data grid. Please check file format and content.");
            }

            self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Processing data...' });
            const finalGrid = createFinalGrid(rawMergedGrid, nominalThickness);
            const { stats, condition } = computeStats(finalGrid, nominalThickness);
            const { displacementBuffer, colorBuffer } = createBuffers(finalGrid, nominalThickness, stats.minThickness, stats.maxThickness, colorMode);
            
            self.postMessage({
                type: 'DONE', displacementBuffer, colorBuffer, gridMatrix: finalGrid, stats, condition,
            }, [displacementBuffer.buffer, colorBuffer.buffer]);

        } else if (type === 'REPROCESS' || type === 'RECOLOR') {
            const { gridMatrix, nominalThickness, colorMode, stats } = event.data;
            let recomputedStats = stats;
            let recomputedCondition = 'N/A';

            let finalGrid = gridMatrix;

            if (type === 'REPROCESS') {
                finalGrid = createFinalGrid(gridMatrix.map((row: MergedCell[]) => row.map(cell => ({ plateId: cell.plateId || 'ND', rawThickness: cell.rawThickness || -1 }))), nominalThickness);
                 const { stats: newStats, condition: newCondition } = computeStats(finalGrid, nominalThickness);
                 recomputedStats = newStats;
                 recomputedCondition = newCondition;
            }
           
            const { displacementBuffer, colorBuffer } = createBuffers(finalGrid, nominalThickness, recomputedStats.minThickness, recomputedStats.maxThickness, colorMode);
            self.postMessage({
                type: 'DONE', displacementBuffer, colorBuffer, gridMatrix: finalGrid, stats: recomputedStats, condition: recomputedCondition
            }, [displacementBuffer.buffer, colorBuffer.buffer]);
        }
    } catch (error: any) {
        console.error("Worker CRASH:", error);
        self.postMessage({ type: 'ERROR', message: error.message });
    }
};

export {};
