
"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useInspectionStore } from "@/store/use-inspection-store"
import { parseExcel } from "@/lib/excel-parser"
import { processData } from "@/lib/data-processor"
import { generateCorrosionInsight } from "@/ai/flows/generate-corrosion-insight"
import type { AssetType, Plate } from "@/lib/types"
import type { ThreeDeeViewRef } from "./tabs/three-dee-view-tab"

import { SetupTab } from "./tabs/setup-tab"
import { InfoTab } from "./tabs/info-tab"
import { DataTableTab } from "./tabs/data-table-tab"
import { TwoDeeHeatmapTab } from "./tabs/two-dee-heatmap-tab"
import { ThreeDeeViewTab } from "./tabs/three-dee-view-tab"
import { FileUp, GanttChartSquare, Image, Info, Table } from "lucide-react"
import { Card, CardContent } from "./ui/card"


const TABS = [
  { value: "setup", label: "Setup", icon: FileUp },
  { value: "info", label: "Info", icon: Info },
  { value: "3d-view", label: "3D View", icon: GanttChartSquare },
  { value: "2d-heatmap", label: "2D Heatmap", icon: Image },
  { value: "data-table", label: "Data Table", icon: Table },
]

export function MainApp() {
  const { toast } = useToast()
  const { inspectionResult, addPlate, setIsLoading, isLoading, updateAIInsight, reprocessPlates } = useInspectionStore()
  const [activeTab, setActiveTab] = useState("setup")
  const threeDeeViewRef = useRef<ThreeDeeViewRef>(null);

  const handleFileProcess = useCallback(
    async (file: File, assetType: AssetType, nominalThickness: number, options: {
      direction: 'left' | 'right' | 'top' | 'bottom';
      start: number;
      pipeOuterDiameter?: number;
      pipeLength?: number;
    }) => {
      setIsLoading(true)
      try {
        const arrayBuffer = await file.arrayBuffer()
        // The parser now returns only raw data, not processed.
        const { metadata, data: rawGridData, detectedNominalThickness } = parseExcel(arrayBuffer)
        
        if (rawGridData.length === 0) {
          throw new Error("No valid data points found in the Excel file. Please check the data sheet for valid thickness values.")
        }
        
        // Processing happens here, using the final nominal thickness from the form
        const { processedData, stats } = processData(rawGridData, nominalThickness);

        const newPlate: Plate = {
          id: file.name,
          fileName: file.name,
          assetType,
          nominalThickness,
          pipeOuterDiameter: options.pipeOuterDiameter,
          pipeLength: options.pipeLength,
          // Store both raw and processed data
          rawGridData: rawGridData,
          processedData,
          stats,
          metadata,
        };
        
        addPlate(newPlate, options);
        
        setActiveTab("info")
        toast({
          title: "Processing Complete",
          description: `${file.name} has been successfully processed and ${inspectionResult ? 'merged' : 'loaded'}.`,
        })

      } catch (error: any) {
        console.error(error)
        toast({
          variant: "destructive",
          title: "Processing Failed",
          description: error.message || "An unknown error occurred during file processing.",
        })
      } finally {
        setIsLoading(false)
      }
    },
    [setIsLoading, toast, addPlate, inspectionResult]
  );
  
  useEffect(() => {
    if (inspectionResult && !inspectionResult.aiInsight) {
       generateCorrosionInsight({
          assetType: inspectionResult.assetType,
          nominalThickness: inspectionResult.nominalThickness,
          minThickness: inspectionResult.stats.minThickness,
          maxThickness: inspectionResult.stats.maxThickness,
          avgThickness: inspectionResult.stats.avgThickness,
          areaBelow80: inspectionResult.stats.areaBelow80,
          areaBelow70: inspectionResult.stats.areaBelow70,
          areaBelow60: inspectionResult.stats.areaBelow60,
          worstLocationX: inspectionResult.stats.worstLocation.x,
          worstLocationY: inspectionResult.stats.worstLocation.y,
          minPercentage: inspectionResult.stats.minPercentage,
        }).then(aiInsight => {
          updateAIInsight(aiInsight);
          toast({
            title: "AI Insight Generated",
            description: "Corrosion analysis and recommendations are now available in the Info tab.",
          });
        }).catch(err => {
          console.error("AI Insight Error:", err);
           updateAIInsight({ condition: "Error", recommendation: "Could not generate AI insight." });
          toast({
            variant: "destructive",
            title: "AI Insight Failed",
            description: "Could not generate AI-powered insights for the latest data.",
          });
        });
    }
  }, [inspectionResult, updateAIInsight, toast]);


  const isDataLoaded = !!inspectionResult;

  const getTabContentClass = (tabValue: string) => {
    return activeTab === tabValue ? 'block h-full' : 'hidden';
  };
  
  const threeDViewStyle: React.CSSProperties =
    activeTab === '3d-view'
      ? { height: '100%', position: 'relative', zIndex: 10 }
      : {
          position: 'fixed',
          left: '0px',
          top: '0px',
          width: '800px',
          height: '600px',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
        };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col p-4 md:p-6 gap-6">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto">
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} disabled={!isDataLoaded && tab.value !== 'setup'} className="flex-col sm:flex-row gap-2 h-14 sm:h-10">
              <tab.icon className="w-4 h-4"/>
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        
        <div className="flex-grow min-h-0 relative">
            <div className={getTabContentClass('setup')}>
              <SetupTab 
                onFileProcess={handleFileProcess} 
                isLoading={isLoading} 
                onNominalThicknessChange={reprocessPlates}
              />
            </div>
            <div className={getTabContentClass('info')}>
              {isDataLoaded ? <InfoTab viewRef={threeDeeViewRef} /> : <DataPlaceholder />}
            </div>
            <div className={getTabContentClass('2d-heatmap')}>
              {isDataLoaded ? <TwoDeeHeatmapTab /> : <DataPlaceholder />}
            </div>
            <div className={getTabContentClass('data-table')}>
              {isDataLoaded ? <DataTableTab /> : <DataPlaceholder />}
            </div>
            {/* Always mount 3D view but control visibility */}
            <div style={threeDViewStyle}>
                {isDataLoaded ? <ThreeDeeViewTab ref={threeDeeViewRef} /> : <DataPlaceholder />}
            </div>
        </div>
      </Tabs>
    </>
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

    