
"use client"

import React, { useState, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assetTypes, type AssetType } from '@/lib/types'
import { FileUp, Loader2, Paperclip, X, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Merge } from 'lucide-react'
import { DummyDataGenerator } from '@/components/dummy-data-generator'
import { useInspectionStore } from '@/store/use-inspection-store'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { useToast } from '@/hooks/use-toast'

interface SetupTabProps {
  onFileProcess: (file: File, assetType: AssetType, nominalThickness: number, options: {
    direction: 'left' | 'right' | 'top' | 'bottom';
    start: number;
    pipeOuterDiameter?: number;
    pipeLength?: number;
  }) => void
  isLoading: boolean
}

const setupSchema = z.object({
  assetType: z.enum(assetTypes, { required_error: 'Asset type is required.' }),
  nominalThickness: z.coerce.number().min(0.1, 'Must be positive.'),
  pipeOuterDiameter: z.coerce.number().min(1, 'Must be positive.').optional(),
  pipeLength: z.coerce.number().min(1, 'Must be positive.').optional(),
})

type SetupFormValues = z.infer<typeof setupSchema>

const mergeSchema = z.object({
    direction: z.enum(['top', 'bottom', 'left', 'right']),
    start: z.coerce.number().min(0, "Start coordinate must be positive."),
});

type MergeFormValues = z.infer<typeof mergeSchema>;


