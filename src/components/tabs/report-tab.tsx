
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useInspectionStore } from "@/store/use-inspection-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBase64ImageFromUrl } from "@/lib/image-utils";
import type { ReportInput, PatchImageSet } from "@/report/docx/types";
import type { SegmentBox } from "@/lib/types";
import { DataVault } from "@/store/data-vault";
import { Progress } from "../ui/progress";

interface ReportTabProps {
  twoDViewRef: React.RefObject<any>;
  threeDeeViewRef: React.RefObject<any>;
}

const delayFrame = (ms = 70) => new Promise(res => setTimeout(res, ms));

async function capturePatchImages(
  plate3DRef: any,
  corrosionPatches: SegmentBox[],
  ndPatches: SegmentBox[]
): Promise<{ [key: string]: any }> {
  const results: { [key: string]: any } = {};

  const all = [
    ...corrosionPatches.map(p => ({ ...p, type: "corrosion" })),
    ...ndPatches.map(p => ({ ...p, type: "nd" }))
  ].filter(p => p.representation === 'IMAGE'); // IMPORTANT: Only capture for IMAGE patches

  for (const p of all) {
    await plate3DRef.current.focus(p.center.x, p.center.y, true, (p.coordinates.xMax - p.coordinates.xMin) ?? 10);
    await delayFrame();

    const iso = await plate3DRef.current.setView("iso").then(() => plate3DRef.current.capture());
    const top = await plate3DRef.current.setView("top").then(() => plate3DRef.current.capture());
    const side = await plate3DRef.current.setView("side").then(() => plate3DRef.current.capture());

    results[p.id] = {
      view2D: p.heatmapDataUrl,
      view3DIso: iso,
      view3DTop: top,
      view3DSide: side,
    };
  }

  return results;
}

