
"use client"

import React, { useEffect, useState } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { getConditionClass } from '@/lib/utils'
import { BrainCircuit, Loader2, Layers, FileText, Camera, Pencil, Download, CheckCircle, Info, Lock, Edit } from 'lucide-react'
import { ScrollArea } from '../ui/scroll-area'
import type { Plate } from '@/lib/types'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import { identifyPatches } from '@/reporting/patch-detector'
import { generateAIReport, AIReportData } from '@/reporting/AIReportGenerator'
import { generateReportSummary } from '@/ai/flows/generate-report-summary'
import { generateAllPatchSummaries } from '@/ai/flows/generate-all-patch-summaries'
import { Progress } from '../ui/progress'
import { Slider } from '../ui/slider'
import { Label } from '../ui/label'
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import type { ThreeDeeViewRef } from './three-dee-view-tab'


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

interface InfoTabProps {
  viewRef: React.RefObject<ThreeDeeViewRef>;
}

export function InfoTab({ viewRef }: InfoTabProps) {
  const { inspectionResult } = useInspectionStore();
  const { toast } = useToast();
  
  const {
    isGeneratingScreenshots,
    setIsGeneratingScreenshots,
    screenshotsReady,
    setScreenshotData,
    resetReportState,
    reportMetadata,
    setReportMetadata,
    detailsSubmitted,
    patches,
    setPatches,
    globalScreenshots,
    patchScreenshots,
    captureProgress,
    setCaptureProgress,
    defectThreshold,
    setDefectThreshold,
    isThresholdLocked,
    setIsThresholdLocked,
  } = useReportStore();
  
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isGeneratingFinalReport, setIsGeneratingFinalReport] = useState(false);
  const captureFunctions = viewRef.current;
  const is3dViewReady = !!captureFunctions?.capture;

  useEffect(() => {
    // Reset report state if inspection data changes
    resetReportState();
  }, [inspectionResult, resetReportState]);

  // Live patch detection when slider changes
  useEffect(() => {
    if (inspectionResult) {
      const detected = identifyPatches(inspectionResult.mergedGrid, defectThreshold);
      setPatches(detected);
    }
  }, [defectThreshold, inspectionResult, setPatches]);


  const handleGenerateScreenshots = async () => {
    if (!is3dViewReady) {
      toast({
        variant: "destructive",
        title: "3D Engine Not Ready",
        description: "Please wait a moment for the 3D view to initialize, then try again.",
      });
      return;
    }
    
    setIsGeneratingScreenshots(true);
    setCaptureProgress({ current: 0, total: 1 });

    try {
      const identifiedPatches = patches; 
      const totalImages = 3 + (identifiedPatches.length * 2);
      setCaptureProgress({ current: 0, total: totalImages });
      
      const capturedGlobalScreenshots: any = {};
      const capturedPatchScreenshots: Record<string, any> = {};
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const globalViews: ('iso' | 'top' | 'side')[] = ['iso', 'top', 'side'];
      for (const view of globalViews) {
        setCaptureProgress(prev => ({ current: (prev?.current ?? 0) + 1, total: totalImages }));
        captureFunctions.setView(view);
        await new Promise(resolve => setTimeout(resolve, 500));
        const screenshot = captureFunctions.capture();
        if (screenshot) {
          capturedGlobalScreenshots[view] = screenshot;
        } else {
            throw new Error(`Failed to capture global ${view} view.`);
        }
      }

      for (const patch of identifiedPatches) {
        captureFunctions.focus(patch.center.x, patch.center.y, true);
        
        setCaptureProgress(prev => ({ current: (prev?.current ?? 0) + 1, total: totalImages }));
        captureFunctions.setView('iso');
        await new Promise(resolve => setTimeout(resolve, 500));
        const isoScreenshot = captureFunctions.capture();
        
        setCaptureProgress(prev => ({ current: (prev?.current ?? 0) + 1, total: totalImages }));
        captureFunctions.setView('top');
        await new Promise(resolve => setTimeout(resolve, 500));
        const topScreenshot = captureFunctions.capture();
        
        captureFunctions.resetCamera();

        if (isoScreenshot && topScreenshot) {
          capturedPatchScreenshots[patch.id] = { iso: isoScreenshot, top: topScreenshot };
        } else {
            throw new Error(`Failed to capture patch ${patch.id} images.`);
        }
      }
      
      captureFunctions.resetCamera();

      setScreenshotData({
        global: capturedGlobalScreenshots,
        patches: capturedPatchScreenshots,
      });

      toast({
        title: "Screenshots Generated Successfully",
        description: `Captured ${totalImages} images. You can now add report details.`,
      });

    } catch (error) {
      console.error("Failed to generate screenshots", error);
      toast({
        variant: "destructive",
        title: "Screenshot Generation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
      // Do not reset the entire state, just the capturing part
      setIsGeneratingScreenshots(false);
      setCaptureProgress(null);
    }
  };
  
  const handleGenerateFinalReport = async () => {
      if (!screenshotsReady || !reportMetadata) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please ensure screenshots are generated and report details are submitted.",
        });
        return;
      }
      setIsGeneratingFinalReport(true);
      try {
        const overallSummary = await generateReportSummary(inspectionResult!, patches, defectThreshold);

        let patchSummaries: Record<string, string> = {};
        if (patches.length > 0) {
            const allPatchesInput = {
                patches: patches.map(p => ({
                    patchId: p.id,
                    minThickness: p.minThickness.toFixed(2),
                    severity: p.severity,
                    xMin: p.coordinates.xMin,
                    xMax: p.coordinates.xMax,
                    yMin: p.coordinates.yMin,
                    yMax: p.coordinates.yMax,
                })),
                assetType: inspectionResult!.assetType,
                nominalThickness: inspectionResult!.nominalThickness,
                defectThreshold: defectThreshold,
            };
            const allSummariesResult = await generateAllPatchSummaries(allPatchesInput);
            for (const summary of allSummariesResult.summaries) {
                patchSummaries[summary.patchId] = summary.summary;
            }
        }
        
        if (patches.length === 0 && !overallSummary) {
          toast({
            title: "No Critical Defects Found",
            description: `Generating a report indicating no issues below the ${defectThreshold}% threshold.`,
          });
        }

        const reportData: AIReportData = {
            metadata: { ...reportMetadata, defectThreshold },
            inspection: inspectionResult!,
            patches,
            screenshots: {
                global: globalScreenshots!,
                patches: patchScreenshots,
            },
            summaries: {
                overall: overallSummary || `No critical corrosion areas detected below ${defectThreshold}% remaining wall thickness.`,
                patches: patchSummaries,
            }
        };
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

                {/* --- STEP 1: THRESHOLD --- */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                     <Label htmlFor="defectThreshold">1. Defect Threshold: {defectThreshold}%</Label>
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs">Areas with wall thickness below this % will be marked as defects.</p>
                            </TooltipContent>
                        </Tooltip>
                     </TooltipProvider>
                  </div>
                  <Slider
                    id="defectThreshold"
                    min={10}
                    max={90}
                    step={5}
                    value={[defectThreshold]}
                    onValueChange={(value) => setDefectThreshold(value[0])}
                    disabled={isThresholdLocked}
                  />
                   <p className="text-xs text-center text-muted-foreground pt-1">
                    Detected Patches: <span className="font-bold text-foreground">{patches.length}</span>
                  </p>
                  <Button 
                    className="w-full"
                    variant={isThresholdLocked ? "secondary" : "default"}
                    onClick={() => setIsThresholdLocked(!isThresholdLocked)}
                    disabled={isGeneratingScreenshots || screenshotsReady}
                  >
                    {isThresholdLocked ? <Edit className="mr-2" /> : <Lock className="mr-2" />}
                    {isThresholdLocked ? `Edit Threshold (${defectThreshold}%)` : 'Confirm Threshold'}
                  </Button>
                </div>
                <Separator />


                {/* --- STEP 2: GENERATE SCREENSHOTS --- */}
                <div className="flex items-center gap-3">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${screenshotsReady ? 'bg-green-500' : 'bg-primary'} text-primary-foreground`}>
                    {screenshotsReady ? <CheckCircle size={16}/> : '2'}
                  </span>
                  <p className="text-sm font-medium">Generate Visual Assets</p>
                </div>
                 {captureProgress && (
                  <div className="space-y-2">
                    <Progress value={(captureProgress.current / captureProgress.total) * 100} />
                    <p className="text-xs text-muted-foreground text-center">Capturing image {captureProgress.current} of {captureProgress.total}...</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateScreenshots}
                  disabled={!isThresholdLocked || isGeneratingScreenshots || screenshotsReady}
                >
                  {isGeneratingScreenshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2" />}
                  {isGeneratingScreenshots ? 'Generating...' : (screenshotsReady ? 'Screenshots Ready' : 'Generate Screenshots')}
                </Button>
                <Separator />
                
                 {/* --- STEP 3: ADD DETAILS --- */}
                <div className="flex items-center gap-3">
                   <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${detailsSubmitted ? 'bg-green-500' : 'bg-primary'} text-primary-foreground`}>
                    {detailsSubmitted ? <CheckCircle size={16}/> : '3'}
                  </span>
                  <p className="text-sm font-medium">Fill In Report Details</p>
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
                
                {/* --- STEP 4: DOWNLOAD --- */}
                <div className="flex items-center gap-3">
                   <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground`}>
                    4
                  </span>
                  <p className="text-sm font-medium">Create and Download PDF</p>
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
    {<AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} />}
    </>
  )
}

    