
"use client"

import React from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getConditionClass } from '@/lib/utils'
import { BrainCircuit, Loader2, Layers } from 'lucide-react'
import { ScrollArea } from '../ui/scroll-area'
import type { Plate } from '@/lib/types'

const PlateStatsCard = ({ plate, index }: { plate: Plate; index: number }) => {
  const stats = plate.stats
  
  const statsData = [
    { label: 'Min Eff. Thickness', value: `${stats.minThickness.toFixed(2)} mm (${stats.minPercentage.toFixed(1)}%)` },
    { label: 'Max Eff. Thickness', value: `${stats.maxThickness.toFixed(2)} mm` },
    { label: 'Average Eff. Thickness', value: `${stats.avgThickness.toFixed(2)} mm` },
    { label: 'Worst Location', value: `X: ${stats.worstLocation.x}, Y: ${stats.worstLocation.y}` },
    { label: 'Corroded Area (<80%)', value: `${stats.areaBelow80.toFixed(2)}%`, className: stats.areaBelow80 > 0 ? 'text-orange-500' : ''},
    { label: 'Corroded Area (<70%)', value: `${stats.areaBelow70.toFixed(2)}%`, className: stats.areaBelow70 > 0 ? 'text-red-500' : ''},
    { label: 'Corroded Area (<60%)', value: `${stats.areaBelow60.toFixed(2)}%`, className: stats.areaBelow60 > 0 ? 'text-red-700 font-bold' : ''},
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline text-lg">Plate {index + 1}: {plate.fileName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Statistics</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {statsData.map(item => (
              <div key={item.label} className="flex justify-between border-b pb-1">
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className={`text-sm font-semibold ${item.className || ''}`}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Metadata</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {plate.metadata.map((row, idx) => (
                <div key={idx} className="flex justify-between border-b pb-1">
                 <dt className="text-sm text-muted-foreground truncate" title={String(row[0])}>{String(row[0])}</dt>
                 <dd className="text-sm font-semibold">{String(row[1])}</dd>
                </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
};


export function InfoTab() {
  const { inspectionResult } = useInspectionStore();
  const stats = DataVault.stats;

  if (!inspectionResult || !stats) return null

  const { plates, nominalThickness, condition, aiInsight } = inspectionResult

  const summaryData = [
    { label: 'Asset Type', value: inspectionResult.assetType },
    { label: 'Nominal Thickness', value: `${nominalThickness.toFixed(2)} mm` },
    { label: 'Overall Condition', value: condition, className: getConditionClass(condition) },
    { label: 'Total Scanned Area', value: `${stats.scannedArea.toFixed(2)} m²` },
    { label: 'Total Points in Grid', value: stats.totalPoints.toLocaleString() },
    { label: 'Not Scanned (ND) Points', value: stats.countND.toLocaleString() },
  ]
  
  const overallStatsData = [
    { label: 'Min Eff. Thickness', value: `${stats.minThickness.toFixed(2)} mm (${stats.minPercentage.toFixed(1)}%)` },
    { label: 'Max Eff. Thickness', value: `${stats.maxThickness.toFixed(2)} mm` },
    { label: 'Average Eff. Thickness', value: `${stats.avgThickness.toFixed(2)} mm` },
    { label: 'Worst Location', value: `X: ${stats.worstLocation.x}, Y: ${stats.worstLocation.y}` },
    { label: 'Corroded Area (<80%)', value: `${stats.areaBelow80.toFixed(2)}%`, className: stats.areaBelow80 > 0 ? 'text-orange-500' : ''},
    { label: 'Corroded Area (<70%)', value: `${stats.areaBelow70.toFixed(2)}%`, className: stats.areaBelow70 > 0 ? 'text-red-500' : ''},
    { label: 'Corroded Area (<60%)', value: `${stats.areaBelow60.toFixed(2)}%`, className: stats.areaBelow60 > 0 ? 'text-red-700 font-bold' : ''},
  ]

  return (
    <ScrollArea className="h-full pr-4">
      <div className="grid md:grid-cols-3 gap-6 animate-fade-in">
        <div className="md:col-span-2 space-y-6">

          {plates.map((plate, index) => (
            <PlateStatsCard key={plate.id} plate={plate} index={index} />
          ))}

          {plates.length > 1 && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline">Overall Inspection Summary</CardTitle>
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
                  <CardTitle className="font-headline">Overall Corrosion Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                    {overallStatsData.map(item => (
                      <div key={item.label} className="flex justify-between border-b pb-1">
                        <dt className="text-sm text-muted-foreground">{item.label}</dt>
                        <dd className={`text-sm font-semibold ${item.className || ''}`}>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </>
          )}

        </div>

        <div className="md:col-span-1">
          <div className="sticky top-6 space-y-6">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                  <BrainCircuit className="text-primary"/>
                  AI-Powered Insight
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aiInsight ? (
                  aiInsight.condition === 'Error' ? (
                    <div className="text-destructive">{aiInsight.recommendation}</div>
                  ) : (
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
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-sm">Generating insights for the merged data...</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {plates.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline flex items-center gap-2">
                    <Layers className="text-primary" />
                    Plate Layout
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">The 2D Heatmap and 3D View tabs show the visual layout of the merged plates.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

    