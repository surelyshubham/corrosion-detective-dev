
import { PDFDocument, rgb, StandardFonts, PageSizes, PDFFont } from 'pdf-lib';
import { downloadFile } from '@/lib/utils';
import type { MergedInspectionResult, ReportMetadata } from '@/lib/types';
import { format } from 'date-fns';
import { IdentifiedPatch } from './patch-detector';

export interface AIReportData {
  metadata: ReportMetadata;
  inspection: MergedInspectionResult;
  patches: IdentifiedPatch[];
  screenshots: {
    global: { iso: string, top: string, side: string } | null;
    patches: Record<string, { iso: string, top: string }>;
  };
  summaries: {
    overall: string;
    patches: Record<string, string>;
  };
}

const THEME_PRIMARY = rgb(0.12, 0.56, 1.0); // dodgerblue
const THEME_TEXT = rgb(0.1, 0.1, 0.1);
const THEME_MUTED = rgb(0.4, 0.4, 0.4);
const THEME_BG = rgb(0.95, 0.96, 0.98);

let helveticaFont: PDFFont;
let helveticaBoldFont: PDFFont;

// Helper function for text wrapping
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const words = text.replace(/\\n/g, ' \\n ').split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        if (word === '\\n') {
            lines.push(currentLine);
            currentLine = '';
            continue;
        }
        const testLine = currentLine === '' ? word : `${currentLine} ${word}`;
        const width = font.widthOfTextAtSize(testLine, fontSize);

        if (width < maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}


async function drawHeader(page: any, data: AIReportData) {
    const { width } = page.getSize();
    page.drawText(data.metadata.companyName || 'N/A', {
        x: 50,
        y: page.getHeight() - 60,
        size: 20,
        font: helveticaBoldFont,
        color: THEME_PRIMARY,
    });
    page.drawText('AI Inspection Report', {
        x: width - 220,
        y: page.getHeight() - 60,
        size: 16,
        font: helveticaFont,
        color: THEME_TEXT,
    });
    page.drawLine({
        start: { x: 50, y: page.getHeight() - 75 },
        end: { x: width - 50, y: page.getHeight() - 75 },
        thickness: 1,
        color: THEME_PRIMARY,
    });
}

function drawSectionHeader(page: any, y: number, title: string) {
    page.drawText(title, { x: 50, y, font: helveticaBoldFont, size: 14, color: THEME_TEXT });
    page.drawLine({ start: { x: 50, y: y - 5 }, end: { x: page.getWidth() - 50, y: y - 5 }, thickness: 0.5, color: THEME_MUTED });
    return y - 25;
}

function drawField(page: any, y: number, label: string, value: string) {
    page.drawText(label, { x: 60, y, font: helveticaBoldFont, size: 10, color: THEME_MUTED });
    page.drawText(value, { x: 200, y, font: helveticaFont, size: 10, color: THEME_TEXT });
    return y - 20;
}


