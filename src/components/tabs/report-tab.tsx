
"use client";

import React, { useState, useEffect } from "react";
import { useInspectionStore } from "@/store/use-inspection-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getBase64ImageFromUrl } from "@/lib/image-utils";
import type { ReportInput } from "@/report/docx/types";
import { generateInspectionReport } from "@/report/docx/ReportBuilder";
import type { SegmentBox, GridCell } from "@/lib/types";
import { DataVault } from "@/store/data-vault";
import { Progress } from "../ui/progress";
import { MIN_CELLS_FOR_VISUALIZATION } from "@/report/docx/sections/corrosionPatches";

interface ReportTabProps {
  twoDViewRef: React.RefObject<any>;
  threeDeeViewRef: React.RefObject<any>;
}

const delayFrame = (ms = 70) => new Promise(res => setTimeout(res, ms));

async function capturePatchImages(
  plate3DRef: any,
  corrosionPatches: SegmentBox[],
): Promise<{ [key: string]: any }> {
  const results: { [key: string]: any } = {};

  const imagePatches = corrosionPatches.filter(p => p.representation === 'IMAGE');

  for (const p of imagePatches) {
    // This check is now redundant because `representation` already gatekeeps this, but it's safe.
    if (p.pointCount >= MIN_CELLS_FOR_VISUALIZATION) {
        await plate3DRef.current.focus(p.center.x, p.center.y, true, (p.coordinates.xMax - p.coordinates.xMin) ?? 10);
        await delayFrame();

        const iso = await plate3DRef.current.capture();
        const top = await plate3DRef.current.setView("top").then(() => plate3DRef.current.capture());
        const side = await plate3DRef.current.setView("side").then(() => plate3DRef.current.capture());

        results[`C-${p.id}`] = {
        view2D: p.heatmapDataUrl,
        view3DIso: iso,
        view3DTop: top,
        view3DSide: side,
        };
    }
  }

  return results;
}

function getCorrosionColor(percentage: number | null): string {
    if (percentage === null) return '#bdbdbd';
    if (percentage < 70) return '#d62728';
    if (percentage < 80) return '#ff7f0e';
    if (percentage < 90) return '#2ca02c';
    return '#1f77b4';
}

