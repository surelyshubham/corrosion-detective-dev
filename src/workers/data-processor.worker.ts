
import * as XLSX from 'xlsx';

// --- Color Helper ---
function getColor(value: number, nominal: number): [number, number, number] {
    const percentage = (value / nominal) * 100;
    if (value <= 0) return [128, 128, 128]; // Grey for ND
    if (percentage < 70) return [255, 0, 0];   // Red
    if (percentage < 80) return [255, 255, 0]; // Yellow
    if (percentage < 90) return [0, 255, 0];   // Green
    return [0, 0, 255];                       // Blue
}

function computeStats(grid: number[][], nominal: number) {
    let minThickness = Infinity;
    let maxThickness = -Infinity;
    let sumThickness = 0;
    let validPointsCount = 0;
    let countND = 0;
    let areaBelow80 = 0;
    let areaBelow70 = 0;
    let areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0 };
    const height = grid.length;
    const width = grid[0]?.length || 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const value = grid[y][x];
            if (value <= 0) {
                countND++;
                continue;
            }
            
            validPointsCount++;
            sumThickness += value;
            if (value < minThickness) {
                minThickness = value;
                worstLocation = { x, y };
            }
            if (value > maxThickness) {
                maxThickness = value;
            }

            const percentage = (value / nominal) * 100;
            if (percentage < 80) areaBelow80++;
            if (percentage < 70) areaBelow70++;
            if (percentage < 60) areaBelow60++;
        }
    }
    
    if (validPointsCount === 0) {
        minThickness = 0;
        maxThickness = 0;
    }
    
    const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
    const minPercentage = (minThickness / nominal) * 100;
    const totalPoints = height * width;

    return {
        stats: {
            minThickness,
            maxThickness,
            avgThickness,
            minPercentage: isFinite(minPercentage) ? minPercentage : 0,
            areaBelow80: totalPoints > 0 ? (areaBelow80 / totalPoints) * 100 : 0,
            areaBelow70: totalPoints > 0 ? (areaBelow70 / totalPoints) * 100 : 0,
            areaBelow60: totalPoints > 0 ? (areaBelow60 / totalPoints) * 100 : 0,
            countND,
            totalPoints,
            worstLocation,
            gridSize: { width, height },
            scannedArea: validPointsCount / 1_000_000, // Assuming 1 point = 1mm^2
            nominalThickness: nominal
        },
        condition: minPercentage >= 95 ? 'Healthy' : minPercentage >= 80 ? 'Moderate' : minPercentage >= 60 ? 'Severe' : 'Critical',
    };
}


self.onmessage = async (event: MessageEvent<{ files: File[], nominalThickness: number, mergeConfig: any }>) => {
    const { files, nominalThickness, mergeConfig } = event.data;

    try {
        let mergedGrid: number[][] = [];
        self.postMessage({ type: 'PROGRESS', progress: 10, message: 'Parsing files...' });
        
        // --- Simplified Parsing and Merging Logic ---
        for (const file of files) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            let headerRow = -1;
            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                if (JSON.stringify(rawData[i]).includes('mm')) {
                    headerRow = i;
                    break;
                }
            }
            if (headerRow === -1) headerRow = 18;

            const dataGrid: number[][] = [];
            for (let r = headerRow + 1; r < rawData.length; r++) {
                const row = rawData[r];
                if (!row) continue;
                const cleanRow = row.slice(1).map((val: any) => {
                    const num = parseFloat(val);
                    return isNaN(num) ? -1 : num; // Use -1 for ND
                });
                dataGrid.push(cleanRow);
            }
            
            // Simple right-append merge logic
            if (mergedGrid.length === 0) {
                mergedGrid = dataGrid;
            } else {
                 const targetRows = Math.max(mergedGrid.length, dataGrid.length);
                 while(mergedGrid.length < targetRows) mergedGrid.push(new Array(mergedGrid[0].length).fill(-1));
                 while(dataGrid.length < targetRows) dataGrid.push(new Array(dataGrid[0].length).fill(-1));
                 for(let i=0; i<targetRows; i++) mergedGrid[i] = mergedGrid[i].concat(dataGrid[i]);
            }
        }
        
        self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Calculating statistics...' });
        
        const { stats, condition } = computeStats(mergedGrid, nominalThickness);
        const { width, height } = stats.gridSize;

        self.postMessage({ type: 'PROGRESS', progress: 70, message: 'Generating textures...' });

        // --- Generate Texture Buffers ---
        const displacementBuffer = new Float32Array(width * height);
        const colorBuffer = new Uint8Array(width * height * 3);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = mergedGrid[y][x];
                const index = y * width + x;

                // Displacement: raw thickness values
                displacementBuffer[index] = value > 0 ? value : nominalThickness;

                // Color
                const [r, g, b] = getColor(value, nominalThickness);
                colorBuffer[index * 3] = r;
                colorBuffer[index * 3 + 1] = g;
                colorBuffer[index * 3 + 2] = b;
            }
        }
        
        self.postMessage({ type: 'PROGRESS', progress: 95, message: 'Finalizing...' });
        
        // --- Send data back to main thread ---
        self.postMessage({
            type: 'DONE',
            displacementBuffer,
            colorBuffer,
            gridMatrix: mergedGrid, // Send the raw grid for probe lookup
            stats,
            condition,
        }, [displacementBuffer.buffer, colorBuffer.buffer]);

    } catch (error: any) {
        self.postMessage({ type: 'ERROR', message: error.message });
    }
};

// This is required to make TypeScript treat this file as a module.
export {};
