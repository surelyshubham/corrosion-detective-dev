
"use client";

import React, { useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useInspectionStore } from "@/store/use-inspection-store";
import { DataVault } from "@/store/data-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Download } from "lucide-react";
import type { SegmentBox, InspectionStats } from "@/lib/types";
import { TwoDeeViewRef } from "./two-dee-heatmap-tab";
import { ThreeDeeViewRef } from "./three-dee-view-tab";
import { generateReportSummary } from "@/ai/flows/generate-report-summary";
import { generateAllPatchSummaries } from "@/ai/flows/generate-all-patch-summaries";

interface ReportTabProps {
  twoDViewRef: React.RefObject<TwoDeeViewRef>;
  threeDeeViewRef: React.RefObject<ThreeDeeViewRef>;
}

export function ReportTab({ twoDViewRef, threeDeeViewRef }: ReportTabProps) {
  const { inspectionResult, segments, defectThreshold } = useInspectionStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportMetadata, setReportMetadata] = useState({
    assetId: "ASSET-001",
    inspector: "Sigma NDT Level II",
    location: "Onshore Facility",
  });

  const generatePdf = async () => {
    if (!inspectionResult || !segments || !DataVault.stats) {
      alert("No inspection data available to generate a report.");
      return;
    }
    setIsGenerating(true);

    try {
      const { assetType, nominalThickness, condition } = inspectionResult;
      const globalStats = DataVault.stats;
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 15;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPos = 20;

      // --- AI Summaries ---
      const reportSummary = await generateReportSummary(inspectionResult, segments, defectThreshold);
      
      const patchAiInput = {
        patches: segments.map(p => ({
          patchId: p.id,
          minThickness: p.worstThickness.toFixed(2),
          severity: p.tier,
          xMin: p.coordinates.xMin, xMax: p.coordinates.xMax,
          yMin: p.coordinates.yMin, yMax: p.coordinates.yMax,
        })),
        assetType,
        nominalThickness,
        defectThreshold,
      };
      const patchSummariesResult = await generateAllPatchSummaries(patchAiInput);
      const patchSummariesMap = new Map(patchSummariesResult.summaries.map(s => [s.patchId, s.summary]));


      // --- PAGE 1: COVER ---
      pdf.setFontSize(24);
      pdf.setTextColor("#0ea5e9");
      pdf.text("Corrosion Inspection Report", pageWidth / 2, yPos, { align: "center" });
      yPos += 20;

      pdf.setFontSize(11);
      pdf.setTextColor(0);
      const addCoverField = (label: string, value: string) => {
        pdf.setFont("helvetica", "bold");
        pdf.text(label, margin, yPos);
        pdf.setFont("helvetica", "normal");
        pdf.text(value, margin + 40, yPos);
        yPos += 8;
      };

      addCoverField("Asset ID:", reportMetadata.assetId);
      addCoverField("Asset Type:", assetType);
      addCoverField("Location:", reportMetadata.location);
      addCoverField("Inspector:", reportMetadata.inspector);
      addCoverField("Inspection Date:", new Date().toLocaleDateString());
      yPos += 10;
      
      pdf.setFont("helvetica", "bold");
      pdf.text("Executive Summary", margin, yPos);
      yPos += 6;
      pdf.setFont("helvetica", "normal");
      const summaryLines = pdf.splitTextToSize(reportSummary, pageWidth - margin * 2);
      pdf.text(summaryLines, margin, yPos);
      yPos += summaryLines.length * 5 + 15;

      const twoDDataUrl = twoDViewRef.current?.capture();
      const threeDDataUrl = threeDeeViewRef.current?.capture();

      if (twoDDataUrl) {
        pdf.addImage(twoDDataUrl, "PNG", margin, yPos, (pageWidth - margin*2)/2 - 5, 100, undefined, 'FAST');
      }
      if (threeDDataUrl) {
         pdf.addImage(threeDDataUrl, "PNG", pageWidth/2 + 5, yPos, (pageWidth - margin*2)/2 - 5, 100, undefined, 'FAST');
      }
      yPos += 110;
      
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.text("Left: 2D Unwrapped Heatmap. Right: 3D Surface Model.", pageWidth / 2, yPos, { align: "center"});


      // --- PAGE 2+: PATCH DETAILS ---
      const sortedPatches = [...segments].sort((a, b) => a.worstThickness - b.worstThickness);
      
      for (const patch of sortedPatches) {
        pdf.addPage();
        yPos = 20;

        pdf.setFillColor(240, 240, 240);
        pdf.rect(0, yPos - 10, pageWidth, 15, 'F');
        pdf.setFontSize(16);
        pdf.setTextColor(0);
        pdf.text(`Patch #${patch.id} - ${patch.tier} Finding`, margin, yPos);
        yPos += 15;

        const addStat = (label: string, value: string) => {
            pdf.setFont("helvetica", "bold");
            pdf.text(label, margin, yPos);
            pdf.setFont("helvetica", "normal");
            pdf.text(value, margin + 50, yPos);
            yPos += 7;
        };

        addStat("Severity Tier:", patch.tier);
        addStat("Min. Thickness:", `${patch.worstThickness.toFixed(2)} mm (${(patch.worstThickness / nominalThickness * 100).toFixed(1)}%)`);
        addStat("Avg. Thickness:", `${patch.avgThickness.toFixed(2)} mm`);
        addStat("Point Count:", `${patch.pointCount}`);
        addStat("Bounding Box:", `X: ${patch.coordinates.xMin}-${patch.coordinates.xMax}, Y: ${patch.coordinates.yMin}-${patch.coordinates.yMax}`);
        yPos += 5;
        
        pdf.setFont("helvetica", "bold");
        pdf.text("AI-Generated Analysis:", margin, yPos);
        yPos += 6;
        pdf.setFont("helvetica", "normal");
        const patchSummary = patchSummariesMap.get(patch.id) || "Could not generate AI summary for this patch.";
        const analysisLines = pdf.splitTextToSize(patchSummary, pageWidth - margin * 2);
        pdf.text(analysisLines, margin, yPos);
        yPos += analysisLines.length * 5 + 10;
        
        if (patch.heatmapDataUrl) {
            pdf.setFont("helvetica", "bold");
            pdf.text("Patch 2D Heatmap:", margin, yPos);
            yPos += 5;
            pdf.addImage(patch.heatmapDataUrl, 'PNG', margin, yPos, 80, 80);
        }
         if (patch.isoViewDataUrl) {
            pdf.setFont("helvetica", "bold");
            pdf.text("Patch 3D View:", margin + 95, yPos);
            pdf.addImage(patch.isoViewDataUrl, 'PNG', margin + 95, yPos + 5, 80, 80);
        }
      }

      pdf.save(`Corrosion_Report_${reportMetadata.assetId}.pdf`);
    } catch (error) {
      console.error("PDF Generation Failed:", error);
      alert("Failed to generate report. Check the console for more details.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 h-full">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Generate PDF Report</CardTitle>
          <CardDescription>
            Configure the report metadata and click generate. The report will include a summary,
            overall asset views, and detailed pages for each identified corrosion patch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assetId">Asset ID</Label>
            <Input
              id="assetId"
              value={reportMetadata.assetId}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, assetId: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location / Site</Label>
            <Input
              id="location"
              value={reportMetadata.location}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, location: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inspector">Inspector Name</Label>
            <Input
              id="inspector"
              value={reportMetadata.inspector}
              onChange={(e) => setReportMetadata((prev) => ({ ...prev, inspector: e.target.value }))}
            />
          </div>
          <Button onClick={generatePdf} disabled={isGenerating || !inspectionResult || !segments} className="w-full">
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isGenerating ? "Generating Report..." : "Generate & Download PDF"}
          </Button>
        </CardContent>
      </Card>
       <Card className="bg-muted/30">
          <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><FileText /> Report Preview</CardTitle>
               <CardDescription>
                The generated PDF will contain the following sections:
              </CardDescription>
          </CardHeader>
          <CardContent>
                <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                    <li>A cover page with the executive summary and overall asset views.</li>
                    <li>A detailed page for each detected corrosion patch.</li>
                    <li>Each patch page includes statistics, an AI-generated analysis, and 2D/3D visual snapshots.</li>
                </ul>
          </CardContent>
      </Card>
    </div>
  );
}

    