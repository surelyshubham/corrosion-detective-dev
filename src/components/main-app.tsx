

"use client"

import React, { useState, useEffect, useRef } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useInspectionStore } from "@/store/use-inspection-store"
import { generateCorrosionInsight } from "@/ai/flows/generate-corrosion-insight"
import type { ThreeDeeViewRef } from "./tabs/three-dee-view-tab"

import { SetupTab } from "./tabs/setup-tab"
import { InfoTab } from "./tabs/info-tab"
import { DataTableTab } from "./tabs/data-table-tab"
import { TwoDeeHeatmapTab } from "./tabs/two-dee-heatmap-tab"
import { ThreeDeeViewTab } from "./tabs/three-dee-view-tab"
import { ReportTab } from "./tabs/report-tab"
import { FileUp, GanttChartSquare, Image, Info, Table, FileText, Loader2 } from "lucide-react"
import { Card, CardContent } from "./ui/card"
import { DataVault } from "@/store/data-vault"


const TABS = [
  { value: "setup", label: "Setup", icon: FileUp },
  { value: "info", label: "Info", icon: Info },
  { value: "3d-view", label: "3D View", icon: GanttChartSquare },
  { value: "2d-heatmap", label: "2D Heatmap", icon: Image },
  { value: "report", label: "Report", icon: FileText },
  { value: "data-table", label: "Data Table", icon: Table },
]

export function MainApp() {
  const { toast } = useToast()
  const { inspectionResult, isLoading, loadingProgress, updateAIInsight, reprocessPlates } = useInspectionStore()
  const [activeTab, setActiveTab] = useState("setup")
  const threeDeeViewRef = useRef<ThreeDeeViewRef>(null);

  // Effect to automatically switch tabs after processing
  useEffect(() => {
    if (inspectionResult && activeTab === 'setup' && !isLoading) {
      setActiveTab("info");
      toast({
        title: "Processing Complete",
        description: `Data has been successfully processed and loaded.`,
      })
    }
  }, [inspectionResult, activeTab, isLoading, toast]);
  
  // Temporarily disabled for rendering test
  // useEffect(() => {
  //   if (inspectionResult && DataVault.stats && !inspectionResult.aiInsight) {
  //      generateCorrosionInsight({
  //         assetType: inspectionResult.assetType,
  //         nominalThickness: inspectionResult.nominalThickness,
  //         minThickness: DataVault.stats.minThickness,
  //         maxThickness: DataVault.stats.maxThickness,
  //         avgThickness: DataVault.stats.avgThickness,
  //         areaBelow80: DataVault.stats.areaBelow80,
  //         areaBelow70: DataVault.stats.areaBelow70,
  //         areaBelow60: DataVault.stats.areaBelow60,
  //         worstLocationX: DataVault.stats.worstLocation.x,
  //         worstLocationY: DataVault.stats.worstLocation.y,
  //         minPercentage: DataVault.stats.minPercentage,
  //       }).then(aiInsight => {
  //         updateAIInsight(aiInsight);
  //         toast({
  //           title: "AI Insight Generated",
  //           description: "Corrosion analysis and recommendations are now available in the Info tab.",
  //         });
  //       }).catch(err => {
  //         console.error("AI Insight Error:", err);
  //          updateAIInsight({ condition: "Error", recommendation: "Could not generate AI insight." });
  //         toast({
  //           variant: "destructive",
  //           title: "AI Insight Failed",
  //           description: "Could not generate AI-powered insights for the latest data.",
  //         });
  //       });
  //   }
  // }, [inspectionResult, updateAIInsight, toast]);


  const isDataLoaded = !!inspectionResult;

  const getTabContentStyle = (tabValue: string) => ({
    display: activeTab === tabValue ? 'block' : 'none',
    height: '100%',
  });
  
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

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h3 className="mt-4 text-lg font-semibold font-headline">Processing Data...</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Please wait while we analyze the inspection files.
            </p>
            <progress value={loadingProgress} max="100" className="w-full mt-4" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col p-4 md:p-6 gap-6">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
          {TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} disabled={!isDataLoaded && tab.value !== 'setup'} className="flex-col sm:flex-row gap-2 h-14 sm:h-10">
              <tab.icon className="w-4 h-4"/>
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        
        <div className="flex-grow min-h-0 relative">
            <div style={getTabContentStyle('setup')}>
              <SetupTab />
            </div>
            <div style={getTabContentStyle('info')}>
              {isDataLoaded ? <InfoTab /> : <DataPlaceholder />}
            </div>
            <div style={getTabContentStyle('2d-heatmap')}>
              {isDataLoaded ? <TwoDeeHeatmapTab /> : <DataPlaceholder />}
            </div>
            <div style={getTabContentStyle('data-table')}>
              {isDataLoaded ? <DataTableTab /> : <DataPlaceholder />}
            </div>
             <div style={getTabContentStyle('report')}>
              {isDataLoaded ? <ReportTab viewRef={threeDeeViewRef} /> : <DataPlaceholder />}
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
