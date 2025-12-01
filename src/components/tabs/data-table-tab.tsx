"use client"

import React, { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Download, ArrowUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { downloadFile } from '@/lib/utils'
import { ScrollArea } from '../ui/scroll-area'
import type { InspectionDataPoint } from '@/lib/types'

type SortKey = keyof InspectionDataPoint
type SortDirection = 'asc' | 'desc'

export function DataTableTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const [filter, setFilter] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)

  const data = inspectionResult?.processedData || []

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

        if (aVal === null) return 1
        if (bVal === null) return -1
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return filteredData
  }, [data, filter, sortConfig])

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleExport = () => {
    const sheet = XLSX.utils.json_to_sheet(sortedAndFilteredData.map(d => ({
        x: d.x,
        y: d.y,
        thickness: d.thickness?.toFixed(3) ?? 'ND',
        deviation: d.deviation?.toFixed(3) ?? 'N/A',
        percentage: d.percentage?.toFixed(1) ?? 'N/A',
        wallLoss: d.wallLoss?.toFixed(3) ?? 'N/A',
    })))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data')
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' })
    downloadFile(blob, `${inspectionResult?.fileName.replace('.xlsx', '')}_data.xlsx`)
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'x', label: 'X' },
    { key: 'y', label: 'Y' },
    { key: 'thickness', label: 'Thickness (mm)' },
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
        <Button onClick={handleExport} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
      </div>
      <ScrollArea className="border rounded-md flex-grow">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.key}>
                  <Button variant="ghost" onClick={() => requestSort(col.key)}>
                    {col.label}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAndFilteredData.map((item, index) => (
              <TableRow 
                key={`${item.x}-${item.y}-${index}`}
                onClick={() => setSelectedPoint({x: item.x, y: item.y})}
                className={selectedPoint?.x === item.x && selectedPoint?.y === item.y ? 'bg-primary/20' : ''}
              >
                <TableCell>{item.x}</TableCell>
                <TableCell>{item.y}</TableCell>
                <TableCell>{item.thickness !== null ? item.thickness.toFixed(3) : 'ND'}</TableCell>
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
