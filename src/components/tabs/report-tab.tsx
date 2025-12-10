

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
import { Camera, Download, Edit, FileText, Info, Loader2, Lock, Pencil, UploadCloud } from 'lucide-react'
import ReportList from '../reporting/ReportList'
import { PatchVault } from '@/vaults/patchVault'
import { generatePatchSummary } from '@/ai/flows/generate-patch-summary'
import { canvasToArrayBuffer, downloadFile } from '@/lib/utils'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useFirebase } from '@/firebase'

interface ReportTabProps {
  threeDViewRef: React.RefObject<ThreeDeeViewRef>;
  twoDViewRef: React.RefObject<TwoDeeViewRef>;
}


export function ReportTab({ threeDViewRef, twoDViewRef }: ReportTabProps) {
  const { inspectionResult, segments } = useInspectionStore();
  const { toast } = useToast();
  const { app: firebaseApp } = useFirebase();
  const storage = firebaseApp ? getStorage(firebaseApp) : null;
  
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

    const captureAndConvert = async (captureFn: () => string | HTMLCanvasElement): Promise<ArrayBuffer> => {
        const result = captureFn();
        if (typeof result === 'string') {
             const res = await fetch(result);
             return await res.arrayBuffer();
        }
        return canvasToArrayBuffer(result);
    };

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        setGenerationProgress({ current: i + 1, total: totalSteps, task: `Capturing views for Patch #${segment.id}` });
        
        // --- Focus on the segment in both views
        captureFunctions3D.focus(segment.center.x, segment.center.y, true);
        await new Promise(resolve => setTimeout(resolve, 250));

        // --- Capture 3D Views ---
        captureFunctions3D.setView('iso');
        await new Promise(resolve => setTimeout(resolve, 250));
        const isoViewBuffer = await captureAndConvert(captureFunctions3D.capture);


        captureFunctions3D.setView('top');
        await new Promise(resolve => setTimeout(resolve, 250));
        const topViewBuffer = await captureAndConvert(captureFunctions3D.capture);

        captureFunctions3D.setView('side');
        await new Promise(resolve => setTimeout(resolve, 250));
        const sideViewBuffer = await captureAndConvert(captureFunctions3D.capture);
        
        // --- Capture 2D View ---
        const heatmapBuffer = await captureAndConvert(captureFunctions2D.capture);
        
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
    if (!enrichedSegments || enrichedSegments.length === 0 || !reportMetadata || !inspectionResult || !storage) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please capture assets, submit report details, and ensure you are connected to Firebase.",
        });
        return;
    }

    setIsGenerating(true);
    const reportId = `report_${Date.now()}`;
    const totalUploads = enrichedSegments.length * 4;
    setGenerationProgress({ current: 0, total: totalUploads, task: 'Uploading visual assets...' });

    try {
        const patchesWithUrls = await Promise.all(enrichedSegments.map(async (segment, patchIndex) => {
            const vaultEntry = PatchVault.get(String(segment.id));
            if (!vaultEntry) throw new Error(`Could not find vault entry for patch ${segment.id}`);

            const imageUrls: { [key: string]: string } = {};

            for (let i = 0; i < vaultEntry.buffers.length; i++) {
                const { name, buffer } = vaultEntry.buffers[i];
                const imagePath = `temp_reports/${reportId}/patch_${segment.id}/${name}.png`;
                const imageRef = storageRef(storage, imagePath);
                await uploadBytes(imageRef, buffer);
                const downloadURL = await getDownloadURL(imageRef);
                imageUrls[name] = downloadURL;
                setGenerationProgress({
                    current: patchIndex * 4 + i + 1,
                    total: totalUploads,
                    task: `Uploading ${name} for patch #${segment.id}...`
                });
            }

            return {
                ...segment,
                isoViewUrl: imageUrls.iso,
                topViewUrl: imageUrls.top,
                sideViewUrl: imageUrls.side,
                heatmapUrl: imageUrls.heat,
            };
        }));

        setGenerationProgress({ current: totalUploads, total: totalUploads, task: 'Generating DOCX on server...' });

        const apiPayload = {
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
            segments: patchesWithUrls,
            remarks: reportMetadata.remarks,
        };

        const response = await fetch('/api/generate-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server failed to generate report: ${errorText}`);
        }

        const blob = await response.blob();
        downloadFile(blob, `Report_${reportMetadata.assetName || 'Asset'}.docx`);

    } catch (error: any) {
        console.error("Report generation failed:", error);
        toast({
            variant: "destructive",
            title: "Report Generation Failed",
            description: error.message || "An unknown error occurred.",
        });
    } finally {
        setIsGenerating(false);
        setGenerationProgress(null);
        // TODO: Add cleanup for temp files in storage
    }
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
                 {generationProgress && isGenerating && generationProgress.task.includes('Capturing') && (
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
                  {isGenerating && generationProgress?.task.includes('Capturing') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2" />}
                  {isGenerating && generationProgress?.task.includes('Capturing') ? 'Generating...' : (hasImages ? 'Re-Capture All Assets' : 'Start Capture Sequence')}
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
                   Create and Download DOCX (Cloud)
                </h3>
                 {generationProgress && isGenerating && !generationProgress.task.includes('Capturing') && (
                  <div className="space-y-2">
                    <Progress value={(generationProgress.current / generationProgress.total) * 100} />
                    <p className="text-xs text-muted-foreground text-center">{generationProgress.task}</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateFinalReport}
                  disabled={!hasImages || !detailsSubmitted || isGenerating}
                >
                  {isGenerating && !generationProgress?.task.includes('Capturing') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2" />}
                  {isGenerating && !generationProgress?.task.includes('Capturing') ? 'Generating...' : 'Generate DOCX Report'}
                </Button>
            </div>

          </CardContent>
        </Card>
        {<AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} />}
    </div>
    </ScrollArea>
  )
}
