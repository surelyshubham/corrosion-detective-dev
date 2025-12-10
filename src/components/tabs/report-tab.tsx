

"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
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
import { pickTopPatches, type PatchMeta } from '@/utils/patchSelection'
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { urlToBase64 } from '@/lib/image-to-base64';

interface ReportTabProps {
  threeDViewRef: React.RefObject<ThreeDeeViewRef>;
  twoDViewRef: React.RefObject<TwoDeeViewRef>;
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
    if (!isCaptureReady || !captureFunctions3D || !captureFunctions2D || !inspectionResult) {
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
    
    PatchVault.clearAll();
    const finalSegments = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        setGenerationProgress({ current: i + 1, total: totalSteps, task: `Capturing views for Patch #${segment.id}` });
        
        captureFunctions3D.focus(segment.center.x, segment.center.y, true);
        await new Promise(resolve => setTimeout(resolve, 250));

        captureFunctions3D.setView('iso');
        await new Promise(resolve => setTimeout(resolve, 100));
        const isoViewBuffer = await canvasToArrayBuffer(captureFunctions3D.capture() as any);

        captureFunctions3D.setView('top');
        await new Promise(resolve => setTimeout(resolve, 100));
        const topViewBuffer = await canvasToArrayBuffer(captureFunctions3D.capture() as any);

        captureFunctions3D.setView('side');
        await new Promise(resolve => setTimeout(resolve, 100));
        const sideViewBuffer = await canvasToArrayBuffer(captureFunctions3D.capture() as any);
        
        const heatmapBuffer = await canvasToArrayBuffer(captureFunctions2D.capture() as any);
        
        const aiObservation = await generatePatchSummary(segment, inspectionResult.nominalThickness, inspectionResult.assetType, threshold);

        finalSegments.push({ ...segment, aiObservation });
        
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
                shortInsight: aiObservation,
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
      description: `Captured ${finalSegments.length} patches. You can now generate the PDF report.`,
    });
  };
  
 const handleGenerateFinalReport = async () => {
    if (!enrichedSegments || enrichedSegments.length === 0 || !reportMetadata || !inspectionResult) {
      toast({
        variant: "destructive",
        title: "Cannot Generate Report",
        description: "Please capture assets and submit report details.",
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ current: 1, total: 100, task: 'Preparing PDF data...' });

    try {
      const LOGO_URL = 'https://www.sigmandt.com/images/logo.png';
      
      setGenerationProgress({ current: 3, total: 100, task: 'Fetching logo...' });
      const logoBase64 = await urlToBase64(LOGO_URL);

      setGenerationProgress({ current: 5, total: 100, task: 'Selecting top patches...' });
      const allMetas: PatchMeta[] = enrichedSegments.map((s, i) => ({
        id: String(s.id),
        severity: s.tier,
        maxDepth_mm: (inspectionResult.nominalThickness || 0) - s.worstThickness,
        avgDepth_mm: (inspectionResult.nominalThickness || 0) - s.avgThickness,
        area_m2: s.pointCount / 1_000_000,
        detectionIndex: i,
      }));
      const topPatchesMeta = pickTopPatches(allMetas, 10);
      
      const preparedPatches = [];
      for (const meta of topPatchesMeta) {
        const entry = PatchVault.get(meta.id);
        const images: string[] = [];
        if (entry?.buffers) {
          const preferred = ['top', 'side', 'iso', 'heat', 'heatmap'];
          for (const name of preferred) {
            const bufferEntry = entry.buffers.find(b => b.name === name);
            if (bufferEntry) {
              const blob = new Blob([bufferEntry.buffer], { type: bufferEntry.mime });
              images.push(await urlToBase64(URL.createObjectURL(blob)));
            }
             if (images.length >= 4) break;
          }
        }
        preparedPatches.push({ id: meta.id, meta: entry?.meta, shortInsight: entry?.meta?.shortInsight || '', images });
      }

      setGenerationProgress({ current: 10, total: 100, task: 'Building report pages...' });

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '800px';
      container.style.zIndex = '-1000';
      document.body.appendChild(container);

      const pageStyle = `box-sizing: border-box; width: 794px; min-height: 1123px; padding: 28px; background: white; color: #111; font-family: Arial, Helvetica, sans-serif; position: relative; border-bottom: 1px solid #ccc;`;
      const watermarkStyle = `position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-12deg); opacity: 0.06; pointer-events: none; width: 240px; filter: grayscale(100%);`;
      
      const addWatermark = (el: HTMLElement) => {
        const wm = document.createElement('img');
        wm.src = logoBase64;
        wm.setAttribute('style', watermarkStyle);
        el.appendChild(wm);
      };

      const cover = document.createElement('div');
      cover.setAttribute('style', pageStyle);
      cover.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><img src="${logoBase64}" style="width:320px; height:auto; margin-bottom:24px;" /><h1 style="font-size:28px; margin: 8px 0 6px;">Corrosion Inspection Report</h1><div style="font-size:14px; color:#444; margin-bottom:4px;">Asset: ${reportMetadata.assetName}</div><div style="font-size:13px; color:#444; margin-bottom:20px;">Inspector: ${reportMetadata.operatorName} — Date: ${new Date().toISOString().slice(0,10)}</div><div style="width:60%; text-align:center; color:#333; font-size:13px;"><p>Executive Summary: This report contains the top ${preparedPatches.length} patches selected for assessment. Full dataset retained in Vault for audit.</p></div></div>`;
      addWatermark(cover);
      container.appendChild(cover);
      
      setGenerationProgress({ current: 15, total: 100, task: 'Generating cover page...' });

      preparedPatches.forEach((p, idx) => {
        const pg = document.createElement('div');
        pg.setAttribute('style', pageStyle);
        let html = `<h2 style="margin-top:0; font-size: 1.5rem;">Patch ${p.id} — Rank ${idx+1}</h2>`;
        html += `<div style="display:flex; gap:12px; align-items:flex-start;">`;
        html += `<div style="width:36%; font-size:13px; color:#333;"><div><strong>Area:</strong> ${Number(p.meta?.area_m2 ?? 0).toFixed(4)} m²</div><div><strong>Avg Thickness:</strong> ${p.meta?.avgThickness?.toFixed(2) ?? '-'} mm</div><div><strong>Min Thickness:</strong> ${p.meta?.worstThickness?.toFixed(2) ?? '-'} mm</div><div style="margin-top:8px;"><strong>AI Observation:</strong><div style="margin-top:6px; font-style: italic; color:#555">${p.shortInsight || '-'}</div></div></div>`;
        html += `<div style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:8px;">`;
        for (let i = 0; i < 4; i++) {
          html += `<div style="min-height:120px; border:1px solid #eee; display:flex; align-items:center; justify-content:center; padding:6px;">${p.images[i] ? `<img src="${p.images[i]}" style="width:100%; height:100%; object-fit:contain;" />` : `<div style="color:#999; font-size:12px;">(no image)</div>`}</div>`;
        }
        html += `</div></div>`;
        pg.innerHTML = html;
        addWatermark(pg);
        container.appendChild(pg);
      });
      
      await new Promise(r => setTimeout(r, 50));

      const pages = Array.from(container.children) as HTMLElement[];
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        setGenerationProgress({ current: Math.round(50 + (i / pages.length) * 45), total: 100, task: `Rendering page ${i + 1} of ${pages.length}...` });
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, allowTaint: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width * ratio, canvas.height * ratio);
      }

      setGenerationProgress({ current: 95, total: 100, task: 'Finalizing PDF...' });
      const blob = pdf.output('blob');
      const fileName = `SigmaReport-${reportMetadata.assetName || 'asset'}-${new Date().toISOString().slice(0,10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(container);
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);

    } catch (error: any) {
      console.error("PDF Generation Failed:", error);
      toast({ variant: "destructive", title: "PDF Generation Failed", description: error.message || "An unknown error occurred." });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
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
              PDF Report Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
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

            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                     <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${hasImages ? 'bg-green-500' : 'bg-primary'} text-primary-foreground mr-3`}>2</span>
                    Capture Visual Assets
                </h3>
                 {isGenerating && generationProgress && generationProgress.task.includes('Capturing') && (
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
                
                <div className="space-y-4 border p-4 rounded-lg min-h-[300px]">
                    <h3 className="font-semibold">Image Preview (Top 10 Patches)</h3>
                    {hasImages ? (
                        <ReportList patchIds={patchIds} />
                    ) : (
                      <div className="text-sm text-center text-muted-foreground py-10">No visual assets captured yet.</div>
                    )}
                </div>
            </div>

            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                   <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground mr-3`}>4</span>
                   Create and Download PDF Report
                </h3>
                 {isGenerating && generationProgress && !generationProgress.task.includes('Capturing') && (
                  <div className="space-y-2">
                    <Progress value={generationProgress.current} />
                    <p className="text-xs text-muted-foreground text-center">{generationProgress.task}</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateFinalReport}
                  disabled={!hasImages || !detailsSubmitted || isGenerating}
                >
                  {isGenerating && generationProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2" />}
                  {isGenerating && generationProgress ? 'Generating...' : 'Generate PDF Report'}
                </Button>
            </div>

          </CardContent>
        </Card>
        {<AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} />}
    </div>
    </ScrollArea>
  )
}
