
"use client"

import React, { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Merge } from 'lucide-react'
import type { InspectionStats } from '@/lib/types'

const mergeSchema = z.object({
    direction: z.enum(['right', 'bottom', 'left', 'top']),
    start: z.coerce.number().min(0, "Start coordinate must be non-negative."),
});

export type MergeFormValues = z.infer<typeof mergeSchema>;

interface MergeAlertDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: MergeFormValues) => void;
    fileName: string;
    lastStats: InspectionStats | null;
}


export function MergeAlertDialog({ isOpen, onClose, onConfirm, fileName, lastStats }: MergeAlertDialogProps) {
  
  const form = useForm<MergeFormValues>({
    resolver: zodResolver(mergeSchema),
    defaultValues: {
        direction: 'right',
        start: lastStats?.gridSize.width || 0,
    }
  });

  const watchedDirection = form.watch('direction');

  useEffect(() => {
    if (!isOpen || !lastStats) return;
    const { width, height } = lastStats.gridSize;
    let startValue = 0;
    switch (watchedDirection) {
        case 'right': startValue = width; break;
        case 'left': startValue = 0; break;
        case 'bottom': startValue = height; break;
        case 'top': startValue = 0; break;
    }
    form.setValue('start', startValue);
  }, [watchedDirection, form, isOpen, lastStats]);


  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent>
            <form onSubmit={form.handleSubmit(onConfirm)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Merge New Plate</AlertDialogTitle>
                    <AlertDialogDescription>
                        Configure how to stitch the new C-Scan data (<span className="font-bold">{fileName}</span>) onto the existing grid.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-6 grid gap-6">
                    <div className="space-y-3">
                        <Label>1. Stitching Direction</Label>
                        <Controller
                            name="direction"
                            control={form.control}
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
                            control={form.control}
                            render={({field}) => (
                                <Input id="merge-start" type="number" {...field} />
                            )}
                         />
                         <p className="text-xs text-muted-foreground">
                            Defines the starting row/column for the new plate. For 'Right', this is the X coordinate. For 'Bottom', this is the Y coordinate.
                         </p>
                         {form.formState.errors.start && <p className="text-sm text-destructive">{form.formState.errors.start.message}</p>}
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction type="submit">
                        <Merge className="mr-2" />
                        Process & Merge
                    </AlertDialogAction>
                </AlertDialogFooter>
            </form>
        </AlertDialogContent>
      </AlertDialog>
  )
}
