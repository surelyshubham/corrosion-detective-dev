import * as XLSX from "xlsx";

export interface ThicknessPoint {
  x: number;       // column index
  y: number;       // row index
  thickness: number | null;
}

export interface ParsedExcelResult {
  meta: string[];
  data: ThicknessPoint[];
  xCount: number;
  yCount: number;
}

export function parseThicknessExcel(file: ArrayBuffer): ParsedExcelResult {
  const workbook = XLSX.read(file, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // -------------------------
  // METADATA = rows 1–18
  // -------------------------
  const metadataRows = json.slice(0, 18);
  const meta = metadataRows.map(row => row.join(" "));

  // -------------------------
  // GRID STARTS FROM ROW 20 (index 19)
  // -------------------------
  const headerRowIndex = 18; // row 19 in Excel, index 18 zero-based
  const firstDataRowIndex = 19; // row 20 in Excel, index 19

  const headerRow = json[headerRowIndex];

  // Extract X labels (columns B onward)
  const xLabels = headerRow.slice(1).map(Number); // skip column A

  const data: ThicknessPoint[] = [];

  // Process all rows below row 20
  for (let r = firstDataRowIndex; r < json.length; r++) {
    const row = json[r];
    if (!row || row.length === 0) continue;

    const yValue = Number(row[0]); // column A

    for (let c = 1; c < row.length; c++) {
      const cell = row[c];

      if (cell === "" || cell === null || cell === undefined) {
        data.push({
          x: xLabels[c - 1],
          y: yValue,
          thickness: null,
        });
        continue;
      }

      const thickness = parseFloat(cell);

      data.push({
        x: xLabels[c - 1],
        y: yValue,
        thickness: isNaN(thickness) ? null : thickness,
      });
    }
  }

  if (data.length === 0) {
    throw new Error(
      "No valid data points found. Check the C-scan sheet formatting."
    );
  }

  return {
    meta,
    data,
    xCount: xLabels.length,
    yCount: json.length - firstDataRowIndex,
  };
}
