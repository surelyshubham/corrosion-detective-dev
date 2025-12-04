import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { downloadFile } from '@/lib/utils';
import type { MergedInspectionResult, ReportMetadata, Defect } from '@/lib/types';
import { format } from 'date-fns';

export interface ReportData {
  metadata: ReportMetadata;
  inspection: MergedInspectionResult;
  defects: Defect[];
  screenshots: {
    overview: string;
    defects: Record<string, string>;
  };
}

const THEME_PRIMARY = rgb(30 / 255, 144 / 255, 255 / 255); // dodgerblue
const THEME_TEXT = rgb(0.1, 0.1, 0.1);
const THEME_MUTED = rgb(0.5, 0.5, 0.5);

async function drawHeader(page: any, width: number, data: ReportData) {
    // Placeholder for logo
    page.drawText(data.metadata.companyName || 'Company Name', {
        x: 50,
        y: page.getHeight() - 60,
        size: 24,
        font: await page.doc.embedFont(StandardFonts.HelveticaBold),
        color: THEME_PRIMARY,
    });
    page.drawText('Inspection Report', {
        x: width - 200,
        y: page.getHeight() - 60,
        size: 18,
        font: await page.doc.embedFont(StandardFonts.Helvetica),
        color: THEME_TEXT,
    });
    page.drawLine({
        start: { x: 50, y: page.getHeight() - 80 },
        end: { x: width - 50, y: page.getHeight() - 80 },
        thickness: 1,
        color: THEME_PRIMARY,
    });
}