function renderFullPlate2D(gridMatrix: GridCell[][]): string {
  if (!gridMatrix || gridMatrix.length === 0 || gridMatrix[0].length === 0) return '';
  const height = gridMatrix.length;
  const width = gridMatrix[0].length;
  const cellSize = 2; // Fixed cell size for high-res export

  const canvas = document.createElement('canvas');
  canvas.width = width * cellSize;
  canvas.height = height * cellSize;
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = gridMatrix[y][x];
      ctx.fillStyle = cell.isND ? '#bdbdbd' : getCorrosionColor(cell.percentage);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  return canvas.toDataURL('image/png');
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

  const [worker, setWorker] = useState<Worker | null>(null);

  // Initialize worker
  useEffect(() => {
    const reportWorker = new Worker(new URL('../../workers/report.worker.ts', import.meta.url));
    setWorker(reportWorker);
    
    reportWorker.onmessage = (event: MessageEvent) => {
      const { type, reportInput, error, stage, percent } = event.data;

      if (type === 'ERROR') {
        console.error("Report worker error:", error);
        toast({ variant: "destructive", title: "Generation Failed", description: error });
        setIsGenerating(false);
      } else if (type === 'PROGRESS') {
         setProgress({ stage, percent });
      } else if (type === 'DATA_READY') {
        // Now on the main thread, do the visual parts
        generateAndFinalizeDocx(reportInput);
      }
    };

    return () => {
      reportWorker.terminate();
    };
  }, []);

  const generateAndFinalizeDocx = async (reportInput: ReportInput) => {
      try {
        setProgress({ stage: "Capturing patch-specific images...", percent: 20 });
        const patchImages = await capturePatchImages(threeDeeViewRef, patches?.corrosion || []);
        
        // Enrich the report input with the newly captured images
        reportInput.corrosionPatches.forEach(p => {
            if (p.representation === 'IMAGE' && patchImages[p.patchId]) {
                p.images = patchImages[p.patchId];
            }
        });

        await threeDeeViewRef.current.resetCamera();

        setProgress({ stage: "Assembling DOCX file...", percent: 75 });
        const reportBlob = await generateInspectionReport(reportInput);
        
        setProgress({ stage: "Finalizing download...", percent: 100 });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(reportBlob);
        link.download = `Inspection_Report_${reportMetadata.assetTag}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        
        toast({
          title: "Report Generated!",
          description: "Your DOCX file has been downloaded.",
        });
      } catch (error) {
         console.error("Report finalization failed:", error);
         toast({
            variant: "destructive",
            title: "Generation Failed",
            description: (error as Error).message || "Could not generate the report.",
         });
      } finally {
        setIsGenerating(false);
      }
  }


  const generateDocx = async () => {
    if (!worker || !inspectionResult || !patches || !DataVault.gridMatrix) {
      toast({
        variant: "destructive",
        title: "No Data Available",
        description: "Please process an inspection file first.",
      });
      return;
    }
    
    setIsGenerating(true);
    setProgress({ stage: "Capturing full asset views...", percent: 5 });
    
    try {
        // Visual tasks remain on main thread
        const logoBase64 = await getBase64ImageFromUrl('/logo.png');
        const full2D = renderFullPlate2D(DataVault.gridMatrix);
        
        await threeDeeViewRef.current.resetCamera();
        const fullIso = await threeDeeViewRef.current.setView("iso").then(() => threeDeeViewRef.current.capture());

        // Count visualized patches
        const visualizedPatchCount = patches.corrosion.filter(p => p.pointCount >= MIN_CELLS_FOR_VISUALIZATION).length;

        // Prepare data-only payload for worker
        const reportInputPayload: ReportInput = {
            assetInfo: {
                ...reportMetadata, 
                logoBase64,
                inspectionDate: new Date().toLocaleDateString(),
                reportId: `REP-${Date.now()}`
            },
            fullAssetImages: { view2D: full2D, view3DIso: fullIso },
            stats: {
                ...inspectionResult.stats, 
                condition: inspectionResult.condition, 
                nominalThickness: inspectionResult.nominalThickness,
                totalPatches: patches.corrosion.length,
                visualizedPatches: visualizedPatchCount,
            },
            aiSummary: "AI summary has been disabled.", // Placeholder
            corrosionPatches: patches.corrosion.map(p => ({
                patchId: `C-${p.id}`,
                type: 'CORROSION',
                representation: p.representation,
                meta: {
                    xRange: `${p.coordinates.xMin} - ${p.coordinates.xMax}`,
                    yRange: `${p.coordinates.yMin} - ${p.coordinates.yMax}`,
                    area: p.pointCount,
                    minThickness: p.worstThickness,
                    severity: p.tier,
                },
                images: null, // Images will be added later on the main thread
                cells: p.cells,
            })),
            ndPatches: patches.nonInspected.map(p => ({
                patchId: `ND-${p.id}`,
                type: 'ND',
                representation: p.representation,
                meta: {
                     xRange: `${p.coordinates.xMin} - ${p.coordinates.xMax}`,
                    yRange: `${p.coordinates.yMin} - ${p.coordinates.yMax}`,
                    area: p.pointCount,
                    reason: p.reason
                },
                images: null,
                cells: [],
            }))
        };

        // Offload data preparation to the worker
        worker.postMessage({ type: 'GENERATE_REPORT_DATA', payload: reportInputPayload });

    } catch (error) {
      console.error("Report generation failed:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: (error as Error).message || "Could not generate the report.",
      });
      setIsGenerating(false);
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
            <li>An overall asset overview with 2D and 3D isometric images.</li>
            <li>A detailed inspection statistics table.</li>
            <li>A color interpretation legend.</li>
            <li>A summary table for all corrosion patches detected.</li>
            <li>A separate, detailed page for each major corrosion patch.</li>
            <li>A section listing all non-inspected (ND) areas.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
