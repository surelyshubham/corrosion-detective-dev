
"use client"

import React, { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useInspectionStore } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Download, ArrowUpDown, Search, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { downloadFile } from '@/lib/utils'
import { ScrollArea } from '../ui/scroll-area'
import type { MergedCell } from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

interface TableDataPoint extends MergedCell {
    x: number;
    y: number;
    deviation: number | null;
    wallLoss: number | null;
}

type SortKey = keyof TableDataPoint;
type SortDirection = 'asc' | 'desc'

const PREVIEW_ROW_COUNT = 100;

export function DataTableTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const [filter, setFilter] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)

  const data = useMemo(() => {
      const mergedGrid = DataVault.gridMatrix;
      if (!inspectionResult || !mergedGrid) return [];
      
      const { nominalThickness } = inspectionResult;
      const tableData: TableDataPoint[] = [];
      for (let y = 0; y < mergedGrid.length; y++) {
          for (let x = 0; x < (mergedGrid[y]?.length || 0); x++) {
              const cell = mergedGrid[y][x];
              if (cell && cell.plateId) {
                  tableData.push({
                      ...cell,
                      x,
                      y,
                      deviation: cell.effectiveThickness !== null ? cell.effectiveThickness - nominalThickness : null,
                      wallLoss: cell.effectiveThickness !== null ? nominalThickness - cell.effectiveThickness : null,
                  });
              }
          }
      }
      return tableData;
  }, [inspectionResult])


  const sortedAndFilteredData = useMemo(() => {
    let filteredData = data
    if (filter) {
      filteredData = data.filter(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(filter.toLowerCase())
        )
      )
    }

    if (sortConfig !== null) {
      return [...filteredData].sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]

        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return filteredData
  }, [data, filter, sortConfig])

  const previewData = useMemo(() => sortedAndFilteredData.slice(0, PREVIEW_ROW_COUNT), [sortedAndFilteredData]);


  const handleExport = () => {
    if (!inspectionResult) return;
    const fileName = inspectionResult.plates.map(p => p.fileName.replace('.xlsx', '').replace('.csv', '')).join('_') || 'merged_export';
    const sheet = XLSX.utils.json_to_sheet(sortedAndFilteredData.map(d => ({
        x: d.x,
        y: d.y,
        plateId: d.plateId,
        rawThickness: d.rawThickness?.toFixed(3) ?? 'ND',
        effectiveThickness: d.effectiveThickness?.toFixed(3) ?? 'ND',
        deviation: d.deviation?.toFixed(3) ?? 'N/A',
        percentage: d.percentage?.toFixed(1) ?? 'N/A',
        wallLoss: d.wallLoss?.toFixed(3) ?? 'N/A',
    })))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data')
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' })
    downloadFile(blob, `${fileName}_data.xlsx`)
  }

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

  const columns: { key: SortKey; label: string }[] = [
    { key: 'x', label: 'X' },
    { key: 'y', label: 'Y' },
    { key: 'plateId', label: 'Plate ID'},
    { key: 'rawThickness', label: 'Raw Thickness (mm)' },
    { key: 'effectiveThickness', label: 'Effective Thickness (mm)' },
    { key: 'deviation', label: 'Deviation (mm)' },
    { key: 'percentage', label: 'Percentage (%)' },
    { key: 'wallLoss', label: 'Wall Loss (mm)' },
  ]

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Filter data..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-10 w-full md:w-80"
            />
        </div>
        <Button onClick={handleExport} variant="outline" disabled={!inspectionResult}>
          <Download className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
      </div>

       {sortedAndFilteredData.length > PREVIEW_ROW_COUNT && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Performance Notice</AlertTitle>
          <AlertDescription>
            Showing the first {PREVIEW_ROW_COUNT} of {sortedAndFilteredData.length} data points for preview. Use the "Export to Excel" button to get the full dataset.
          </AlertDescription>
        </Alert>
      )}


      <ScrollArea className="border rounded-md flex-grow">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.key}>
                  <Button variant="ghost" onClick={() => requestSort(col.key)}>
                    {col.label}
                    {sortConfig?.key === col.key && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                    {sortConfig?.key !== col.key && <ArrowUpDown className="ml-2 h-4 w-4" />}
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewData.map((item, index) => (
              <TableRow 
                key={`${item.x}-${item.y}-${index}`}
                onClick={() => setSelectedPoint({x: item.x, y: item.y})}
                className={selectedPoint?.x === item.x && selectedPoint?.y === item.y ? 'bg-primary/20' : ''}
              >
                <TableCell>{item.x}</TableCell>
                <TableCell>{item.y}</TableCell>
                <TableCell className="truncate max-w-xs">{item.plateId}</TableCell>
                <TableCell>{item.rawThickness !== null ? item.rawThickness.toFixed(3) : 'ND'}</TableCell>
                <TableCell>{item.effectiveThickness !== null ? item.effectiveThickness.toFixed(3) : 'ND'}</TableCell>
                <TableCell>{item.deviation !== null ? item.deviation.toFixed(3) : 'N/A'}</TableCell>
                <TableCell>{item.percentage !== null ? item.percentage.toFixed(1) : 'N/A'}</TableCell>
                <TableCell>{item.wallLoss !== null ? item.wallLoss.toFixed(3) : 'N/A'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
