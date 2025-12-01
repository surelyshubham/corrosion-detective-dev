"use client"

import React from 'react'
import * as XLSX from 'xlsx';
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Download } from 'lucide-react'
import { downloadFile } from '@/lib/utils';

interface DummyDataGeneratorProps {
  isLoading: boolean;
}

export function DummyDataGenerator({ isLoading }: DummyDataGeneratorProps) {

  const generateData = (size: number, type: 'plate' | 'localized' | 'severe') => {
    const data: { x: number; y: number; thickness: number | string }[] = [];
    const nominal = 6.0;

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let thickness: number;
        if (type === 'plate') {
          thickness = nominal - Math.random() * 0.5; // Healthy
        } else if (type === 'localized') {
          const distance = Math.sqrt(Math.pow(i - size / 2, 2) + Math.pow(j - size / 2, 2));
          if (distance < size / 10) {
            thickness = nominal * (0.6 + Math.random() * 0.1); // 60-70%
          } else {
            thickness = nominal - Math.random() * 0.5;
          }
        } else { // severe
          if (i > size * 0.7 && j > size * 0.7) {
            thickness = nominal * (0.4 + Math.random() * 0.15); // 40-55%
          } else {
            thickness = nominal - Math.random();
          }
        }
        data.push({ x: i, y: j, thickness: parseFloat(thickness.toFixed(2)) });
      }
    }
    return data;
  };
  
  const handleGenerate = (size: number, type: 'plate' | 'localized' | 'severe') => {
    const metadata = [
      ['Project', 'Dummy Project'],
      ['Asset ID', `DUMMY-${type.toUpperCase()}-${size}x${size}`],
      ['Date', new Date().toLocaleDateString()],
    ];
    const data = generateData(size, type);

    const metadataSheet = XLSX.utils.aoa_to_sheet(metadata);
    const dataSheet = XLSX.utils.json_to_sheet(data);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Thickness Data');

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    downloadFile(blob, `dummy_${type}_${size}x${size}.xlsx`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">No File?</CardTitle>
        <CardDescription>Generate a dummy Excel file to test the application's features.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <h4 className="col-span-2 text-sm font-medium">Generate Healthy Plate</h4>
        <Button variant="secondary" onClick={() => handleGenerate(20, 'plate')} disabled={isLoading}>20x20</Button>
        <Button variant="secondary" onClick={() => handleGenerate(50, 'plate')} disabled={isLoading}>50x50</Button>
        
        <h4 className="col-span-2 text-sm font-medium mt-4">Generate Localized Corrosion</h4>
        <Button variant="secondary" onClick={() => handleGenerate(50, 'localized')} disabled={isLoading}>50x50</Button>
        <Button variant="secondary" onClick={() => handleGenerate(100, 'localized')} disabled={isLoading}>100x100</Button>

        <h4 className="col-span-2 text-sm font-medium mt-4">Generate Severe Corrosion</h4>
        <Button variant="secondary" onClick={() => handleGenerate(50, 'severe')} disabled={isLoading}>50x50</Button>
        <Button variant="secondary" onClick={() => handleGenerate(100, 'severe')} disabled={isLoading}>100x100</Button>

      </CardContent>
    </Card>
  );
}