export function SetupTab({ onFileProcess, isLoading }: SetupTabProps) {
  const { inspectionResult, setInspectionResult } = useInspectionStore();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMergeAlertOpen, setIsMergeAlertOpen] = useState(false);

  const { control, handleSubmit, watch, formState: { errors }, getValues, setValue } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      nominalThickness: inspectionResult?.nominalThickness || 6,
      assetType: inspectionResult?.assetType,
      pipeOuterDiameter: inspectionResult?.pipeOuterDiameter || 1000,
      pipeLength: inspectionResult?.pipeLength || 1000,
    },
  })
  
  const mergeForm = useForm<MergeFormValues>({
    resolver: zodResolver(mergeSchema),
    defaultValues: {
        direction: 'right',
        start: inspectionResult ? inspectionResult.stats.gridSize.width : 0,
    }
  });


  React.useEffect(() => {
    if (inspectionResult) {
      setValue('assetType', inspectionResult.assetType);
      setValue('nominalThickness', inspectionResult.nominalThickness);
      if(inspectionResult.pipeOuterDiameter) {
        setValue('pipeOuterDiameter', inspectionResult.pipeOuterDiameter);
      }
      if(inspectionResult.pipeLength) {
        setValue('pipeLength', inspectionResult.pipeLength);
      }
    }
  }, [inspectionResult, setValue]);

  const selectedAssetType = watch('assetType')

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.name.endsWith('.xlsx')) {
        setFile(selectedFile)
        setFileError(null)
      } else {
        setFile(null)
        setFileError('Invalid file type. Please upload a .xlsx file.')
      }
    }
  }
  
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => e.preventDefault();
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        if (droppedFile.name.endsWith('.xlsx')) {
            setFile(droppedFile);
            setFileError(null);
        } else {
            setFile(null);
            setFileError('Invalid file type. Please upload a .xlsx file.');
        }
      }
  };

  const handleInitialSubmit = () => {
    if (!file) {
        setFileError('An Excel file is required.');
        return;
    }
    const data = getValues();
    onFileProcess(file, data.assetType, Number(data.nominalThickness), { 
      direction: 'right', 
      start: 0, 
      pipeOuterDiameter: data.pipeOuterDiameter,
      pipeLength: data.pipeLength,
    });
    setFile(null); // Clear file after processing
  };

  const handleMergeSubmit = (mergeData: MergeFormValues) => {
    if (!file) return; // Should not happen if button is disabled
    const setupData = getValues();

    const expectedStart = mergeData.direction === 'right' || mergeData.direction === 'left' 
        ? inspectionResult!.stats.gridSize.width
        : inspectionResult!.stats.gridSize.height;
    
    if (mergeData.start < expectedStart) {
        toast({
            variant: "destructive",
            title: "Merge Error: Overlap Detected",
            description: `Start coordinate (${mergeData.start}) cannot be less than the end of the existing grid (${expectedStart}). Plates would overlap.`,
        });
        return;
    }
    
    onFileProcess(file, setupData.assetType, Number(setupData.nominalThickness), {
      direction: mergeData.direction,
      start: mergeData.start,
      pipeOuterDiameter: setupData.pipeOuterDiameter,
      pipeLength: setupData.pipeLength,
    });
    setFile(null);
    setIsMergeAlertOpen(false);
  };

  const onSubmit = () => {
    if (inspectionResult) {
      const { gridSize } = inspectionResult.stats;
      const direction = mergeForm.watch('direction');
      const expectedStart = (direction === 'left' || direction === 'right') ? gridSize.width : gridSize.height;
      mergeForm.setValue('start', expectedStart);
      setIsMergeAlertOpen(true);
    } else {
      handleInitialSubmit();
    }
  };
  
  return (
    <div className="grid md:grid-cols-2 gap-6 h-full">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Inspection Setup</CardTitle>
          <CardDescription>Start by providing asset details and uploading C-scan data. Add multiple files to merge them.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="assetType">1. Select Asset Type</Label>
              <Controller
                name="assetType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={isLoading || !!inspectionResult}>
                    <SelectTrigger id="assetType">
                      <SelectValue placeholder="Select an asset type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assetTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.assetType && <p className="text-sm text-destructive">{errors.assetType.message}</p>}
            </div>

            {(selectedAssetType === 'Pipe' || selectedAssetType === 'Tank' || selectedAssetType === 'Vessel') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pipeOuterDiameter">Outer Diameter (mm)</Label>
                  <Controller
                    name="pipeOuterDiameter"
                    control={control}
                    render={({ field }) => (
                      <Input id="pipeOuterDiameter" type="number" step="1" {...field} disabled={isLoading || !!inspectionResult} />
                    )}
                  />
                  {errors.pipeOuterDiameter && <p className="text-sm text-destructive col-span-2">{errors.pipeOuterDiameter.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pipeLength">Length / Height (mm)</Label>
                  <Controller
                    name="pipeLength"
                    control={control}
                    render={({ field }) => (
                      <Input id="pipeLength" type="number" step="1" {...field} disabled={isLoading || !!inspectionResult} />
                    )}
                  />
                  {errors.pipeLength && <p className="text-sm text-destructive col-span-2">{errors.pipeLength.message}</p>}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>2. Upload Excel File (.xlsx)</Label>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" className="hidden" disabled={!selectedAssetType || isLoading} />
              
                {file ? (
                  <div className="flex items-center justify-between p-3 rounded-md border bg-secondary/50">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Paperclip className="h-4 w-4" />
                      <span>{file.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)} disabled={isLoading}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${!selectedAssetType ? 'cursor-not-allowed bg-muted/50' : 'hover:border-primary hover:bg-accent/20'}`}
                    onClick={() => selectedAssetType && fileInputRef.current?.click()}
                    >
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                    <span className="mt-2 text-sm font-medium text-center">
                      {selectedAssetType ? 'Click to browse or drag & drop file' : 'Select an asset type to enable upload'}
                    </span>
                  </label>
                )}

              {(fileError) && <p className="text-sm text-destructive">{fileError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nominalThickness">3. Nominal Thickness (mm)</Label>
               <Controller
                name="nominalThickness"
                control={control}
                render={({ field }) => (
                  <Input id="nominalThickness" type="number" step="0.1" {...field} disabled={isLoading} />
                )}
              />
              {errors.nominalThickness && <p className="text-sm text-destructive">{errors.nominalThickness.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={!file || !selectedAssetType || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Processing...' : (inspectionResult ? 'Process & Merge File' : 'Process File')}
            </Button>
          </form>

          {inspectionResult && (
              <Card className="bg-muted/50 mt-6">
                  <CardHeader className="p-4">
                      <CardTitle className="text-base">Plates Loaded: {inspectionResult.plates.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 text-sm">
                      <ul className="list-disc pl-5">
                          {inspectionResult.plates.map(p => <li key={p.id} className="truncate">{p.fileName}</li>)}
                      </ul>
                       <Button variant="link" className="p-0 h-auto mt-2" onClick={() => { setInspectionResult(null); mergeForm.reset(); }}>Clear all plates</Button>
                  </CardContent>
              </Card>
          )}

        </CardContent>
      </Card>
      
      <DummyDataGenerator isLoading={isLoading} />
      
      <AlertDialog open={isMergeAlertOpen} onOpenChange={setIsMergeAlertOpen}>
        <AlertDialogContent>
          <form onSubmit={mergeForm.handleSubmit(handleMergeSubmit)}>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><Merge /> Merge Plate</AlertDialogTitle>
              <AlertDialogDescription>
                Define how to attach the new plate relative to the existing grid.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
               <Controller
                    name="direction"
                    control={mergeForm.control}
                    render={({ field }) => (
                        <RadioGroup 
                            onValueChange={(val) => {
                                field.onChange(val);
                                const { gridSize } = inspectionResult!.stats;
                                const expectedStart = (val === 'left' || val === 'right') ? gridSize.width : gridSize.height;
                                mergeForm.setValue('start', expectedStart);
                            }} 
                            value={field.value} 
                            className="grid grid-cols-2 gap-4"
                        >
                            <Label htmlFor="right" className="flex items-center gap-2 p-4 border rounded-md cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary">
                                <RadioGroupItem value="right" id="right" /> Attach to Right
                            </Label>
                            <Label htmlFor="left" className="flex items-center gap-2 p-4 border rounded-md cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary">
                                <RadioGroupItem value="left" id="left" /> Attach to Left
                            </Label>
                            <Label htmlFor="bottom" className="flex items-center gap-2 p-4 border rounded-md cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary">
                                <RadioGroupItem value="bottom" id="bottom" /> Attach to Bottom
                            </Label>
                            <Label htmlFor="top" className="flex items-center gap-2 p-4 border rounded-md cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary">
                                <RadioGroupItem value="top" id="top" /> Attach to Top
                            </Label>
                        </RadioGroup>
                    )}
                />

                <div className="space-y-2">
                    <Label htmlFor="start-coord">Start Coordinate (Row/Column Index)</Label>
                    <Input 
                        id="start-coord"
                        type="number"
                        min={0}
                        {...mergeForm.register('start')}
                    />
                     {mergeForm.formState.errors.start && <p className="text-sm text-destructive">{mergeForm.formState.errors.start.message}</p>}
                    <p className="text-xs text-muted-foreground">
                        Defines the starting row/column index for the new plate. A gap will be created if this is greater than the current grid boundary.
                    </p>
                </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit">Validate & Merge</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
