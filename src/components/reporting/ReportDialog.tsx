
"use client"

import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useInspectionStore } from '@/store/use-inspection-store'
import { useReportStore } from '@/store/use-report-store'
import { generateInspectionReport, type ReportData } from '@/reporting/ReportGenerator'
import type { Defect, ReportMetadata } from '@/lib/types'

const reportSchema = z.object({
  companyName: z.string().optional(),
  projectName: z.string().optional(),
  assetName: z.string().optional(),
  scanDate: z.date().optional(),
  reportDate: z.date().optional(),
  area: z.string().optional(),
  operatorName: z.string().optional(),
  remarks: z.string().optional(),
})

type ReportFormValues = z.infer<typeof reportSchema>

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportDialog({ open, onOpenChange }: ReportDialogProps) {
  const { inspectionResult } = useInspectionStore()
  const { captureFunctions } = useReportStore()
  const [isGenerating, setIsGenerating] = useState(false)
  
  const defaultScanDate = React.useMemo(() => {
    const dateMeta = inspectionResult?.plates[0]?.metadata.find(m => String(m[0]).toLowerCase().includes('date'));
    if (dateMeta && dateMeta[1]) {
      // Check if it's a number, which could be an Excel date serial number
      if (typeof dateMeta[1] === 'number') {
        // Convert Excel serial date to JS Date
        return new Date(Date.UTC(1899, 11, 30 + dateMeta[1]));
      }
      const parsedDate = new Date(dateMeta[1]);
      // Check if the parsed date is valid
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    return undefined;
  }, [inspectionResult]);

  const { control, handleSubmit, register } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      reportDate: new Date(),
      scanDate: defaultScanDate,
      assetName: inspectionResult?.plates.map(p => p.fileName.replace('.xlsx', '')).join(', '),
      projectName: inspectionResult?.plates[0]?.metadata.find(m => String(m[0]).toLowerCase().includes('project'))?.[1]
    },
  })

  const onSubmit = async (data: ReportFormValues) => {
    if (!inspectionResult || !captureFunctions) return
    setIsGenerating(true)

    try {
        const overviewScreenshot = captureFunctions.capture();

        const defects: Defect[] = [];
        inspectionResult.mergedGrid.forEach((row, y) => {
            row.forEach((cell, x) => {
                if (cell && cell.percentage !== null && cell.percentage < 80) { // Adjusted threshold
                    defects.push({
                        x,
                        y,
                        rawThickness: cell.rawThickness,
                        effectiveThickness: cell.effectiveThickness,
                        loss: cell.rawThickness !== null && cell.effectiveThickness !== null ? inspectionResult.nominalThickness - cell.effectiveThickness : null,
                        percentage: cell.percentage,
                    });
                }
            });
        });
        
        // Sort defects by severity
        defects.sort((a, b) => (a.percentage || 100) - (b.percentage || 100));

        const defectScreenshots: Record<string, string> = {};
        for (const defect of defects.slice(0, 5)) { // Limit to top 5 defects for now
            if (captureFunctions.focus) {
                captureFunctions.focus(defect.x, defect.y);
                // Wait for camera to move
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            defectScreenshots[`${defect.x},${defect.y}`] = captureFunctions.capture();
        }


        const reportData: ReportData = {
            metadata: data as ReportMetadata,
            inspection: inspectionResult,
            defects,
            screenshots: {
                overview: overviewScreenshot,
                defects: defectScreenshots,
            }
        };

        await generateInspectionReport(reportData);
        onOpenChange(false);
    } catch (error) {
        console.error("Failed to generate report", error);
    } finally {
        setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Generate Inspection Report</DialogTitle>
            <DialogDescription>
              Fill in the details for the report. All fields are optional.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6 max-h-[70vh] overflow-y-auto pr-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" {...register('companyName')} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input id="projectName" {...register('projectName')} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="assetName">Equipment / Asset Name</Label>
                    <Input id="assetName" {...register('assetName')} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="area">Area / Region</Label>
                    <Input id="area" {...register('area')} />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Date of Scanning</Label>
                    <Controller
                        name="scanDate"
                        control={control}
                        render={({ field }) => (
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/>
                                </PopoverContent>
                            </Popover>
                        )}
                    />
                </div>
                 <div className="space-y-2">
                    <Label>Date of Report</Label>
                     <Controller
                        name="reportDate"
                        control={control}
                        render={({ field }) => (
                           <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/>
                                </PopoverContent>
                            </Popover>
                        )}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="operatorName">Operator Name</Label>
                <Input id="operatorName" {...register('operatorName')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea id="remarks" {...register('remarks')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
            <Button type="submit" disabled={isGenerating}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isGenerating ? 'Generating...' : 'Generate & Download'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
