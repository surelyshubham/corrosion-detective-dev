

"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assetTypes, type AssetType } from '@/lib/types'
import { FileUp, Loader2, Paperclip, X, Merge, Rows3, CheckCircle } from 'lucide-react'
import { DummyDataGenerator } from '@/components/dummy-data-generator'
import { useInspectionStore } from '@/store/use-inspection-store'
import { MergeAlertDialog, type MergeFormValues } from './merge-alert-dialog'
import { useToast } from '@/hooks/use-toast'

const setupSchema = z.object({
  assetType: z.enum(assetTypes, { required_error: 'Asset type is required.' }),
  nominalThickness: z.coerce.number().min(0.1, 'Must be positive.'),
  pipeOuterDiameter: z.coerce.number().min(1, 'Must be positive.').optional(),
  pipeLength: z.coerce.number().min(1, 'Must be positive.').optional(),
})

type SetupFormValues = z.infer<typeof setupSchema>


export function SetupTab() {
  const { 
    isLoading,
    isFinalizing,
    stagedFiles,
    addFileToStage,
    finalizeProject,
    resetProject,
    projectDimensions,
  } = useInspectionStore();
  
  const { toast } = useToast();
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMergeAlertOpen, setIsMergeAlertOpen] = useState(false);
  const [fileToMerge, setFileToMerge] = useState<File | null>(null);

  const isProjectStarted = stagedFiles.length > 0;

  const { control, handleSubmit, watch, formState: { errors }, setValue, getValues } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      nominalThickness: 6,
      assetType: undefined,
      pipeOuterDiameter: 1000,
      pipeLength: 1000,
    },
  })
  
  useEffect(() => {
    // This effect now only resets the form when the project is fully cleared
    if (stagedFiles.length === 0) {
        setValue('assetType', undefined);
        setValue('nominalThickness', 6);
    }
  }, [stagedFiles, setValue]);

  const selectedAssetType = watch('assetType')
  
  const handleFileDrop = async (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;

    const validFile = Array.from(newFiles).find(file => file.name.endsWith('.xlsx') || file.name.endsWith('.csv'));
    
    if (!validFile) {
       setFileError('Invalid file type. Only .xlsx or .csv files are accepted.');
       return;
    }
    
    setFileError(null);

    const formData = getValues();
    const config = {
      assetType: formData.assetType,
      nominalThickness: formData.nominalThickness,
      pipeOuterDiameter: formData.pipeOuterDiameter,
      pipeLength: formData.pipeLength
    };

    // If project already started, trigger the merge flow
    if (isProjectStarted) {
        setFileToMerge(validFile);
        setIsMergeAlertOpen(true);
    } else {
        // Otherwise, it's the first file, add it directly
        addFileToStage(validFile, config, null);
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

  const onFinalize = () => {
    if (stagedFiles.length === 0) {
        toast({ variant: 'destructive', title: 'No files staged', description: 'Please add at least one file before processing.' });
        return;
    }
    finalizeProject();
  };
  
  const handleMergeConfirm = (mergeData: MergeFormValues) => {
      if (!fileToMerge) return;
      const formData = getValues();
      const config = {
        assetType: formData.assetType,
        nominalThickness: formData.nominalThickness,
        pipeOuterDiameter: formData.pipeOuterDiameter,
        pipeLength: formData.pipeLength
      };
      addFileToStage(fileToMerge, config, mergeData);
      setIsMergeAlertOpen(false);
      setFileToMerge(null);
  };
  
  const handleClear = () => {
    resetProject();
  }

  const renderAssetSpecificInputs = () => {
    if (selectedAssetType === 'Pipe') {
      return (
         <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeOuterDiameter">Pipe Outer Diameter (mm)</Label>
              <Controller name="pipeOuterDiameter" control={control} render={({ field }) => ( <Input id="pipeOuterDiameter" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pipeLength">Pipe Length (mm)</Label>
              <Controller name="pipeLength" control={control} render={({ field }) => ( <Input id="pipeLength" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
            </div>
          </div>
      )
    }
     if (selectedAssetType === 'Tank' || selectedAssetType === 'Vessel') {
      return (
         <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeOuterDiameter">Tank Diameter (mm)</Label>
              <Controller name="pipeOuterDiameter" control={control} render={({ field }) => ( <Input id="pipeOuterDiameter" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pipeLength">Tank Height (mm)</Label>
              <Controller name="pipeLength" control={control} render={({ field }) => ( <Input id="pipeLength" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
            </div>
          </div>
      )
    }
    return null;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 h-full">
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="font-headline">Project Staging Area</CardTitle>
          <CardDescription>Add C-scan files one-by-one to stage them for merging. Once all files are staged, click "Process Project" to generate the visualizations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 flex-grow">
            <div className="space-y-2">
              <Label htmlFor="assetType">1. Select Asset Type</Label>
              <Controller
                name="assetType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={isProjectStarted}>
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
            
            {renderAssetSpecificInputs()}

            <div className="space-y-2">
              <Label htmlFor="nominalThickness">2. Nominal Thickness (mm)</Label>
               <Controller
                name="nominalThickness"
                control={control}
                render={({ field }) => ( <Input id="nominalThickness" type="number" step="0.1" {...field} disabled={isProjectStarted}/> )}
              />
              {errors.nominalThickness && <p className="text-sm text-destructive">{errors.nominalThickness.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>3. Add Files to Stage (.xlsx, .csv)</Label>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.csv" className="hidden" disabled={!selectedAssetType || isLoading} multiple={false} />
              
                <label 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors ${!selectedAssetType || isLoading ? 'cursor-not-allowed bg-muted/50' : 'hover:border-primary hover:bg-accent/20'}`}
                    onClick={() => selectedAssetType && !isLoading && fileInputRef.current?.click()}
                >
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                    <span className="mt-2 text-sm font-medium text-center">
                        {isLoading && <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Staging file...</>}
                        {!isLoading && !selectedAssetType && 'Select asset type to enable upload'}
                        {!isLoading && selectedAssetType && (isProjectStarted ? 'Click or drag to add another file to merge' : 'Click or drag file to start')}
                    </span>
                </label>
                
              {(fileError) && <p className="text-sm text-destructive">{fileError}</p>}
            </div>
            
            {stagedFiles.length > 0 && (
              <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Rows3 className="h-4 w-4" /> Staged Files</h3>
                  <div className="space-y-2 rounded-md border p-3 bg-background max-h-48 overflow-y-auto">
                    {stagedFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs bg-muted text-muted-foreground rounded-full h-5 w-5 flex items-center justify-center">{i+1}</span>
                                <span className="font-medium truncate max-w-[200px]">{f.name}</span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">{f.mergeConfig ? `${f.mergeConfig.direction} @ ${f.mergeConfig.start}` : 'Base'}</span>
                        </div>
                    ))}
                  </div>
              </div>
            )}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4">
             <Button onClick={onFinalize} className="w-full" disabled={stagedFiles.length === 0 || isLoading || isFinalizing}>
              {isFinalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              {isFinalizing ? 'Finalizing...' : `Process ${stagedFiles.length} Staged Files & View Project`}
            </Button>
            {isProjectStarted && (
               <Button variant="link" className="p-0 h-auto mt-2 w-full text-xs" onClick={handleClear}>Clear all staged files and start over</Button>
            )}
        </CardFooter>
      </Card>
      
      <DummyDataGenerator isLoading={isLoading || isFinalizing} />

      <MergeAlertDialog 
        isOpen={isMergeAlertOpen}
        onClose={() => setIsMergeAlertOpen(false)}
        onConfirm={handleMergeConfirm}
        fileName={fileToMerge?.name || ''}
        lastStats={projectDimensions ? { gridSize: projectDimensions } as any : null}
      />
    </div>
  )
}
    
