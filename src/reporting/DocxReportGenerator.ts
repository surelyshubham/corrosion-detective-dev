
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { downloadFile } from '@/lib/utils';
import type { MergedInspectionResult, ReportMetadata, SegmentBox } from '@/lib/types';
import { format } from 'date-fns';

export interface ReportData {
  metadata: ReportMetadata & { defectThreshold: number };
  inspection: MergedInspectionResult;
  segments: SegmentBox[];
  images: {
    fullModel3D?: string;
    fullHeatmap2D?: string;
    segmentShots?: { segmentId: number; imageDataUrl: string }[];
  };
}

// Base64 encoded logo to avoid network requests
const logoBase64 = "data:image/png;base64,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";


export async function generateReportDocx(data: ReportData) {
  const { metadata, inspection, segments, images } = data;

  const doc = new Document({
    sections: [{
      headers: {
        default: new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({
                    children: [new ImageRun({ data: dataUriToBuffer(logoBase64), transformation: { width: 150, height: 38 } })],
                  })],
                  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "4287f5" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                }),
                new TableCell({
                  children: [new Paragraph({ text: "AI Corrosion Inspection Report", style: "header-right" })],
                  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "4287f5" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [3000, 6500],
        }),
      },
      children: [
        new Paragraph({ text: "Inspection Report", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: `Project: ${metadata.projectName}`, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: `Asset: ${metadata.assetName}`, heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: `Report Date: ${metadata.reportDate ? format(metadata.reportDate, 'PP') : 'N/A'}`, heading: HeadingLevel.HEADING_4 }),
        new Paragraph({ text: `Scan Date: ${metadata.scanDate ? format(metadata.scanDate, 'PP') : 'N/A'}`, heading: HeadingLevel.HEADING_4 }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: "Overall Inspection Statistics", heading: HeadingLevel.HEADING_2 }),
        createStatsTable(inspection, metadata.defectThreshold, segments.length),
        new Paragraph({ text: '' }),
        new Paragraph({ text: "Inspector Notes / Remarks", heading: HeadingLevel.HEADING_2 }),
        new Paragraph(metadata.remarks || "No remarks provided."),
        new Paragraph({ text: '', pageBreakBefore: true }),
      ],
    }],
    styles: {
        paragraphStyles: [{
            id: "header-right",
            name: "Header Right",
            basedOn: "Normal",
            next: "Normal",
            run: { size: 24, color: "444444" },
            paragraph: { alignment: AlignmentType.RIGHT, spacing: { before: 200 } }
        }]
    }
  });

  // Page 2: Full views
  if (images.fullHeatmap2D && images.fullModel3D) {
    const heatmapImage = dataUriToBuffer(images.fullHeatmap2D);
    const modelImage = dataUriToBuffer(images.fullModel3D);
    doc.addSection({
        children: [
            new Paragraph({ text: "Overall Asset Views", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "2D Heatmap (Unwrapped)", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ children: [new ImageRun({ data: heatmapImage, transformation: { width: 500, height: 300 } })], alignment: AlignmentType.CENTER }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: "3D Model View", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ children: [new ImageRun({ data: modelImage, transformation: { width: 500, height: 300 } })], alignment: AlignmentType.CENTER }),
            new Paragraph({ text: '', pageBreakBefore: true }),
        ]
    });
  }

  // Pages 3+: Segments
  for (const segment of segments) {
      const segmentShot = images.segmentShots?.find(s => s.segmentId === segment.id);
      const children = [
          new Paragraph({ text: `Defect Segment #${segment.id}`, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: '' }),
      ];
      if (segmentShot) {
          const image = dataUriToBuffer(segmentShot.imageDataUrl);
          children.push(new Paragraph({
              children: [new ImageRun({ data: image, transformation: { width: 400, height: 250 }})],
              alignment: AlignmentType.CENTER,
          }));
      }
       children.push(new Paragraph({ text: '' }));
       children.push(createSegmentTable(segment, inspection.nominalThickness));
       children.push(new Paragraph({ text: '', pageBreakBefore: true }));

      doc.addSection({ children });
  }


  const blob = await Packer.toBlob(doc);
  downloadFile(blob, `Report_${metadata.assetName.replace(/ /g, "_")}.docx`);
}


const createStatsTable = (inspection: MergedInspectionResult, defectThreshold: number, patchCount: number) => {
    const stats = inspection.stats;
    const rows = [
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Overall Condition:", bold: true })] })] }), new TableCell({ children: [new Paragraph(inspection.condition)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Nominal Thickness:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${inspection.nominalThickness.toFixed(2)} mm`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Min Thickness Found:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${stats.minThickness.toFixed(2)} mm (${stats.minPercentage.toFixed(1)}%)`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Avg Thickness:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${stats.avgThickness.toFixed(2)} mm`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Scanned Area:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${stats.scannedArea.toFixed(2)} m²`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Defect Patches (<${defectThreshold}%):`, bold: true })] })] }), new TableCell({ children: [new Paragraph(String(patchCount))] }) ] }),
    ];

    return new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3000, 6500],
    });
};

const createSegmentTable = (segment: SegmentBox, nominal: number) => {
    const rows = [
        new TableRow({ children: [new TableCell({children: [new Paragraph("Severity Tier")]}), new TableCell({children: [new Paragraph(segment.tier)]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Worst Thickness")]}), new TableCell({children: [new Paragraph(`${segment.worstThickness.toFixed(2)} mm`) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Average Thickness")]}), new TableCell({children: [new Paragraph(`${segment.avgThickness.toFixed(2)} mm`) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Point Count")]}), new TableCell({children: [new Paragraph(String(segment.pointCount)) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Bounding Box (X)")]}), new TableCell({children: [new Paragraph(`${segment.coordinates.xMin} - ${segment.coordinates.xMax}`) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Bounding Box (Y)")]}), new TableCell({children: [new Paragraph(`${segment.coordinates.yMin} - ${segment.coordinates.yMax}`) ]})]}),
    ];
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}


function dataUriToBuffer(dataUri: string): Buffer {
    if (!dataUri || !dataUri.includes(',')) {
        // Find the issue here. The user said the base64 string is incorrect. 
        // Maybe I should throw a more descriptive error.
        const errorPart = dataUri ? dataUri.substring(0, 50) + '...' : 'null or empty';
        throw new Error(`Invalid data URI. It does not contain a comma. Start of URI: ${errorPart}`);
    }
    const base64 = dataUri.split(',')[1];
    if (!base64) {
        throw new Error('Invalid data URI, base64 content is missing.');
    }
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
