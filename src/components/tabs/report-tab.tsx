

"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import type { FinalReportPayload, ReportPatchSegment } from '@/reporting/DocxReportGenerator'
import { Progress } from '../ui/progress'
import { Slider } from '../ui/slider'
import { Label } from '../ui/label'
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import type { ThreeDeeViewRef } from './three-dee-view-tab'
import type { TwoDeeViewRef } from './two-dee-heatmap-tab'
import { ScrollArea } from '../ui/scroll-area'
import { Camera, Download, Edit, FileText, Info, Loader2, Lock, Pencil } from 'lucide-react'
import ReportList from '../reporting/ReportList'
import { PatchVault } from '@/vaults/patchVault'
import { generatePatchSummary } from '@/ai/flows/generate-patch-summary'
import { canvasToArrayBuffer } from '@/lib/utils'

interface ReportTabProps {
  threeDViewRef: React.RefObject<ThreeDeeViewRef>;
  twoDViewRef: React.RefObject<TwoDeeViewRef>;
}

let docxWorker: Worker | null = null;
if (typeof window !== 'undefined') {
    docxWorker = new Worker(new URL('../../workers/docx.worker.ts', import.meta.url), { type: 'module' });
}


export function ReportTab({ threeDViewRef, twoDViewRef }: ReportTabProps) {
  const { inspectionResult, segments } = useInspectionStore();
  const { toast } = useToast();
  
  const threshold = useInspectionStore((s) => s.defectThreshold);
  const setThreshold = useInspectionStore((s) => s.setDefectThreshold);
  const setSegmentsForThreshold = useInspectionStore((s) => s.setSegmentsForThreshold);
  
  const {
    isGenerating,
    setIsGenerating,
    resetReportState,
    reportMetadata,
    detailsSubmitted,
    setReportMetadata,
    generationProgress,
    setGenerationProgress,
    isThresholdLocked,
    setIsThresholdLocked,
    enrichedSegments,
    setEnrichedSegments,
  } = useReportStore();
  
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const patchIds = enrichedSegments?.map(s => String(s.id)) || [];
  
  const captureFunctions3D = threeDViewRef.current;
  const captureFunctions2D = twoDViewRef.current;
  const isCaptureReady = !!captureFunctions3D?.capture && !!captureFunctions2D?.capture;

  useEffect(() => {
    resetReportState();
    if (inspectionResult) {
      setSegmentsForThreshold(threshold);
    }
    // Cleanup worker and vault on unmount
    return () => {
       PatchVault.clearAll();
    }
  }, [inspectionResult, resetReportState, setSegmentsForThreshold, threshold]);

  const handleThresholdChange = (value: number[]) => {
    const newThreshold = value[0];
    setThreshold(newThreshold);
  }
  
  const handleThresholdCommit = (value: number[]) => {
    const newThreshold = value[0];
    setSegmentsForThreshold(newThreshold);
  }

  const handleGenerateAndCapture = async () => {
    if (!isCaptureReady || !captureFunctions3D || !captureFunctions2D) {
      toast({
        variant: "destructive",
        title: "Views Not Ready",
        description: "Please wait a moment for the 2D/3D views to initialize.",
      });
      return;
    }

    if (!segments || segments.length === 0) {
      toast({
        variant: "destructive",
        title: "No Segments Detected",
        description: "No patches were found for the current threshold. Adjust the slider and try again.",
      });
      return;
    }
    
    setIsGenerating(true);
    const totalSteps = segments.length;
    setGenerationProgress({ current: 0, total: totalSteps, task: 'Starting Capture Sequence...' });
    
    // Clear previous captures
    PatchVault.clearAll();
    const finalSegments: ReportPatchSegment[] = [];


    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        setGenerationProgress({ current: i + 1, total: totalSteps, task: `Capturing views for Patch #${segment.id}` });
        
        // --- Focus on the segment in both views
        captureFunctions3D.focus(segment.center.x, segment.center.y, true);
        await new Promise(resolve => setTimeout(resolve, 250));

        // --- Capture 3D Views ---
        captureFunctions3D.setView('iso');
        await new Promise(resolve => setTimeout(resolve, 250));
        const isoViewBuffer = await canvasToArrayBuffer(captureFunctions3D.capture());

        captureFunctions3D.setView('top');
        await new Promise(resolve => setTimeout(resolve, 250));
        const topViewBuffer = await canvasToArrayBuffer(captureFunctions3D.capture());

        captureFunctions3D.setView('side');
        await new Promise(resolve => setTimeout(resolve, 250));
        const sideViewBuffer = await canvasToArrayBuffer(captureFunctions3D.capture());
        
        // --- Capture 2D View ---
        const heatmapBuffer = await canvasToArrayBuffer(captureFunctions2D.capture());
        
        // --- Generate AI Insight ---
        const aiObservation = await generatePatchSummary(segment, inspectionResult?.nominalThickness || 0, inspectionResult?.assetType || 'N/A', threshold);

        const enrichedSegment: ReportPatchSegment = { ...segment, aiObservation };
        finalSegments.push(enrichedSegment);
        
        // --- Store buffers in PatchVault ---
         PatchVault.set(String(segment.id), {
            buffers: [
                { name: 'iso', buffer: isoViewBuffer, mime: 'image/png' },
                { name: 'top', buffer: topViewBuffer, mime: 'image/png' },
                { name: 'side', buffer: sideViewBuffer, mime: 'image/png' },
                { name: 'heat', buffer: heatmapBuffer, mime: 'image/png' },
            ],
            meta: {
                title: `Patch #${segment.id}`,
                summary: `${segment.tier} | Min: ${segment.worstThickness.toFixed(2)}mm`,
                ...segment
            }
        });
    }
      
    captureFunctions3D.resetCamera();
    setEnrichedSegments(finalSegments);
    setIsGenerating(false);
    setGenerationProgress(null);
    toast({
      title: "Visual Assets Captured",
      description: `Captured ${finalSegments.length} patches with 4 views each. Please fill in report details.`,
    });
  };
  
  const handleGenerateFinalReport = async () => {
      if (!enrichedSegments || enrichedSegments.length === 0 || !reportMetadata || !inspectionResult) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please capture assets and submit report details first.",
        });
        return;
      }
      
      if (!docxWorker) {
        toast({ variant: 'destructive', title: 'Worker Not Ready', description: 'The report generator worker is not available.' });
        return;
      }

      setIsGenerating(true);
      setGenerationProgress({ current: 0, total: 1, task: 'Generating DOCX file...'});

      const transferList: ArrayBuffer[] = [];
      const payloadSegments = enrichedSegments.map(seg => {
          const vaultEntry = PatchVault.get(String(seg.id));
          const images = vaultEntry?.buffers.map(b => {
              transferList.push(b.buffer);
              return { name: b.name, mime: b.mime, buffer: b.buffer };
          }) || [];
          return { ...seg, images };
      });

      const payload: FinalReportPayload = {
            global: {
                assetName: reportMetadata.assetName || 'N/A',
                projectName: reportMetadata.projectName,
                inspectionDate: reportMetadata.scanDate ? reportMetadata.scanDate.toLocaleDateString() : 'N/A',
                nominalThickness: Number(inspectionResult.nominalThickness),
                minThickness: Number(inspectionResult.stats.minThickness),
                maxThickness: Number(inspectionResult.stats.maxThickness),
                avgThickness: Number(inspectionResult.stats.avgThickness),
                corrodedAreaBelow80: Number(inspectionResult.stats.areaBelow80),
                corrodedAreaBelow70: Number(inspectionResult.stats.areaBelow70),
                corrodedAreaBelow60: Number(inspectionResult.stats.areaBelow60),
            },
            segments: payloadSegments,
            remarks: reportMetadata.remarks,
        };

        docxWorker.onmessage = (ev) => {
            const { ok, buffer, error } = ev.data;
             setIsGenerating(false);
             setGenerationProgress(null);

            if (!ok || !buffer) {
                console.error("DOCX Worker Error:", error);
                toast({ variant: 'destructive', title: 'Report Generation Failed', description: error || 'An unknown worker error occurred.' });
                return;
            }

            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Report_${reportMetadata.assetName || 'Asset'}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        
        docxWorker.onerror = (err) => {
             setIsGenerating(false);
             setGenerationProgress(null);
             console.error("DOCX Worker crashed:", err);
             toast({ variant: 'destructive', title: 'Report Worker Crashed', description: err.message });
        };
        
        docxWorker.postMessage({ cmd: 'generate_report', payload }, transferList);
  };
  
  const hasImages = enrichedSegments && enrichedSegments.length > 0;

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
                            <Label htmlFor="defectThreshold">Threshold: {threshold}%</Label>
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
                            value={[threshold]}
                            onValueChange={handleThresholdChange}
                            onValueCommit={handleThresholdCommit}
                            disabled={isThresholdLocked}
                        />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-sm text-center text-muted-foreground font-medium">
                            Detected Patches: <span className="font-bold text-foreground text-base">{segments?.length || 0}</span>
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
                <div className="space-y-4 border p-4 rounded-lg min-h-[300px]">
                    <h3 className="font-semibold">Image Preview</h3>
                    {hasImages ? (
                        <ReportList patchIds={patchIds} />
                    ) : (
                      <div className="text-sm text-center text-muted-foreground py-10">No visual assets captured yet.</div>
                    )}
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
