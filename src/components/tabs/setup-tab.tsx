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
import { FileUp, Loader2, Paperclip, X, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react'
import { DummyDataGenerator } from '@/components/dummy-data-generator'
import { useInspectionStore } from '@/store/use-inspection-store'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface SetupTabProps {
  onFileProcess: (file: File, assetType: AssetType, nominalThickness: number, mergeDirection: 'left' | 'right' | 'top' | 'bottom') => void
  isLoading: boolean
}

const setupSchema = z.object({
  assetType: z.enum(assetTypes, { required_error: 'Asset type is required.' }),
  nominalThickness: z.coerce.number().min(0.1, 'Must be positive.'),
})

type SetupFormValues = z.infer<typeof setupSchema>

export function SetupTab({ onFileProcess, isLoading }: SetupTabProps) {
  const { inspectionResult, setInspectionResult } = useInspectionStore();
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMergeAlertOpen, setIsMergeAlertOpen] = useState(false);

  const { control, handleSubmit, watch, formState: { errors }, getValues, setValue } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      nominalThickness: inspectionResult?.nominalThickness || 6,
      assetType: inspectionResult?.assetType,
    },
  })
  
  React.useEffect(() => {
    if (inspectionResult) {
      setValue('assetType', inspectionResult.assetType);
      setValue('nominalThickness', inspectionResult.nominalThickness);
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

  const processSubmit = (mergeDirection: 'left' | 'right' | 'top' | 'bottom') => {
      if (!file) {
          setFileError('An Excel file is required.');
          return;
      }
      const data = getValues();
      onFileProcess(file, data.assetType, Number(data.nominalThickness), mergeDirection);
      setFile(null); // Clear file after processing
  };

  const onSubmit = () => {
    if (inspectionResult) {
      setIsMergeAlertOpen(true);
    } else {
      // It's the first file, so a direction isn't strictly necessary but we provide one.
      processSubmit('bottom'); 
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
          <div className="space-y-6">
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

            <Button onClick={handleSubmit(onSubmit)} className="w-full" disabled={!file || !selectedAssetType || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Processing...' : (inspectionResult ? 'Process & Merge File' : 'Process File')}
            </Button>

            {inspectionResult && (
                <Card className="bg-muted/50">
                    <CardHeader className="p-4">
                        <CardTitle className="text-base">Plates Loaded: {inspectionResult.plates.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-sm">
                        <ul className="list-disc pl-5">
                            {inspectionResult.plates.map(p => <li key={p.id} className="truncate">{p.fileName}</li>)}
                        </ul>
                         <Button variant="link" className="p-0 h-auto mt-2" onClick={() => setInspectionResult(null)}>Clear all plates</Button>
                    </CardContent>
                </Card>
            )}
          </div>
        </CardContent>
      </Card>
      
      <DummyDataGenerator isLoading={isLoading} />
      
      <AlertDialog open={isMergeAlertOpen} onOpenChange={setIsMergeAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Plate</AlertDialogTitle>
            <AlertDialogDescription>
              You have already loaded data. Where should this new plate be attached relative to the existing plate(s)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-2 gap-4">
            <Button variant="outline" onClick={() => { handleSubmit(d => processSubmit('top'))(); setIsMergeAlertOpen(false); }}>
              <ArrowUp className="mr-2"/>Attach to Top
            </Button>
            <Button variant="outline" onClick={() => { handleSubmit(d => processSubmit('bottom'))(); setIsMergeAlertOpen(false); }}>
              <ArrowDown className="mr-2"/>Attach to Bottom
            </Button>
            <Button variant="outline" onClick={() => { handleSubmit(d => processSubmit('left'))(); setIsMergeAlertOpen(false); }}>
              <ArrowLeft className="mr-2"/>Attach to Left
            </Button>
            <Button variant="outline" onClick={() => { handleSubmit(d => processSubmit('right'))(); setIsMergeAlertOpen(false); }}>
              <ArrowRight className="mr-2"/>Attach to Right
            </Button>
            <AlertDialogCancel className="col-span-2 mt-2">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
