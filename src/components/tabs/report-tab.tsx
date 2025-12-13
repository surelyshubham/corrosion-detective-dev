
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

const assembleReportInput = async (
  inspectionResult: any,
  patches: any,
  metadata: any,
  viewRefs: ReportTabProps
): Promise<ReportInput> => {
  const { twoDViewRef, threeDeeViewRef } = viewRefs;

  if (!twoDViewRef.current || !threeDeeViewRef.current) {
    throw new Error("View refs are not available");
  }

  // Capture full asset views
  await threeDeeViewRef.current.resetCamera();
  
  const fullView2D = twoDViewRef.current.capture();

  await threeDeeViewRef.current.setView('iso');
  const fullView3DIso = await threeDeeViewRef.current.capture();

  await threeDeeViewRef.current.setView('top');
  const fullView3DTop = await threeDeeViewRef.current.capture();

  await threeDeeViewRef.current.setView('side');
  const fullView3DSide = await threeDeeViewRef.current.capture();

  const logoBase64 = await getBase64ImageFromUrl('/logo.png');

  const createPatchSet = (patch: SegmentBox, type: 'CORROSION' | 'NON_INSPECTED'): PatchImageSet => ({
      patchId: `${type === 'CORROSION' ? 'C' : 'ND'}-${patch.id}`,
      type: type,
      meta: {
        xRange: `${patch.coordinates.xMin} - ${patch.coordinates.xMax}`,
        yRange: `${patch.coordinates.yMin} - ${patch.coordinates.yMax}`,
        area: patch.pointCount,
        minThickness: patch.worstThickness?.toFixed(2),
        avgThickness: patch.avgThickness?.toFixed(2),
        severity: patch.tier,
      },
      images: {
          view2D: patch.heatmapDataUrl || '', 
          view3DTop: DataVault.patchSnapshots.find(s => s.patchId === String(patch.id) && s.patchType === type && s.view === 'TOP')?.image || 'placeholder',
          view3DSide: DataVault.patchSnapshots.find(s => s.patchId === String(patch.id) && s.patchType === type && s.view === 'SIDE')?.image || 'placeholder',
          view3DIso: DataVault.patchSnapshots.find(s => s.patchId === String(patch.id) && s.patchType === type && s.view === 'ISO')?.image || 'placeholder',
      }
  });

  return {
    assetInfo: {
      clientName: metadata.clientName,
      assetTag: metadata.assetTag,
      operatorName: metadata.operatorName,
      inspectionDate: new Date().toLocaleDateString(),
      method: metadata.method,
      reportId: `REP-${Date.now()}`,
      logoBase64,
    },
    fullAssetImages: {
      view2D: fullView2D,
      view3DIso,
      view3DTop,
      view3DSide,
    },
    stats: inspectionResult.stats,
    aiSummary: inspectionResult.aiInsight?.recommendation ?? "AI summary not available.",
    corrosionPatches: patches.corrosion.map((p: SegmentBox) => createPatchSet(p, 'CORROSION')),
    ndPatches: patches.nonInspected.map((p: SegmentBox) => createPatchSet(p, 'NON_INSPECTED')),
  };
};

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
      description: "Please wait, this may take a moment.",
    });

    try {
      const reportInput = await assembleReportInput(inspectionResult, patches, reportMetadata, { twoDViewRef, threeDeeViewRef });
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
