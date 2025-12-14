
"use client";

import React, { useState } from "react";
import { useInspectionStore } from "@/store/use-inspection-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateInspectionReport } from "@/report/docx/ReportBuilder";
import { downloadFile } from "@/lib/utils";
import { getBase64ImageFromUrl } from "@/lib/image-utils";
import type { ReportInput, PatchImageSet } from "@/report/docx/types";
import type { SegmentBox } from "@/lib/types";
import { DataVault } from "@/store/data-vault";

interface ReportTabProps {
  twoDViewRef: React.RefObject<any>;
  threeDeeViewRef: React.RefObject<any>;
}

const delayFrame = (ms = 70) => new Promise(res => setTimeout(res, ms));

async function capturePatchImages(
  plate3DRef: any,
  corrosionPatches: SegmentBox[],
  ndPatches: SegmentBox[]
) {
  const results: { [key: string]: any } = {};

  const all = [
    ...corrosionPatches.map(p => ({ ...p, type: "corrosion" })),
    ...ndPatches.map(p => ({ ...p, type: "nd" }))
  ];

  for (const p of all) {
    // Focus the camera on patch center (existing method)
    await plate3DRef.current.focus(p.center.x, p.center.y, true, (p.coordinates.xMax - p.coordinates.xMin) ?? 10);
    await delayFrame();

    // ISO
    await plate3DRef.current.setView("iso");
    const iso = await plate3DRef.current.capture();

    // TOP
    await plate3DRef.current.setView("top");
    const top = await plate3DRef.current.capture();

    // SIDE
    await plate3DRef.current.setView("side");
    const side = await plate3DRef.current.capture();

    results[p.id] = {
      view2D: p.heatmapDataUrl,   // From worker
      view3DIso: iso,
      view3DTop: top,
      view3DSide: side,
    };
  }

  return results;
}

function assembleReportInput(
  metadata: any,
  inspectionResult: any,
  full2D: string,
  fullIso: string,
  fullTop: string,
  fullSide: string,
  corrosionPatches: SegmentBox[],
  ndPatches: SegmentBox[],
  patchImages: any
): ReportInput {
  return {
    assetInfo: {
        clientName: metadata.clientName,
        assetTag: metadata.assetTag,
        operatorName: metadata.operatorName,
        inspectionDate: new Date().toLocaleDateString(),
        method: metadata.method,
        reportId: `REP-${Date.now()}`,
        logoBase64: metadata.logoBase64,
    },
    fullAssetImages: {
      view2D: full2D,
      view3DIso: fullIso,
      view3DTop: fullTop,
      view3DSide: fullSide,
    },
    stats: inspectionResult.stats,
    aiSummary: inspectionResult.aiInsight?.recommendation ?? "AI summary not available.",
    corrosionPatches: corrosionPatches.map(p => ({
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
    ndPatches: ndPatches.map(p => ({
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
}


export function ReportTab({ twoDViewRef, threeDeeViewRef }: ReportTabProps) {
  const { inspectionResult, patches } = useInspectionStore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
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
    toast({
      title: "Generating Report...",
      description: "Capturing views and assembling document. This may take a moment.",
    });

    try {
        const logoBase64 = await getBase64ImageFromUrl('/logo.png');

        // Capture full asset views
        const full2D = await twoDViewRef.current.capture();
        await threeDeeViewRef.current.resetCamera();
        const fullIso = await threeDeeViewRef.current.setView("iso").then(() => threeDeeViewRef.current.capture());
        const fullTop = await threeDeeViewRef.current.setView("top").then(() => threeDeeViewRef.current.capture());
        const fullSide = await threeDeeViewRef.current.setView("side").then(() => threeDeeViewRef.current.capture());

        // Capture images for each patch
        const patchImages = await capturePatchImages(
            threeDeeViewRef,
            patches.corrosion,
            patches.nonInspected
        );

        // Assemble the final input for the report builder
        const reportInput = assembleReportInput(
            {...reportMetadata, logoBase64},
            inspectionResult,
            full2D,
            fullIso,
            fullTop,
            fullSide,
            patches.corrosion,
            patches.nonInspected,
            patchImages
        );

        const docxBlob = await generateInspectionReport(reportInput);
        downloadFile(docxBlob, `Inspection_Report_${reportMetadata.assetTag}.docx`);

        toast({
            title: "Report Generated!",
            description: "Your DOCX file has been downloaded.",
        });
    } catch (error) {
      console.error("Report generation failed:", error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: (error as Error).message || "Could not generate the report.",
      });
    } finally {
      setIsGenerating(false);
      // Reset camera to a sensible default view
      await threeDeeViewRef.current.resetCamera();
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assetTag">Asset ID / Tag</Label>
            <Input
              id="assetTag"
              value={reportMetadata.assetTag}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, assetTag: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operatorName">Operator Name</Label>
            <Input
              id="operatorName"
              value={reportMetadata.operatorName}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, operatorName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Inspection Method</Label>
            <Input
              id="method"
              value={reportMetadata.method}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, method: e.target.value }))}
            />
          </div>
          <Button onClick={generateDocx} disabled={isGenerating || !inspectionResult} className="w-full">
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isGenerating ? "Generating Report..." : "Generate & Download DOCX"}
          </Button>
        </CardContent>
      </Card>
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText /> Report Sections
          </CardTitle>
          <CardDescription>
            The generated DOCX will contain the following sections:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
            <li>A cover page with client and asset information.</li>
            <li>An overall asset overview with 2D and 3D images.</li>
            <li>A high-level AI-generated executive summary.</li>
            <li>A detailed inspection statistics table.</li>
            <li>A separate, detailed page for each identified corrosion patch.</li>
            <li>A section listing all non-inspected (ND) areas.</li>
            <li>A concluding summary and recommendations.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
