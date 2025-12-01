"use client"

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Merge } from 'lucide-react'

export function MergeTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Merge C-Scans</CardTitle>
        <CardDescription>
          This feature allows you to stitch multiple C-scan files together.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Merge className="h-4 w-4" />
          <AlertTitle>Feature Under Development</AlertTitle>
          <AlertDescription>
            The ability to merge multiple scans is planned for a future version. This would require loading multiple files and defining stitching logic.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-4 opacity-50">
           <h3 className="font-semibold">Merge Direction</h3>
           <div className="flex gap-4">
              <Button disabled variant="outline">Front to Back</Button>
              <Button disabled variant="outline">Top to Bottom</Button>
              <Button disabled variant="outline">Left to Right</Button>
           </div>
           
           <h3 className="font-semibold">Preview</h3>
           <div className="w-full h-48 border border-dashed rounded-md flex items-center justify-center bg-muted/50">
             <p className="text-muted-foreground">Merge preview will appear here.</p>
           </div>

           <Button disabled>Export Merged Excel</Button>
        </div>

      </CardContent>
    </Card>
  )
}
