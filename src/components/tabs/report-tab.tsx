
"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Construction } from 'lucide-react'

export function ReportTab() {

  return (
    <div className="h-full flex items-center justify-center">
       <Card className="max-w-xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto bg-muted rounded-full p-3 w-fit">
                <Construction className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle className="font-headline mt-4">Report Generation</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
                The reporting feature is currently under construction. Please check back later.
            </p>
          </CardContent>
        </Card>
    </div>
  )
}
