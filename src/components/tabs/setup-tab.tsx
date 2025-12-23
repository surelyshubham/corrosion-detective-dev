

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
import { assetTypes, type AssetType, type ElbowAngle, type ElbowRadiusType } from '@/lib/types'
import { FileUp, Loader2, Paperclip, X, Merge, Rows3, CheckCircle } from 'lucide-react'
import { DummyDataGenerator } from '@/components/dummy-data-generator'
import { useInspectionStore } from '@/store/use-inspection-store'
import { MergeAlertDialog, type MergeFormValues } from './merge-alert-dialog'
import { useToast } from '@/hooks/use-toast'

// Hull pattern icons
const GenericHullIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 6C4 6 8 8 12 8S20 6 20 6V18H4V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const TankerHullIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 8C4 8 8 10 12 10S20 8 20 8V16C20 17.1046 16.4183 18 12 18S4 17.1046 4 16V8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const ContainerHullIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 8V18H20V8L18 6H6L4 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const BulkCarrierIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 6 L20 6 V18 H4L4 6Z M 4 10 L20 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const DoubleHullIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 8C4 8 8 10 12 10S20 8 20 8V16C20 17.1 16.4 18 12 18S4 17.1 4 16V8Z M6 9V15.5 M18 9V15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const FlatBottomIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 8V16H20V8L18 6H6L4 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="scale(1, 0.8) translate(0, 2)"/></svg>
const ShallowVIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 8L12 12L20 8V16H4V8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const DeepVIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M4 8L12 16L20 8V16H4V8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const BulbousBowIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M20 6C20 6 16 8 12 8S4 6 4 6V18H20V6Z M2 12C2 10 4 9 6 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const SymmetricHullIcon = () => <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 mr-2"><path d="M12 4L20 10V14L12 20L4 14V10L12 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>


