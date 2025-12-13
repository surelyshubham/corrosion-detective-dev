"use client"

import React, { useState } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button';

const PREVIEW_COUNT = 5;

export function PatchTable() {
  const {
    patches,
    selectedPatchId,
    selectPatch,
  } = useInspectionStore()

  const [showAllCorrosion, setShowAllCorrosion] = useState(false);
  const [showAllNonInspected, setShowAllNonInspected] = useState(false);

  if (!patches) {
    return null;
  }

  const corrosionPatches = patches.corrosion.sort((a, b) => (a.worstThickness ?? Infinity) - (b.worstThickness ?? Infinity));
  const nonInspectedPatches = patches.nonInspected.sort((a, b) => b.pointCount - a.pointCount);

  const visibleCorrosion = showAllCorrosion ? corrosionPatches : corrosionPatches.slice(0, PREVIEW_COUNT);
  const visibleNonInspected = showAllNonInspected ? nonInspectedPatches : nonInspectedPatches.slice(0, PREVIEW_COUNT);


  return (
    <div className="space-y-6">

      {/* CORROSION PATCHES */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base font-headline">
            Corrosion Patches ({corrosionPatches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-muted-foreground">
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-left p-2 font-medium">Severity</th>
                  <th className="text-right p-2 font-medium">Worst (mm)</th>
                  <th className="text-right p-2 font-medium">Avg (mm)</th>
                  <th className="text-right p-2 font-medium">Area (pts)</th>
                </tr>
              </thead>
              <tbody>
                {visibleCorrosion.map(patch => {
                  const isSelected = selectedPatchId === `C-${patch.id}`
                  return (
                    <tr
                      key={`C-${patch.id}`}
                      className={cn(
                        'cursor-pointer border-b hover:bg-muted/50',
                        isSelected && 'bg-muted'
                      )}
                      onClick={() => selectPatch(`C-${patch.id}`)}
                    >
                      <td className="p-2 font-medium">C-{patch.id}</td>
                      <td className="p-2">
                        <Badge variant={
                          patch.tier === 'Critical'
                            ? 'destructive'
                            : patch.tier === 'Severe'
                            ? 'secondary'
                            : 'outline'
                        }>
                          {patch.tier}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        {patch.worstThickness?.toFixed(2)}
                      </td>
                      <td className="p-2 text-right">
                        {patch.avgThickness?.toFixed(2)}
                      </td>
                      <td className="p-2 text-right">
                        {patch.pointCount}
                      </td>
                    </tr>
                  )
                })}
                {corrosionPatches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-muted-foreground">
                      No corrosion patches detected
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
         {corrosionPatches.length > PREVIEW_COUNT && (
          <CardFooter className="p-2">
            <Button variant="link" className="w-full" onClick={() => setShowAllCorrosion(!showAllCorrosion)}>
              {showAllCorrosion ? 'Show Less' : `Show all ${corrosionPatches.length} patches`}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* ND PATCHES */}
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base font-headline">
            Non-Inspected Areas ({nonInspectedPatches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-muted-foreground">
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-right p-2 font-medium">Area (pts)</th>
                  <th className="text-left p-2 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {visibleNonInspected.map(patch => {
                  const isSelected = selectedPatchId === `ND-${patch.id}`
                  return (
                    <tr
                      key={`ND-${patch.id}`}
                      className={cn(
                        'cursor-pointer border-b hover:bg-muted/50',
                        isSelected && 'bg-muted'
                      )}
                      onClick={() => selectPatch(`ND-${patch.id}`)}
                    >
                      <td className="p-2 font-medium">ND-{patch.id}</td>
                      <td className="p-2 text-right">
                        {patch.pointCount}
                      </td>
                      <td className="p-2 text-muted-foreground truncate max-w-[150px]">
                        X:{patch.coordinates.xMin}–{patch.coordinates.xMax},
                        Y:{patch.coordinates.yMin}–{patch.coordinates.yMax}
                      </td>
                    </tr>
                  )
                })}
                {nonInspectedPatches.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-3 text-center text-muted-foreground">
                      No non-inspected areas detected
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        {nonInspectedPatches.length > PREVIEW_COUNT && (
          <CardFooter className="p-2">
            <Button variant="link" className="w-full" onClick={() => setShowAllNonInspected(!showAllNonInspected)}>
              {showAllNonInspected ? 'Show Less' : `Show all ${nonInspectedPatches.length} areas`}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
