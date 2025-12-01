"use client"

import React from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { getConditionClass } from '@/lib/utils'
import { BrainCircuit, Loader2 } from 'lucide-react'

export function InfoTab() {
  const { inspectionResult } = useInspectionStore()

  if (!inspectionResult) return null

  const { fileName, assetType, nominalThickness, stats, condition, metadata, aiInsight } = inspectionResult

  const summaryData = [
    { label: 'File Name', value: fileName },
    { label: 'Asset Type', value: assetType },
    { label: 'Nominal Thickness', value: `${nominalThickness.toFixed(2)} mm` },
    { label: 'Condition', value: condition, className: getConditionClass(condition) },
    { label: 'Scanned Area', value: `${stats.scannedArea.toFixed(2)} m²` },
    { label: 'Total Points Scanned', value: stats.totalPoints.toLocaleString() },
    { label: 'Not Scanned (ND) Points', value: stats.countND.toLocaleString() },
  ]
  
  const statsData = [
    { label: 'Min Thickness', value: `${stats.minThickness.toFixed(2)} mm (${stats.minPercentage.toFixed(1)}%)` },
    { label: 'Max Thickness', value: `${stats.maxThickness.toFixed(2)} mm` },
    { label: 'Average Thickness', value: `${stats.avgThickness.toFixed(2)} mm` },
    { label: 'Worst Location', value: `X: ${stats.worstLocation.x}, Y: ${stats.worstLocation.y}` },
    { label: 'Corroded Area (<80%)', value: `${stats.areaBelow80.toFixed(2)}%`, className: stats.areaBelow80 > 5 ? 'text-orange-500' : ''},
    { label: 'Corroded Area (<70%)', value: `${stats.areaBelow70.toFixed(2)}%`, className: stats.areaBelow70 > 0 ? 'text-red-500' : ''},
    { label: 'Corroded Area (<60%)', value: `${stats.areaBelow60.toFixed(2)}%`, className: stats.areaBelow60 > 0 ? 'text-red-700' : ''},
  ]

  return (
    <div className="grid md:grid-cols-3 gap-6 animate-fade-in">
      <div className="md:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Inspection Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              {summaryData.map(item => (
                <div key={item.label} className="flex justify-between border-b pb-1">
                  <dt className="text-sm text-muted-foreground">{item.label}</dt>
                  <dd className={`text-sm font-semibold ${item.className || ''}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Corrosion Statistics</CardTitle>
          </CardHeader>
          <CardContent>
             <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              {statsData.map(item => (
                <div key={item.label} className="flex justify-between border-b pb-1">
                  <dt className="text-sm text-muted-foreground">{item.label}</dt>
                  <dd className={`text-sm font-semibold ${item.className || ''}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {metadata && metadata.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">File Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {metadata.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row[0]}</TableCell>
                      <TableCell>{row[1]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="md:col-span-1">
        <Card className="bg-card sticky top-6">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <BrainCircuit className="text-primary"/>
              AI-Powered Insight
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiInsight ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">Condition Analysis</h4>
                   <p className="text-sm text-muted-foreground">{aiInsight.condition}</p>
                </div>
                <Separator />
                <div>
                  <h4 className="font-semibold text-sm">Recommended Action</h4>
                  <p className="text-sm font-bold text-accent">{aiInsight.recommendation}</p>
                </div>
              </div>
            ) : (
               <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm">Generating insights and recommendations...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