export function ReportTab({ twoDViewRef, threeDeeViewRef }: ReportTabProps) {
  const { inspectionResult, patches, defectThreshold } = useInspectionStore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  
  const [reportMetadata, setReportMetadata] = useState({
    clientName: "Firebase Studio",
    assetTag: "ASSET-001",
    operatorName: "AI Inspector",
    method: "Automated Ultrasonic Testing (AUT)",
  });
  
  const generateDocx = async () => {
    if (!inspectionResult || !patches) {
      toast({
        variant: "destructive",
        title: "No Data Available",
        description: "Please process an inspection file first.",
      });
      return;
    }
    
    setIsGenerating(true);
    setProgress({ stage: "Preparing views...", percent: 0 });
    
    const worker = new Worker(new URL('../../workers/report.worker.ts', import.meta.url));

    worker.onmessage = (e: MessageEvent) => {
      const { type, stage, percent, reportBlob, error } = e.data;
      if (type === 'PROGRESS') {
        setProgress({ stage, percent });
      } else if (type === 'DONE') {
        downloadFile(reportBlob, `Inspection_Report_${reportMetadata.assetTag}.docx`);
        toast({
          title: "Report Generated!",
          description: "Your DOCX file has been downloaded.",
        });
        setIsGenerating(false);
        worker.terminate();
      } else if (type === 'ERROR') {
        console.error("Report generation failed:", error);
        toast({
          variant: "destructive",
          title: "Generation Failed",
          description: error || "Could not generate the report.",
        });
        setIsGenerating(false);
        worker.terminate();
      }
    };
    
    worker.onerror = (err) => {
        console.error("Worker error:", err);
        toast({
          variant: "destructive",
          title: "Worker Error",
          description: err.message || "An unexpected error occurred in the report generator.",
        });
        setIsGenerating(false);
        worker.terminate();
    }

    try {
        const logoBase64 = await getBase64ImageFromUrl('/logo.png');
        
        // Capture all necessary images on the main thread
        setProgress({ stage: "Capturing asset views...", percent: 5 });
        const full2D = await twoDViewRef.current.capture();
        await threeDeeViewRef.current.resetCamera();
        const fullIso = await threeDeeViewRef.current.setView("iso").then(() => threeDeeViewRef.current.capture());
        const fullTop = await threeDeeViewRef.current.setView("top").then(() => threeDeeViewRef.current.capture());
        const fullSide = await threeDeeViewRef.current.setView("side").then(() => threeDeeViewRef.current.capture());
        
        setProgress({ stage: "Capturing patch images...", percent: 10 });
        const patchImages = await capturePatchImages(threeDeeViewRef, patches.corrosion, patches.nonInspected);

        await threeDeeViewRef.current.resetCamera();

        const reportInput: ReportInput = {
            assetInfo: {...reportMetadata, logoBase64},
            fullAssetImages: { view2D: full2D, view3DIso: fullIso, view3DTop: fullTop, view3DSide: fullSide },
            stats: {...inspectionResult.stats, condition: inspectionResult.condition, nominalThickness: inspectionResult.nominalThickness },
            aiSummary: inspectionResult.aiInsight?.recommendation ?? "AI summary was not generated for this inspection.",
            corrosionPatches: patches.corrosion.map(p => ({
                patchId: `C-${p.id}`,
                type: 'CORROSION',
                meta: {
                    xRange: `${p.coordinates.xMin} - ${p.coordinates.xMax}`,
                    yRange: `${p.coordinates.yMin} - ${p.coordinates.yMax}`,
                    area: p.pointCount,
                    minThickness: p.worstThickness?.toFixed(2),
                    avgThickness: p.avgThickness?.toFixed(2),
                    severity: p.tier,
                },
                images: patchImages[p.id] ?? null
            })),
            ndPatches: patches.nonInspected.map(p => ({
                patchId: `ND-${p.id}`,
                type: 'ND',
                meta: {
                     xRange: `${p.coordinates.xMin} - ${p.coordinates.xMax}`,
                    yRange: `${p.coordinates.yMin} - ${p.coordinates.yMax}`,
                    area: p.pointCount,
                },
                images: patchImages[p.id] ?? null
            }))
        };

        // Offload the heavy DOCX generation to the worker
        setProgress({ stage: "Building document...", percent: 20 });
        worker.postMessage({ type: 'GENERATE_REPORT', payload: reportInput });

    } catch (error) {
      console.error("Report generation setup failed:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: (error as Error).message || "Could not generate the report.",
      });
      setIsGenerating(false);
      worker.terminate();
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 h-full">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Generate DOCX Report</CardTitle>
          <CardDescription>
            Configure the report metadata and click generate. This will create a
            professional, editable DOCX file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientName">Client Name</Label>
            <Input
              id="clientName"
              value={reportMetadata.clientName}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, clientName: e.target.value }))}
              disabled={isGenerating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assetTag">Asset ID / Tag</Label>
            <Input
              id="assetTag"
              value={reportMetadata.assetTag}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, assetTag: e.target.value }))}
              disabled={isGenerating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operatorName">Operator Name</Label>
            <Input
              id="operatorName"
              value={reportMetadata.operatorName}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, operatorName: e.target.value }))}
              disabled={isGenerating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Inspection Method</Label>
            <Input
              id="method"
              value={reportMetadata.method}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, method: e.target.value }))}
              disabled={isGenerating}
            />
          </div>
          <Button onClick={generateDocx} disabled={isGenerating || !inspectionResult} className="w-full">
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {isGenerating ? "Generating Report..." : "Generate & Download DOCX"}
          </Button>
          {isGenerating && (
            <div className="space-y-2 pt-2">
              <Progress value={progress.percent} className="w-full" />
              <p className="text-xs text-muted-foreground text-center">{progress.stage} ({progress.percent}%)</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><FileText /> Report Sections</CardTitle>
          <CardDescription>The generated DOCX will contain the following sections:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
            <li>A cover page with client and asset information.</li>
            <li>An overall asset overview with 2D and 3D images.</li>
            <li>A high-level AI-generated executive summary.</li>
            <li>A detailed inspection statistics table.</li>
            <li>A separate, detailed page for each major corrosion patch.</li>
            <li>A summary table for all minor (micro) corrosion patches.</li>
            <li>A section listing all non-inspected (ND) areas.</li>
            <li>A concluding summary and recommendations.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function downloadFile(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

    