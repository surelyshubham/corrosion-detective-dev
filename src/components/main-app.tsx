"use client"

import React, { useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useInspectionStore } from "@/store/use-inspection-store"
import { parseExcel } from "@/lib/excel-parser"
import { processData } from "@/lib/data-processor"
import { generateCorrosionInsight } from "@/ai/flows/generate-corrosion-insight"
import type { AssetType, InspectionResult } from "@/lib/types"

import { SetupTab } from "./tabs/setup-tab"
import { InfoTab } from "./tabs/info-tab"
import { DataTableTab } from "./tabs/data-table-tab"
import { TwoDeeHeatmapTab } from "./tabs/two-dee-heatmap-tab"
import { ThreeDeeViewTab } from "./tabs/three-dee-view-tab"
import { MergeTab } from "./tabs/merge-tab"
import { FileUp, GanttChartSquare, Image, Info, Merge, Table, BrainCircuit } from "lucide-react"
import { Card, CardContent } from "./ui/card"

const TABS = [
  { value: "setup", label: "Setup", icon: FileUp },
  { value: "info", label: "Info", icon: Info },
  { value: "3d-view", label: "3D View", icon: GanttChartSquare },
  { value: "2d-heatmap", label: "2D Heatmap", icon: Image },
  { value: "data-table", label: "Data Table", icon: Table },
  { value: "merge", label: "Merge", icon: Merge },
]

export function MainApp() {
  const { toast } = useToast()
  const { inspectionResult, setInspectionResult, setIsLoading, isLoading, updateAIInsight } = useInspectionStore()
  const [activeTab, setActiveTab] = useState("setup")

  const handleFileProcess = useCallback(
    async (file: File, assetType: AssetType, nominalThickness: number) => {
      setIsLoading(true)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const { metadata, data } = parseExcel(arrayBuffer)
        
        if (data.length === 0) {
          throw new Error("No valid data points found in the Excel file. Please check Sheet 2 for 'x', 'y', 'thickness' columns.")
        }
        
        const { processedData, stats, condition } = processData(data, nominalThickness)

        const result: InspectionResult = {
          fileName: file.name,
          assetType,
          nominalThickness,
          processedData,
          stats,
          condition,
          metadata,
          aiInsight: null,
        }

        setInspectionResult(result)
        setActiveTab("info")
        toast({
          title: "Processing Complete",
          description: `${file.name} has been successfully processed.`,
        })

        // Fire and forget AI insight generation
        generateCorrosionInsight({
          assetType,
          nominalThickness,
          minThickness: stats.minThickness,
          maxThickness: stats.maxThickness,
          avgThickness: stats.avgThickness,
          areaBelow80: stats.areaBelow80,
          areaBelow70: stats.areaBelow70,
          areaBelow60: stats.areaBelow60,
          worstLocationX: stats.worstLocation.x,
          worstLocationY: stats.worstLocation.y,
          minPercentage: stats.minPercentage,
        }).then(aiInsight => {
          updateAIInsight(aiInsight);
          toast({
            title: "AI Insight Generated",
            description: "Corrosion analysis and recommendations are now available in the Info tab.",
          });
        }).catch(err => {
          console.error("AI Insight Error:", err);
          toast({
            variant: "destructive",
            title: "AI Insight Failed",
            description: "Could not generate AI-powered insights.",
          });
        });

      } catch (error: any) {
        console.error(error)
        toast({
          variant: "destructive",
          title: "Processing Failed",
          description: error.message || "An unknown error occurred during file processing.",
        })
        setInspectionResult(null)
      } finally {
        setIsLoading(false)
      }
    },
    [setIsLoading, setInspectionResult, toast, updateAIInsight]
  )
  
  const isDataLoaded = !!inspectionResult;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col p-4 md:p-6 gap-6">
      <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
        {TABS.map(tab => (
           <TabsTrigger key={tab.value} value={tab.value} disabled={!isDataLoaded && tab.value !== 'setup'} className="flex-col sm:flex-row gap-2 h-14 sm:h-10">
            <tab.icon className="w-4 h-4"/>
            <span>{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      
      <div className="flex-grow">
        <TabsContent value="setup" className="h-full">
          <SetupTab onFileProcess={handleFileProcess} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="info" className="h-full">
          {isDataLoaded ? <InfoTab /> : <DataPlaceholder />}
        </TabsContent>
        <TabsContent value="3d-view" className="h-full">
          {isDataLoaded ? <ThreeDeeViewTab /> : <DataPlaceholder />}
        </TabsContent>
        <TabsContent value="2d-heatmap" className="h-full">
          {isDataLoaded ? <TwoDeeHeatmapTab /> : <DataPlaceholder />}
        </TabsContent>
        <TabsContent value="data-table" className="h-full">
          {isDataLoaded ? <DataTableTab /> : <DataPlaceholder />}
        </TabsContent>
        <TabsContent value="merge" className="h-full">
          {isDataLoaded ? <MergeTab /> : <DataPlaceholder />}
        </TabsContent>
      </div>
    </Tabs>
  )
}

const DataPlaceholder = () => (
    <Card className="h-full flex items-center justify-center">
        <CardContent className="pt-6 text-center">
            <FileUp className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold font-headline">No Data Loaded</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                Please go to the 'Setup' tab to upload an inspection file.
            </p>
        </CardContent>
    </Card>
)
