
"use client";

import React, { useState, useRef } from "react";
import { useInspectionStore } from "@/store/use-inspection-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// Note: The DOCX builder will replace the jsPDF implementation
// import { ReportBuilder } from "@/report/docx/ReportBuilder";
// import type { ReportInput } from "@/report/docx/types";

interface ReportTabProps {
  twoDViewRef: React.RefObject<any>;
  threeDeeViewRef: React.RefObject<any>;
}

export function ReportTab({ twoDViewRef, threeDeeViewRef }: ReportTabProps) {
  const { inspectionResult, patches } = useInspectionStore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportMetadata, setReportMetadata] = useState({
    clientName: "Firebase Studio",
    assetTag: "ASSET-001",
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
      description: "This feature is not fully implemented yet.",
    });

    // In a future step, this is where we would assemble the ReportInput
    // and call the ReportBuilder.
    // const reportInput: ReportInput = { ... };
    // const builder = new ReportBuilder(reportInput);
    // await builder.generate();

    setTimeout(() => setIsGenerating(false), 2000); // Simulate generation
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
