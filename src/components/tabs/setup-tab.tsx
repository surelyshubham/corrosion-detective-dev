
"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assetTypes, type AssetType } from '@/lib/types'
import { FileUp, Loader2, Paperclip, X, Merge } from 'lucide-react'
import { DummyDataGenerator } from '@/components/dummy-data-generator'
import { useInspectionStore } from '@/store/use-inspection-store'
import { DataVault } from '@/store/data-vault'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { useToast } from '@/hooks/use-toast'
import { parseExcel } from '@/lib/excel-parser'

interface SetupTabProps {
  isLoading: boolean
  onNominalThicknessChange: (newNominal: number) => void;
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


export function SetupTab({ isLoading, onNominalThicknessChange }: SetupTabProps) {
  const { inspectionResult, setInspectionResult, processFiles } = useInspectionStore();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMergeAlertOpen, setIsMergeAlertOpen] = useState(false);
  const [newFileToMerge, setNewFileToMerge] = useState<File | null>(null);

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
  });

  useEffect(() => {
    if (inspectionResult) {
      setValue('assetType', inspectionResult.assetType);
      setValue('nominalThickness', inspectionResult.nominalThickness);
      if(inspectionResult.pipeOuterDiameter) {
        setValue('pipeOuterDiameter', inspectionResult.pipeOuterDiameter);
      }
      if(inspectionResult.pipeLength) {
        setValue('pipeLength', inspectionResult.pipeLength);
      }
      // Keep existing files in state if they exist to allow merging
      if (inspectionResult.plates && inspectionResult.plates.length > 0) {
        // This part is tricky because we don't have the File object itself.
        // We'll rely on the user adding a *new* file to trigger the merge.
        // For the display, we can show the names.
        setFiles(inspectionResult.plates.map(p => new File([], p.fileName)));
      }

    }
  }, [inspectionResult, setValue]);

  const selectedAssetType = watch('assetType')
  
  const handleFileDrop = async (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;

    const validFile = Array.from(newFiles).find(file => file.name.endsWith('.xlsx') || file.name.endsWith('.csv'));
    
    if (!validFile) {
       setFileError('Invalid file type. Only .xlsx or .csv files are accepted.');
       return;
    }
    
    setFileError(null);

    // If data already exists, trigger the merge flow
    if (inspectionResult && DataVault.gridMatrix) {
        setNewFileToMerge(validFile);
        const { width, height } = DataVault.stats?.gridSize || { width: 0, height: 0 };
        mergeForm.reset({
            direction: 'right',
            start: width,
        });
        setIsMergeAlertOpen(true);
    } else {
        // Otherwise, it's the first file
        setFiles([validFile]);
        try {
            const arrayBuffer = await validFile.arrayBuffer();
            const { detectedNominalThickness } = parseExcel(arrayBuffer);
            if (detectedNominalThickness !== null) {
                setValue('nominalThickness', detectedNominalThickness);
                 toast({
                    title: "Nominal Thickness Detected",
                    description: `Set to ${detectedNominalThickness.toFixed(2)} mm based on file metadata. You can edit this value if needed.`,
                });
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error reading file',
                description: error.message,
            });
        }
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileDrop(event.target.files);
    // Clear the input so the same file can be selected again
    if(event.target) event.target.value = '';
  }
  
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => e.preventDefault();
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      handleFileDrop(e.dataTransfer.files);
  };

  const onSubmit = (data: SetupFormValues) => {
    if (files.length === 0) {
        setFileError('An Excel or CSV file is required.');
        return;
    }
    const processConfig = {
      pipeOuterDiameter: data.pipeOuterDiameter,
      pipeLength: data.pipeLength,
    };
    processFiles(files, Number(data.nominalThickness), data.assetType, processConfig);
  };
  
  const onDebouncedNominalChange = (value: number) => {
     if (inspectionResult) {
        onNominalThicknessChange(value);
    }
  };
  
  const handleMergeSubmit = (mergeData: MergeFormValues) => {
      if (!newFileToMerge) return;
      
      const setupData = getValues();
      const processConfig = {
          merge: {
              file: newFileToMerge,
              direction: mergeData.direction,
              start: mergeData.start
          },
          pipeOuterDiameter: setupData.pipeOuterDiameter,
          pipeLength: setupData.pipeLength,
      }
       processFiles(files, Number(setupData.nominalThickness), setupData.assetType, processConfig);
       setIsMergeAlertOpen(false);
       setNewFileToMerge(null);
  };
  

  const handleClear = () => {
    setFiles([]);
    setInspectionResult(null);
  }
  
  const watchedMergeDirection = mergeForm.watch('direction');
  useEffect(() => {
    if (!isMergeAlertOpen) return;
    const { width, height } = DataVault.stats?.gridSize || { width: 0, height: 0 };
    let startValue = 0;
    if (watchedMergeDirection === 'right') startValue = width;
    if (watchedMergeDirection === 'left') startValue = 0; 
    if (watchedMergeDirection === 'bottom') startValue = height;
    if (watchedMergeDirection === 'top') startValue = 0; 
    mergeForm.setValue('start', startValue);
  }, [watchedMergeDirection, mergeForm, isMergeAlertOpen]);


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
                  <Label htmlFor="pipeOuterDiameter">{selectedAssetType} Diameter (mm)</Label>
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
                  <Label htmlFor="pipeLength">{selectedAssetType === 'Pipe' ? 'Length' : 'Height'} (mm)</Label>
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
              <Label>2. Upload File (.xlsx, .csv)</Label>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.csv" className="hidden" disabled={!selectedAssetType || isLoading} multiple={false} />
              
                {files.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-md border bg-secondary/50">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Paperclip className="h-4 w-4" />
                        <span>{files.map(f => f.name).join(', ')}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFiles([])} disabled={isLoading || !!inspectionResult}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                     <label 
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={`flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-md cursor-pointer transition-colors ${!selectedAssetType || isLoading ? 'cursor-not-allowed bg-muted/50' : 'hover:border-primary hover:bg-accent/20'}`}
                        onClick={() => selectedAssetType && !isLoading && fileInputRef.current?.click()}
                        >
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Merge className="h-4 w-4 text-muted-foreground" />
                            <span>Add another file to merge...</span>
                        </div>
                     </label>
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
                      {selectedAssetType ? 'Click to browse or drag & drop files' : 'Select an asset type to enable upload'}
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
                  <Input 
                    id="nominalThickness" 
                    type="number" 
                    step="0.1" 
                    {...field}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      field.onChange(e);
                      if (!isNaN(val)) {
                        onDebouncedNominalChange(val);
                      }
                    }}
                    disabled={isLoading} />
                )}
              />
              {errors.nominalThickness && <p className="text-sm text-destructive">{errors.nominalThickness.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={files.length === 0 || !selectedAssetType || isLoading || !!inspectionResult}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Processing...' : 'Process File'}
            </Button>
            {inspectionResult && (
               <Button variant="link" className="p-0 h-auto mt-2 w-full" onClick={handleClear}>Clear all data and start over</Button>
            )}
          </form>
        </CardContent>
      </Card>
      
      <DummyDataGenerator isLoading={isLoading} />

      <AlertDialog open={isMergeAlertOpen} onOpenChange={setIsMergeAlertOpen}>
        <AlertDialogContent>
            <form onSubmit={mergeForm.handleSubmit(handleMergeSubmit)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Merge New Plate</AlertDialogTitle>
                    <AlertDialogDescription>
                        Configure how to stitch the new C-Scan data (<span className="font-bold">{newFileToMerge?.name}</span>) onto the existing grid.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-6 grid gap-6">
                    <div className="space-y-3">
                        <Label>1. Stitching Direction</Label>
                        <Controller
                            name="direction"
                            control={mergeForm.control}
                            render={({field}) => (
                                 <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-4">
                                    <div><RadioGroupItem value="right" id="r-right" /><Label htmlFor="r-right" className="ml-2">Stitch to Right</Label></div>
                                    <div><RadioGroupItem value="left" id="r-left" /><Label htmlFor="r-left" className="ml-2">Stitch to Left</Label></div>
                                    <div><RadioGroupItem value="bottom" id="r-bottom" /><Label htmlFor="r-bottom" className="ml-2">Stitch to Bottom</Label></div>
                                    <div><RadioGroupItem value="top" id="r-top" /><Label htmlFor="r-top" className="ml-2">Stitch to Top</Label></div>
                                </RadioGroup>
                            )}
                        />
                    </div>
                     <div className="space-y-3">
                        <Label htmlFor="merge-start">2. Start Coordinate</Label>
                         <Controller
                            name="start"
                            control={mergeForm.control}
                            render={({field}) => (
                                <Input id="merge-start" type="number" {...field} />
                            )}
                         />
                         <p className="text-xs text-muted-foreground">
                            Defines the starting row/column for the new plate. For 'Right', this is the X coordinate. For 'Bottom', this is the Y coordinate.
                         </p>
                         {mergeForm.formState.errors.start && <p className="text-sm text-destructive">{mergeForm.formState.errors.start.message}</p>}
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setNewFileToMerge(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction type="submit">
                        <Merge className="mr-2" />
                        Process & Merge
                    </AlertDialogAction>
                </AlertDialogFooter>
            </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
    