
"use client";

import React from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { DataVault } from '@/store/data-vault';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const GradientBar = ({ min, max }: { min: number, max: number }) => {
    return (
        <div className="h-4 w-full rounded-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500">
            <div className="flex justify-between text-xs text-muted-foreground px-1 relative -top-4">
                <span>{min.toFixed(1)}</span>
                <span>{max.toFixed(1)}</span>
            </div>
        </div>
    );
}

export const ColorLegend = () => {
    const stats = DataVault.stats;
    const nominalThickness = stats?.nominalThickness;

    if (!stats || !nominalThickness) {
        return null;
    }

    return (
        <Card className="bg-card/90">
            <CardHeader className="p-4">
                <CardTitle className="text-base font-headline">
                    Legend (Normalized)
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <GradientBar min={stats.minThickness} max={stats.maxThickness} />
                 <p className="text-xs text-muted-foreground mt-2 text-center">Thickness values in mm</p>
            </CardContent>
        </Card>
    );
};

    