const setupSchema = z.object({
  assetType: z.enum(assetTypes, { required_error: 'Asset type is required.' }),
  nominalThickness: z.coerce.number().min(0.1, 'Must be positive.'),
  pipeOuterDiameter: z.coerce.number().min(1, 'Must be positive.').optional(),
  pipeLength: z.coerce.number().min(1, 'Must be positive.').optional(),
  elbowStartLength: z.coerce.number().min(0, "Cannot be negative.").optional(),
  elbowAngle: z.coerce.number().optional(),
  elbowRadiusType: z.string().optional(),
  hullPattern: z.string().optional(),
});


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
      elbowStartLength: 200,
      elbowAngle: 90,
      elbowRadiusType: 'Long',
      hullPattern: 'GenericDisplacementHull',
    },
  })
  
  useEffect(() => {
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
      pipeLength: formData.pipeLength,
      elbowStartLength: formData.elbowStartLength,
      elbowAngle: formData.elbowAngle as ElbowAngle,
      elbowRadiusType: formData.elbowRadiusType as ElbowRadiusType,
      hullPattern: formData.hullPattern,
    };


    if (isProjectStarted) {
        setFileToMerge(validFile);
        setIsMergeAlertOpen(true);
    } else {
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
        pipeLength: formData.pipeLength,
        elbowStartLength: formData.elbowStartLength,
        elbowAngle: formData.elbowAngle as ElbowAngle,
        elbowRadiusType: formData.elbowRadiusType as ElbowRadiusType,
        hullPattern: formData.hullPattern,
      };
      addFileToStage(fileToMerge, config, mergeData);
      setIsMergeAlertOpen(false);
      setFileToMerge(null);
  };
  
  const handleClear = () => {
    resetProject();
  }
  
  const HULL_PATTERNS = [
      { value: 'GenericDisplacementHull', label: 'Generic Displacement Hull', icon: GenericHullIcon },
      { value: 'FullBodiedTankerHull', label: 'Full-Bodied Tanker Hull', icon: TankerHullIcon },
      { value: 'ContainerShipHull', label: 'Container Ship Hull', icon: ContainerHullIcon },
      { value: 'BulkCarrierHull', label: 'Bulk Carrier Hull', icon: BulkCarrierIcon },
      { value: 'DoubleHullPattern', label: 'Double Hull Pattern', icon: DoubleHullIcon },
      { value: 'FlatBottomHull', label: 'Flat Bottom Hull', icon: FlatBottomIcon },
      { value: 'ShallowVHull', label: 'Shallow V Hull', icon: ShallowVIcon },
      { value: 'DeepVHull', label: 'Deep V Hull', icon: DeepVIcon },
      { value: 'BulbousBowInfluenceHull', label: 'Bulbous-Bow Influence Hull', icon: BulbousBowIcon },
      { value: 'SymmetricEngineeringHull', label: 'Symmetric Engineering Hull', icon: SymmetricHullIcon },
  ];

  const renderAssetSpecificInputs = () => {
    let diameterLabel = "";
    let lengthLabel = "";
    let showLength = true;

    switch (selectedAssetType) {
        case 'Ship Hull':
            return (
              <div className="space-y-2">
                <Label htmlFor="hullPattern">Hull Pattern Type</Label>
                <Controller
                  name="hullPattern"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isProjectStarted}>
                      <SelectTrigger id="hullPattern"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HULL_PATTERNS.map(pattern => (
                          <SelectItem key={pattern.value} value={pattern.value}>
                            <div className="flex items-center">
                              <pattern.icon />
                              <span>{pattern.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            );
        case 'Pipe':
            diameterLabel = "Pipe Outer Diameter (mm)";
            lengthLabel = "Data Length (mm)";
            break;
        case 'Pipe Elbow':
            diameterLabel = "Pipe Outer Diameter (mm)";
            lengthLabel = "Total Pipe Length (mm)";
            break;
        case 'Tank':
            diameterLabel = "Tank Diameter (mm)";
            lengthLabel = "Tank Height (mm)";
            break;
        case 'Vessel':
            diameterLabel = "Vessel Diameter (mm)";
            lengthLabel = "Vessel Length (mm)";
            break;
        case 'LPG/Gas Bullet':
            diameterLabel = "Bullet Diameter (mm)";
            showLength = false;
            break;
        default:
            return null;
    }

    return (
        <div className="grid grid-cols-2 gap-4">
            <div className={`space-y-2 ${!showLength ? 'col-span-2' : ''}`}>
                <Label htmlFor="pipeOuterDiameter">{diameterLabel}</Label>
                <Controller name="pipeOuterDiameter" control={control} render={({ field }) => ( <Input id="pipeOuterDiameter" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
            </div>
            {showLength && (
                <div className="space-y-2">
                    <Label htmlFor="pipeLength">{lengthLabel}</Label>
                    <Controller name="pipeLength" control={control} render={({ field }) => ( <Input id="pipeLength" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
                </div>
            )}
             {selectedAssetType === 'Pipe Elbow' && (
              <>
                <div className="space-y-2">
                    <Label htmlFor="elbowStartLength">Elbow Start Length (mm)</Label>
                    <Controller name="elbowStartLength" control={control} render={({ field }) => ( <Input id="elbowStartLength" type="number" step="1" {...field} disabled={isProjectStarted} /> )} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="elbowAngle">Elbow Angle</Label>
                    <Controller
                        name="elbowAngle" control={control}
                        render={({ field }) => (
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={String(field.value)} disabled={isProjectStarted}>
                            <SelectTrigger id="elbowAngle"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30">30°</SelectItem>
                                <SelectItem value="45">45°</SelectItem>
                                <SelectItem value="90">90°</SelectItem>
                            </SelectContent>
                        </Select>
                        )}
                    />
                </div>
                <div className="col-span-2 space-y-2">
                    <Label htmlFor="elbowRadiusType">Elbow Radius Type</Label>
                     <Controller
                        name="elbowRadiusType" control={control}
                        render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isProjectStarted}>
                            <SelectTrigger id="elbowRadiusType"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Long">Long Radius (1.5D)</SelectItem>
                                <SelectItem value="Short">Short Radius (1.0D)</SelectItem>
                            </SelectContent>
                        </Select>
                        )}
                    />
                </div>
              </>
            )}
        </div>
    );
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
                        <div key={i} className="flex items-center justify-between text-sm gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs bg-muted text-muted-foreground rounded-full h-5 w-5 flex items-center justify-center shrink-0">{i+1}</span>
                                <span className="font-medium truncate" title={f.name}>{f.name}</span>
                            </div>
                            <div className="text-xs font-mono text-muted-foreground text-right shrink-0">
                                {f.dimensions && <span>{f.dimensions.width}x{f.dimensions.height}pts</span>}
                                {f.mergeConfig && <span className="ml-2">{f.mergeConfig.direction} @ {f.mergeConfig.start}</span>}
                            </div>
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
    