export async function generateAIReport(data: AIReportData) {
  const pdfDoc = await PDFDocument.create();
  helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // --- PAGE 1: HEADER & SUMMARY ---
  let page = pdfDoc.addPage(PageSizes.A4);
  let { width, height } = page.getSize();
  await drawHeader(page, data);
  let y = height - 100;

  y = drawSectionHeader(page, y, 'Inspection Summary');

  y = drawField(page, y, 'Project:', data.metadata.projectName || 'N/A');
  y = drawField(page, y, 'Equipment:', data.metadata.assetName || 'N/A');
  y = drawField(page, y, 'Area:', data.metadata.area || 'N/A');
  y = drawField(page, y, 'Scan Date:', data.metadata.scanDate ? format(data.metadata.scanDate, 'PP') : 'N/A');
  y = drawField(page, y, 'Report Date:', data.metadata.reportDate ? format(data.metadata.reportDate, 'PP') : 'N/A');
  y = drawField(page, y, 'Operator:', data.metadata.operatorName || 'N/A');
  y -= 10;
  
  y = drawField(page, y, 'Nominal Thickness:', `${data.inspection.nominalThickness.toFixed(2)} mm`);
  y = drawField(page, y, 'Defect Threshold:', `${data.metadata.defectThreshold}%`);
  y = drawField(page, y, 'Minimum Thickness:', `${data.inspection.stats.minThickness.toFixed(2)} mm (${data.inspection.stats.minPercentage.toFixed(1)}%)`);
  y = drawField(page, y, `Defect Patches (<${data.metadata.defectThreshold}%):`, `${data.patches.length}`);
  y -= 10;
  
  // AI Summary
  const summaryLines = wrapText(data.summaries.overall, helveticaFont, 11, width - 100);
  for (const line of summaryLines) {
      page.drawText(line, { x: 50, y, font: helveticaFont, size: 11, color: THEME_TEXT });
      y -= 15;
  }
  y -= 15;

  // --- GLOBAL SCREENSHOTS (on separate pages) ---
  if (data.screenshots.global) {
    const { iso, top, side } = data.screenshots.global;
    const views = [
        { title: 'Asset Isometric View', imgData: iso },
        { title: 'Asset Top View (Plan)', imgData: top },
        { title: 'Asset Side View (Elevation)', imgData: side },
    ];
    
    for (const view of views) {
        if (view.imgData) {
            page = pdfDoc.addPage(PageSizes.A4);
            ({ width, height } = page.getSize());
            await drawHeader(page, data);
            y = height - 100;
            y = drawSectionHeader(page, y, view.title);
            
            const image = await pdfDoc.embedPng(view.imgData);
            const dims = image.scaleToFit(width - 100, height - 200);
            
            page.drawImage(image, {
                x: (width - dims.width) / 2,
                y: y - dims.height,
                width: dims.width,
                height: dims.height,
            });
        }
    }
  }


  // --- DEFECT TABLE PAGE ---
  if(data.patches.length > 0) {
    page = pdfDoc.addPage(PageSizes.A4);
    ({ width, height } = page.getSize());
    await drawHeader(page, data);
    y = height - 100;
    
    y = drawSectionHeader(page, y, `Defect Patch Summary (<${data.metadata.defectThreshold}% Remaining Wall)`);

    const tableHeaders = ['Patch ID', 'Min Thk (mm)', 'Avg Thk (mm)', '% Rem.', 'Loss', 'X Range', 'Y Range', 'Area'];
    const colWidths = [50, 70, 70, 50, 50, 80, 80, 60];
    let currentX = 50;
    
    page.drawRectangle({
        x: 45,
        y: y - 5,
        width: colWidths.reduce((a,b) => a + b, 5),
        height: 20,
        color: THEME_PRIMARY,
        opacity: 0.1,
    });
    
    tableHeaders.forEach((header, i) => {
        page.drawText(header, { x: currentX, y, font: helveticaBoldFont, size: 9, color: THEME_TEXT });
        currentX += colWidths[i];
    });
    y -= 20;
    
    for (const patch of data.patches) {
        if (y < 80) { // Add new page
            page = pdfDoc.addPage(PageSizes.A4);
            ({ width, height } = page.getSize());
            await drawHeader(page, data);
            y = height - 100;
        }
        currentX = 50;
        const loss = data.inspection.nominalThickness - patch.minThickness;
        const percentage = (patch.minThickness / data.inspection.nominalThickness) * 100;

        const row = [
            patch.id,
            patch.minThickness.toFixed(2),
            patch.avgThickness.toFixed(2),
            percentage.toFixed(1),
            loss.toFixed(2),
            `${patch.coordinates.xMin}-${patch.coordinates.xMax}`,
            `${patch.coordinates.yMin}-${patch.coordinates.yMax}`,
            patch.boundingBox.toFixed(0),
        ];
        row.forEach((cell, i) => {
            page.drawText(String(cell), { x: currentX, y, font: helveticaFont, size: 9 });
            currentX += colWidths[i];
        });
        y -= 15;
    };
  }

  // --- INDIVIDUAL PATCH PAGES ---
   for (const patch of data.patches) {
     page = pdfDoc.addPage(PageSizes.A4);
     ({ width, height } = page.getSize());
     await drawHeader(page, data);
     y = height - 100;

     y = drawSectionHeader(page, y, `Defect Patch #${patch.id} - ${patch.severity}`);
     
     const screenshotSet = data.screenshots.patches[patch.id];
     if (screenshotSet) {
        const topImage = await pdfDoc.embedPng(screenshotSet.top);
        const isoImage = await pdfDoc.embedPng(screenshotSet.iso);
        const imgWidth = (width - 150) / 2;
        const imgHeight = 200;

        const topDims = topImage.scaleToFit(imgWidth, imgHeight);
        const isoDims = isoImage.scaleToFit(imgWidth, imgHeight);

        page.drawImage(topImage, {
            x: 50,
            y: y - imgHeight,
            width: topDims.width,
            height: topDims.height,
        });
        page.drawText('Plan View (Location)', {x: 50, y: y - imgHeight - 15, size: 9, font: helveticaBoldFont});

        page.drawImage(isoImage, {
            x: width - 50 - isoDims.width,
            y: y - imgHeight,
            width: isoDims.width,
            height: isoDims.height,
        });
         page.drawText('Depth View (Severity)', {x: width - 50 - isoDims.width, y: y - imgHeight - 15, size: 9, font: helveticaBoldFont});


        y -= (imgHeight + 40);
     }
     
     // Stats table for patch
    let statsY = y;
    statsY = drawField(page, statsY, 'Min Thickness:', `${patch.minThickness.toFixed(2)} mm`);
    statsY = drawField(page, statsY, 'Avg Thickness:', `${patch.avgThickness.toFixed(2)} mm`);
    statsY = drawField(page, statsY, 'Point Count:', `${patch.pointCount}`);
    statsY = drawField(page, statsY, 'Bounding Box:', `${patch.boundingBox.toFixed(0)} mm²`);
    statsY = drawField(page, statsY, 'X-Coordinates:', `${patch.coordinates.xMin} - ${patch.coordinates.xMax}`);
    statsY = drawField(page, statsY, 'Y-Coordinates:', `${patch.coordinates.yMin} - ${patch.coordinates.yMax}`);
    y = statsY - 20;

    
     y = drawSectionHeader(page, y, 'AI Analysis & Recommendation');
     const summary = data.summaries.patches[patch.id];
     if (summary) {
        const summaryLines = wrapText(summary, helveticaFont, 11, width - 100);
        for (const line of summaryLines) {
            page.drawText(line, { x: 50, y, font: helveticaFont, size: 11, color: THEME_TEXT });
            y -= 15;
        }
     }
     y -= 20;

     y = drawSectionHeader(page, y, 'Notes');
     page.drawRectangle({
         x: 50,
         y: y - 100,
         width: width - 100,
         height: 100,
         borderColor: THEME_MUTED,
         borderWidth: 0.5,
     });
   }


  // --- FINAL PAGE: REMARKS & SIGNATURE ---
  page = pdfDoc.addPage(PageSizes.A4);
  ({ width, height } = page.getSize());
  await drawHeader(page, data);
  y = height - 100;

  y = drawSectionHeader(page, y, 'General Remarks');
  
  if (data.metadata.remarks && data.metadata.remarks !== 'N/A') {
    const remarkLines = wrapText(data.metadata.remarks, helveticaFont, 11, width - 100);
    for(const line of remarkLines) {
        page.drawText(line, { x: 50, y, font: helveticaFont, size: 11 });
        y -= 15;
    }
  } else {
    page.drawText('No remarks provided.', { x: 50, y, font: helveticaFont, size: 11, color: THEME_MUTED });
  }
  
  y = 150;
  page.drawText('Operator Signature:', { x: 50, y, font: helveticaBoldFont, size: 11 });
  page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 380, y: y - 2 }, thickness: 0.5, color: THEME_TEXT });
  page.drawText(data.metadata.operatorName || 'N/A', { x: 180, y: y-15, font: helveticaFont, size: 10, color: THEME_MUTED });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  downloadFile(blob, `AI_Report_${data.metadata.assetName?.replace(/ /g,"_") || 'Asset'}.pdf`);
}