export async function generateInspectionReport(data: ReportData) {
  const pdfDoc = await PDFDocument.create();
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = PageSizes.A4;
  let page = pdfDoc.addPage();
  
  // --- PAGE 1: HEADER & SUMMARY ---
  await drawHeader(page, width, data);
  let y = height - 120;

  const summaryFields = [
    { label: 'Project:', value: data.metadata.projectName },
    { label: 'Equipment:', value: data.metadata.assetName },
    { label: 'Area:', value: data.metadata.area },
    { label: 'Scan Date:', value: data.metadata.scanDate ? format(data.metadata.scanDate, 'PP') : '' },
    { label: 'Report Date:', value: data.metadata.reportDate ? format(data.metadata.reportDate, 'PP') : '' },
    { label: 'Operator:', value: data.metadata.operatorName },
  ];

  const inspectionSummary = [
    { label: 'Nominal Thickness:', value: `${data.inspection.nominalThickness.toFixed(2)} mm` },
    { label: 'Minimum Thickness:', value: `${data.inspection.stats.minThickness.toFixed(2)} mm` },
    { label: 'Minimum Remaining:', value: `${data.inspection.stats.minPercentage.toFixed(1)} %` },
    { label: 'Overall Condition:', value: data.inspection.condition },
  ];

  // Draw summary tables
  for (const field of summaryFields) {
      if (field.value) {
          page.drawText(`${field.label}`, { x: 60, y, font: helveticaBoldFont, size: 11, color: THEME_TEXT });
          page.drawText(field.value, { x: 150, y, font: helveticaFont, size: 11, color: THEME_TEXT });
          y -= 20;
      }
  }
  y -= 20;

  for (const field of inspectionSummary) {
    if (field.value) {
        page.drawText(`${field.label}`, { x: 60, y, font: helveticaBoldFont, size: 11, color: THEME_TEXT });
        page.drawText(field.value, { x: 200, y, font: helveticaFont, size: 11, color: THEME_TEXT });
        y -= 20;
    }
  }

  // --- PAGE 2: 3D OVERVIEW ---
  page = pdfDoc.addPage();
  await drawHeader(page, width, data);
  y = height - 120;
  
  page.drawText('3D Inspection Overview', { x: 50, y, font: helveticaBoldFont, size: 16 });
  y -= 30;

  const overviewImage = await pdfDoc.embedPng(data.screenshots.overview);
  const overviewDims = overviewImage.scale(0.4);
  page.drawImage(overviewImage, {
      x: (width - overviewDims.width) / 2,
      y: y - overviewDims.height,
      width: overviewDims.width,
      height: overviewDims.height,
  });
  y -= (overviewDims.height + 20);

  const summaryParagraph = `The inspection produced ${data.inspection.stats.totalPoints.toLocaleString()} valid measurement points. ${data.defects.length} points were classified as a defect (<20% remaining wall).`;
  page.drawText(summaryParagraph, { x: 60, y, font: helveticaFont, size: 11, color: THEME_TEXT, maxWidth: width - 120, lineHeight: 15 });

  // --- PAGE 3: DEFECT TABLE ---
  if(data.defects.length > 0) {
    page = pdfDoc.addPage();
    await drawHeader(page, width, data);
    y = height - 120;
    
    page.drawText('Defect Summary (Wall < 20%)', { x: 50, y, font: helveticaBoldFont, size: 16 });
    y -= 30;

    const tableHeaders = ['X', 'Y', 'Raw (mm)', 'Eff (mm)', 'Loss (mm)', '% Rem.'];
    const colWidths = [40, 40, 80, 80, 80, 80];
    let x = 60;
    
    tableHeaders.forEach((header, i) => {
        page.drawText(header, { x, y, font: helveticaBoldFont, size: 10 });
        x += colWidths[i];
    });
    y -= 15;
    
    for (const defect of data.defects) {
        if (y < 80) { // Add new page if space runs out
            page = pdfDoc.addPage();
            await drawHeader(page, width, data);
            y = height - 120;
        }
        x = 60;
        const row = [
            defect.x,
            defect.y,
            defect.rawThickness?.toFixed(2) ?? 'N/A',
            defect.effectiveThickness?.toFixed(2) ?? 'N/A',
            defect.loss?.toFixed(2) ?? 'N/A',
            defect.percentage?.toFixed(1) ?? 'N/A',
        ];
        row.forEach((cell, i) => {
            page.drawText(String(cell), { x, y, font: helveticaFont, size: 10 });
            x += colWidths[i];
        });
        y -= 15;
    };
  }

  // --- PAGE 4+: INDIVIDUAL DEFECTS ---
   for (const defect of data.defects) {
     if (y < 400) {
        page = pdfDoc.addPage();
        await drawHeader(page, width, data);
        y = height - 120;
     }
     
     const key = `${defect.x},${defect.y}`;
     const screenshot = data.screenshots.defects[key];
     if (screenshot) {
        page.drawText(`Defect at X: ${defect.x}, Y: ${defect.y}`, { x: 50, y, font: helveticaBoldFont, size: 14 });
        y -= 30;

        const defectImage = await pdfDoc.embedPng(screenshot);
        const defectDims = defectImage.scale(0.3);
        page.drawImage(defectImage, {
            x: 60,
            y: y - defectDims.height,
            width: defectDims.width,
            height: defectDims.height,
        });

        const statsX = 60 + defectDims.width + 30;
        const defectStats = [
            { label: 'Raw Thickness:', value: `${defect.rawThickness?.toFixed(2)} mm` },
            { label: 'Effective Thickness:', value: `${defect.effectiveThickness?.toFixed(2)} mm` },
            { label: 'Wall Loss:', value: `${defect.loss?.toFixed(2)} mm` },
            { label: '% Remaining:', value: `${defect.percentage?.toFixed(1)} %` },
        ];
        
        let statsY = y - 40;
        defectStats.forEach(stat => {
            page.drawText(stat.label, { x: statsX, y: statsY, font: helveticaBoldFont, size: 11 });
            page.drawText(stat.value, { x: statsX + 120, y: statsY, font: helveticaFont, size: 11 });
            statsY -= 20;
        });

        y -= (defectDims.height + 40);
     }
   }


  // --- FINAL PAGE: REMARKS ---
  page = pdfDoc.addPage();
  await drawHeader(page, width, data);
  y = height - 120;

  page.drawText('Remarks', { x: 50, y, font: helveticaBoldFont, size: 16 });
  y -= 30;
  
  if (data.metadata.remarks) {
    page.drawText(data.metadata.remarks, { x: 60, y, font: helveticaFont, size: 11, maxWidth: width - 120, lineHeight: 15 });
  }

  y -= 200;
  page.drawText('Operator Signature:', { x: 60, y, font: helveticaBoldFont, size: 11 });
  page.drawLine({ start: { x: 200, y: y-2 }, end: { x: 400, y: y-2 }, thickness: 0.5, color: THEME_TEXT });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  downloadFile(blob, `Inspection_Report_${data.metadata.assetName || 'Asset'}.pdf`);
}
