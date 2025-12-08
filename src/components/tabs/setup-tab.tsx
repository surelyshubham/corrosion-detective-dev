

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
import { MergeAlertDialog, type MergeFormValues } from './merge-alert-dialog'

const setupSchema = z.object({
  assetType: z.enum(assetTypes, { required_error: 'Asset type is required.' }),
  nominalThickness: z.coerce.number().min(0.1, 'Must be positive.'),
  pipeOuterDiameter: z.coerce.number().min(1, 'Must be positive.').optional(),
  pipeLength: z.coerce.number().min(1, 'Must be positive.').optional(),
})

type SetupFormValues = z.infer<typeof setupSchema>


export function SetupTab() {
  const { 
    inspectionResult, 
    isLoading,
    processFirstFile, 
    mergeNextFile,
    resetProject,
    reprocessPlates,
  } = useInspectionStore();
  
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMergeAlertOpen, setIsMergeAlertOpen] = useState(false);
  const [fileToMerge, setFileToMerge] = useState<File | null>(null);

  const { control, handleSubmit, watch, formState: { errors }, setValue } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      nominalThickness: inspectionResult?.nominalThickness || 6,
      assetType: inspectionResult?.assetType,
      pipeOuterDiameter: inspectionResult?.pipeOuterDiameter || 1000,
      pipeLength: inspectionResult?.pipeLength || 1000,
    },
  })
  
  useEffect(() => {
    if (inspectionResult) {
      setValue('assetType', inspectionResult.assetType);
      setValue('nominalThickness', inspectionResult.nominalThickness);
      if(inspectionResult.pipeOuterDiameter) setValue('pipeOuterDiameter', inspectionResult.pipeOuterDiameter);
      if(inspectionResult.pipeLength) setValue('pipeLength', inspectionResult.pipeLength);
      setFiles(inspectionResult.plates.map(p => new File([], p.fileName)));
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
    if (inspectionResult && DataVault.stats) {
        setFileToMerge(validFile);
        setIsMergeAlertOpen(true);
    } else {
        // Otherwise, it's the first file
        setFiles([validFile]);
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileDrop(event.target.files);
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
    processFirstFile(files[0], Number(data.nominalThickness), data.assetType, processConfig);
  };
  
  const handleMergeConfirm = (mergeData: MergeFormValues) => {
      if (!fileToMerge) return;
      mergeNextFile(fileToMerge, mergeData);
      setIsMergeAlertOpen(false);
      setFileToMerge(null);
  };
  
  const handleClear = () => {
    resetProject();
    setFiles([]);
  }

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
                        <span className="truncate max-w-[250px]">{files.map(f => f.name).join(', ')}</span>
                      </div>
                      {!inspectionResult && (
                         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFiles([])} disabled={isLoading}>
                            <X className="h-4 w-4" />
                        </Button>
                      )}
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
                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${!selectedAssetType || isLoading ? 'cursor-not-allowed bg-muted/50' : 'hover:border-primary hover:bg-accent/20'}`}
                    onClick={() => selectedAssetType && !isLoading && fileInputRef.current?.click()}
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
                      if (!isNaN(val) && inspectionResult) {
                        reprocessPlates(val);
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

      <MergeAlertDialog 
        isOpen={isMergeAlertOpen}
        onClose={() => setIsMergeAlertOpen(false)}
        onConfirm={handleMergeConfirm}
        fileName={fileToMerge?.name || ''}
        lastStats={DataVault.stats}
      />
    </div>
  )
}
    
