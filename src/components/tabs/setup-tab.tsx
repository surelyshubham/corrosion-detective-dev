"use client"

import React, { useState, useRef, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assetTypes, type AssetType } from '@/lib/types'
import { FileUp, Loader2, Paperclip, X } from 'lucide-react'
import { DummyDataGenerator } from '@/components/dummy-data-generator'

interface SetupTabProps {
  onFileProcess: (file: File, assetType: AssetType, nominalThickness: number) => void
  isLoading: boolean
}

const setupSchema = z.object({
  assetType: z.enum(assetTypes, { required_error: 'Asset type is required.' }),
  nominalThickness: z.coerce.number().min(0.1, 'Must be positive.'),
})

type SetupFormValues = z.infer<typeof setupSchema>

export function SetupTab({ onFileProcess, isLoading }: SetupTabProps) {
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { control, handleSubmit, watch, formState: { errors } } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      nominalThickness: 6,
    },
  })

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


  const onSubmit = (data: SetupFormValues) => {
    if (!file) {
      setFileError('An Excel file is required.')
      return
    }
    onFileProcess(file, data.assetType, data.nominalThickness)
  }
  
  return (
    <div className="grid md:grid-cols-2 gap-6 h-full">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Inspection Setup</CardTitle>
          <CardDescription>Start by providing the asset details and uploading the C-scan data.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="assetType">1. Select Asset Type</Label>
              <Controller
                name="assetType"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
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

              {(fileError || errors.assetType) && <p className="text-sm text-destructive">{fileError || errors.assetType?.message}</p>}
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
              {isLoading ? 'Processing...' : 'Process Data'}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <DummyDataGenerator isLoading={isLoading} />

    </div>
  )
}
