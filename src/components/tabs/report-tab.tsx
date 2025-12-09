
"use client"

import React, { useEffect, useState } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import { generateReportDocx, type ReportData } from '@/reporting/DocxReportGenerator'
import { Progress } from '../ui/progress'
import { Slider } from '../ui/slider'
import { Label } from '../ui/label'
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import type { ThreeDeeViewRef } from './three-dee-view-tab'
import type { TwoDeeViewRef } from './two-dee-heatmap-tab'
import { ScrollArea } from '../ui/scroll-area'
import { Camera, Download, Edit, FileText, Info, Loader2, Lock, Pencil } from 'lucide-react'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '../ui/carousel'
import Image from 'next/image'

interface ReportTabProps {
  threeDViewRef: React.RefObject<ThreeDeeViewRef>;
  twoDViewRef: React.RefObject<TwoDeeViewRef>;
}

export function ReportTab({ threeDViewRef, twoDViewRef }: ReportTabProps) {
  const { inspectionResult } = useInspectionStore();
  const { toast } = useToast();
  
  const {
    isGenerating,
    setIsGenerating,
    reportImages,
    setReportImages,
    resetReportState,
    reportMetadata,
    detailsSubmitted,
    setReportMetadata,
    generationProgress,
    setGenerationProgress,
    defectThreshold,
    setDefectThreshold,
    isThresholdLocked,
    setIsThresholdLocked,
  } = useReportStore();
  
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  
  const captureFunctions3D = threeDViewRef.current;
  const captureFunctions2D = twoDViewRef.current;
  const isCaptureReady = !!captureFunctions3D?.capture && !!captureFunctions2D?.capture;
  const segments = inspectionResult?.segments || [];

  useEffect(() => {
    resetReportState();
  }, [inspectionResult, resetReportState]);

  useEffect(() => {
    if (!isThresholdLocked) {
       useInspectionStore.getState().setSegmentsForThreshold(defectThreshold);
    }
  }, [defectThreshold, isThresholdLocked]);


  const handleGenerateAndCapture = async () => {
    if (!isCaptureReady) {
      toast({
        variant: "destructive",
        title: "Views Not Ready",
        description: "Please wait a moment for the 2D/3D views to initialize.",
      });
      return;
    }
    
    setIsGenerating(true);
    const totalSteps = 2 + segments.length;
    setGenerationProgress({ current: 0, total: totalSteps, task: 'Starting...' });

    try {
      // 1. Capture Full Model
      setGenerationProgress({ current: 1, total: totalSteps, task: 'Capturing 3D model view...' });
      captureFunctions3D.setView('iso');
      await new Promise(resolve => setTimeout(resolve, 500));
      const fullModel3D = captureFunctions3D.capture();

      // 2. Capture Full Heatmap
      setGenerationProgress({ current: 2, total: totalSteps, task: 'Capturing 2D heatmap view...' });
      const fullHeatmap2D = captureFunctions2D.capture();
      
      // 3. Capture Segment Shots
      const segmentShots: { segmentId: number; imageDataUrl: string }[] = [];
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        setGenerationProgress({ current: 3 + i, total: totalSteps, task: `Capturing segment #${segment.id}...` });
        captureFunctions3D.focus(segment.center.x, segment.center.y, true);
        await new Promise(resolve => setTimeout(resolve, 500)); // allow camera to move
        const shot = captureFunctions3D.capture();
        segmentShots.push({ segmentId: segment.id, imageDataUrl: shot });
      }
      captureFunctions3D.resetCamera();
      
      setReportImages({ fullModel3D, fullHeatmap2D, segmentShots });
      toast({
        title: "Visual Assets Captured",
        description: `Captured ${2 + segmentShots.length} images. Please fill in report details.`,
      });

    } catch (error) {
      console.error("Failed to generate screenshots", error);
      toast({
        variant: "destructive",
        title: "Capture Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
        setIsGenerating(false);
        setGenerationProgress(null);
    }
  };
  
  const handleGenerateFinalReport = async () => {
      if (!reportImages || !reportMetadata || !inspectionResult) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please capture assets and submit report details first.",
        });
        return;
      }
      setIsGenerating(true);
      setGenerationProgress({ current: 0, total: 1, task: 'Generating DOCX file...'});
      try {
        const reportData: ReportData = {
            metadata: { ...reportMetadata, defectThreshold },
            inspection: inspectionResult,
            segments: segments,
            images: reportImages,
        };
        
        await generateReportDocx(reportData);

      } catch (error) {
        console.error("Failed to generate final report", error);
        toast({
          variant: "destructive",
          title: "Report Generation Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      } finally {
          setIsGenerating(false);
          setGenerationProgress(null);
      }
  };
  
  const hasImages = !!reportImages.fullModel3D;

  return (
    <ScrollArea className="h-full">
    <div className="p-1">
       <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <FileText className="text-primary"/>
              DOCX Report Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            {/* --- STEP 1: THRESHOLD --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground mr-3">1</span>
                    Configure Defect Threshold
                </h3>
                <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="defectThreshold">Threshold: {defectThreshold}%</Label>
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
                            max={95}
                            step={5}
                            value={[defectThreshold]}
                            onValueChange={(value) => setDefectThreshold(value[0])}
                            disabled={isThresholdLocked}
                        />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-sm text-center text-muted-foreground font-medium">
                            Detected Patches: <span className="font-bold text-foreground text-base">{segments.length}</span>
                        </p>
                        <Button 
                            className="w-full"
                            variant={isThresholdLocked ? "secondary" : "default"}
                            onClick={() => setIsThresholdLocked(!isThresholdLocked)}
                            disabled={isGenerating}
                        >
                            {isThresholdLocked ? <Edit className="mr-2" /> : <Lock className="mr-2" />}
                            {isThresholdLocked ? `Edit Threshold` : 'Confirm & Lock Threshold'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- STEP 2: CAPTURE --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                     <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${hasImages ? 'bg-green-500' : 'bg-primary'} text-primary-foreground mr-3`}>2</span>
                    Capture Visual Assets
                </h3>
                 {generationProgress && isGenerating && (
                  <div className="space-y-2">
                    <Progress value={(generationProgress.current / generationProgress.total) * 100} />
                    <p className="text-xs text-muted-foreground text-center">{generationProgress.task}</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateAndCapture}
                  disabled={!isThresholdLocked || isGenerating}
                >
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2" />}
                  {isGenerating ? 'Generating...' : (hasImages ? 'Re-Capture All Assets' : 'Start Capture Sequence')}
                </Button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
                {/* --- STEP 3: DETAILS --- */}
                <div className="space-y-4 border p-4 rounded-lg">
                    <h3 className="font-semibold flex items-center">
                       <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${detailsSubmitted ? 'bg-green-500' : 'bg-primary'} text-primary-foreground mr-3`}>3</span>
                       Fill In Report Details
                    </h3>
                     <Button 
                      className="w-full" 
                      onClick={() => setIsReportDialogOpen(true)}
                      disabled={!hasImages || isGenerating}
                      variant="outline"
                    >
                      <Pencil className="mr-2" />
                      {detailsSubmitted ? 'Edit Report Details' : 'Add Report Details'}
                    </Button>
                </div>
                
                {/* --- IMAGE PREVIEW --- */}
                <div className="space-y-4 border p-4 rounded-lg">
                    <h3 className="font-semibold">Image Preview</h3>
                    <Carousel className="w-full max-w-sm mx-auto">
                      <CarouselContent>
                        {reportImages.fullModel3D && <CarouselItem><Card><CardHeader className="p-2 pb-0"><CardTitle className="text-sm">3D Model</CardTitle></CardHeader><CardContent className="p-2"><Image src={reportImages.fullModel3D} alt="3D Model" width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>}
                        {reportImages.fullHeatmap2D && <CarouselItem><Card><CardHeader className="p-2 pb-0"><CardTitle className="text-sm">2D Heatmap</CardTitle></CardHeader><CardContent className="p-2"><Image src={reportImages.fullHeatmap2D} alt="2D Heatmap" width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>}
                        {reportImages.segmentShots?.map(({segmentId, imageDataUrl}) => (
                           <CarouselItem key={segmentId}><Card><CardHeader className="p-2 pb-0"><CardTitle className="text-sm">Segment #{segmentId}</CardTitle></CardHeader><CardContent className="p-2"><Image src={imageDataUrl} alt={`Segment ${segmentId}`} width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>
                        ))}
                      </CarouselContent>
                      <CarouselPrevious />
                      <CarouselNext />
                    </Carousel>
                </div>
            </div>

            {/* --- STEP 4: DOWNLOAD --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                   <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground mr-3`}>4</span>
                   Create and Download DOCX
                </h3>
                <Button 
                  className="w-full" 
                  onClick={handleGenerateFinalReport}
                  disabled={!hasImages || !detailsSubmitted || isGenerating}
                >
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2" />}
                  {isGenerating ? 'Generating...' : 'Generate DOCX Report'}
                </Button>
            </div>

          </CardContent>
        </Card>
        {<AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} />}
    </div>
    </ScrollArea>
  )
}

    