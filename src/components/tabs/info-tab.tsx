
"use client"

import React from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { getConditionClass } from '@/lib/utils'
import { BrainCircuit, Loader2, Layers, FileText, Camera, Pencil, Download } from 'lucide-react'
import { ScrollArea } from '../ui/scroll-area'
import type { Plate } from '@/lib/types'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import { identifyPatches } from '@/reporting/patch-detector'
import { generateAIReport, AIReportData } from '@/reporting/AIReportGenerator'
import { generateReportSummary } from '@/ai/flows/generate-report-summary'
import { generatePatchSummary } from '@/ai/flows/generate-patch-summary'


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
          <Table>
            <TableBody>
            {plate.metadata.map((row, idx) => (
                <TableRow key={idx}>
                <TableCell className="font-medium w-1/3 py-1">{row[0]}</TableCell>
                <TableCell className="py-1">{row[1]}</TableCell>
                </TableRow>
            ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export function InfoTab() {
  const { inspectionResult } = useInspectionStore();
  const { toast } = useToast();
  
  const {
    is3dViewReady,
    captureFunctions,
    isGeneratingScreenshots,
    setIsGeneratingScreenshots,
    screenshotsReady,
    detailsSubmitted,
    setScreenshotData,
    resetReportState,
    setReportMetadata,
    reportMetadata,
    patches,
    overviewScreenshot,
    patchScreenshots
  } = useReportStore();
  
  const [isReportDialogOpen, setIsReportDialogOpen] = React.useState(false);
  const [isGeneratingFinalReport, setIsGeneratingFinalReport] = React.useState(false);


  React.useEffect(() => {
    // Reset report state if inspection data changes
    resetReportState();
  }, [inspectionResult, resetReportState]);

  const handleGenerateScreenshots = async () => {
    if (!inspectionResult) return;

    if (!is3dViewReady || !captureFunctions?.capture) {
      toast({
        variant: "destructive",
        title: "3D Engine Not Ready",
        description: "Please wait a moment for the 3D view to initialize, then try again.",
      });
      return;
    }
    
    setIsGeneratingScreenshots(true);

    try {
      // Small delay to ensure the hidden 3D scene is fully rendered
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Identify defect patches
      const identifiedPatches = identifyPatches(inspectionResult.mergedGrid, 20); // 20% threshold
      
      // 2. Capture overview screenshot
      if (captureFunctions.resetCamera) captureFunctions.resetCamera();
      // Wait for camera to move and scene to re-render in the hidden canvas
      await new Promise(resolve => setTimeout(resolve, 500));
      const overviewScreenshotData = captureFunctions.capture();

      if (!overviewScreenshotData) {
         toast({
            variant: "destructive",
            title: "Screenshot Capture Failed",
            description: "Failed to capture the main overview screenshot. Please try again.",
         });
         setIsGeneratingScreenshots(false);
         return;
      }

      // 3. Capture patch screenshots
      const capturedPatchScreenshots: Record<string, string> = {};
      for (const patch of identifiedPatches) {
        if (captureFunctions.focus) {
          captureFunctions.focus(patch.center.x, patch.center.y);
          // Wait for camera to move and scene to re-render
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const screenshot = captureFunctions.capture();
        if (screenshot) {
          capturedPatchScreenshots[patch.id] = screenshot;
        }
      }
      
      // 4. Store results in state
      setScreenshotData({
        overview: overviewScreenshotData,
        patches: capturedPatchScreenshots,
        patchData: identifiedPatches,
      });

      toast({
        title: "Screenshots Generated",
        description: `Captured ${identifiedPatches.length + 1} images. You can now add report details.`,
      });

    } catch (error) {
      console.error("Failed to generate screenshots", error);
      toast({
        variant: "destructive",
        title: "Screenshot Generation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
        setIsGeneratingScreenshots(false);
    }
  };
  
  const handleGenerateFinalReport = async () => {
      if (!inspectionResult || !screenshotsReady || !reportMetadata) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please ensure screenshots are generated and report details are submitted.",
        });
        return;
      }
      setIsGeneratingFinalReport(true);
      try {
        // 1. Generate AI summaries
        const overallSummary = await generateReportSummary(inspectionResult, patches);

        const patchSummaries: Record<string, string> = {};
        for (const patch of patches) {
            patchSummaries[patch.id] = await generatePatchSummary(patch, inspectionResult.nominalThickness, inspectionResult.assetType);
        }
        
        if (patches.length === 0 && !overallSummary) {
          toast({
            title: "No Critical Defects Found",
            description: "Generating a report indicating no major issues.",
          });
        }

        // 2. Assemble report data
        const reportData: AIReportData = {
            metadata: reportMetadata,
            inspection: inspectionResult,
            patches,
            screenshots: {
                overview: overviewScreenshot!,
                patches: patchScreenshots,
            },
            summaries: {
                overall: overallSummary || "No critical corrosion areas detected below 20% remaining wall thickness.",
                patches: patchSummaries,
            }
        };
        // 3. Generate PDF
        await generateAIReport(reportData);

      } catch (error) {
        console.error("Failed to generate final AI report", error);
        toast({
          variant: "destructive",
          title: "Report Generation Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      } finally {
          setIsGeneratingFinalReport(false);
      }
  };


  if (!inspectionResult) return null

  const { plates, nominalThickness, stats, condition, aiInsight } = inspectionResult

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
    <>
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

            <Card>
              <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                  <FileText className="text-primary"/>
                  Reporting Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground font-bold">1</span>
                  <p>Generate visual assets</p>
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleGenerateScreenshots}
                  disabled={!is3dViewReady || isGeneratingScreenshots || screenshotsReady}
                >
                  {isGeneratingScreenshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2" />}
                  {isGeneratingScreenshots ? 'Generating...' : (screenshotsReady ? 'Screenshots Ready' : 'Generate Screenshots')}
                </Button>

                <Separator />
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground font-bold">2</span>
                  <p>Fill in report details</p>
                </div>
                 <Button 
                  className="w-full" 
                  onClick={() => setIsReportDialogOpen(true)}
                  disabled={!screenshotsReady}
                  variant="outline"
                >
                  <Pencil className="mr-2" />
                  {detailsSubmitted ? 'Edit Report Details' : 'Add Report Details'}
                </Button>

                <Separator />

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground font-bold">3</span>
                  <p>Create and download PDF</p>
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleGenerateFinalReport}
                  disabled={!screenshotsReady || !detailsSubmitted || isGeneratingFinalReport}
                >
                  {isGeneratingFinalReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2" />}
                  {isGeneratingFinalReport ? 'Generating...' : 'Generate Final Report'}
                </Button>

              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </ScrollArea>
    {isReportDialogOpen && <AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} onSubmit={setReportMetadata} />}
    </>
  )
}
