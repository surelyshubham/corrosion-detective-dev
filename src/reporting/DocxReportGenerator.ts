
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { downloadFile } from '@/lib/utils';
import type { MergedInspectionResult, ReportMetadata, SegmentBox } from '@/lib/types';
import { format } from 'date-fns';

export interface ReportData {
  metadata: ReportMetadata;
  inspection: MergedInspectionResult;
  segments: SegmentBox[];
  images: {
    fullModel3D?: string;
    fullHeatmap2D?: string;
    segmentShots?: { segmentId: number; imageDataUrl: string }[];
  };
}

// Base64 encoded logo to avoid network requests
const logoBase64 = "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";

export async function generateReportDocx(data: ReportData) {
  const { metadata, inspection, segments, images } = data;

  const logoBuffer = dataUriToBuffer(`data:image/png;base64,${logoBase64}`);

  const doc = new Document({
    sections: [{
      headers: {
        default: new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({
                    children: [new ImageRun({ data: logoBuffer, transformation: { width: 150, height: 38 } })],
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
        createStatsTable(inspection),
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


const createStatsTable = (inspection: MergedInspectionResult) => {
    const stats = inspection.stats;
    const rows = [
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Overall Condition:", bold: true })] })] }), new TableCell({ children: [new Paragraph(inspection.condition)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Nominal Thickness:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${inspection.nominalThickness.toFixed(2)} mm`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Min Thickness Found:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${stats.minThickness.toFixed(2)} mm (${stats.minPercentage.toFixed(1)}%)`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Avg Thickness:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${stats.avgThickness.toFixed(2)} mm`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Scanned Area:", bold: true })] })] }), new TableCell({ children: [new Paragraph(`${stats.scannedArea.toFixed(2)} m²`)] }) ] }),
        new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Defect Patches Found:", bold: true })] })] }), new TableCell({ children: [new Paragraph(String(inspection.segments.length))] }) ] }),
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


function dataUriToBuffer(dataUri: string) {
    const base64 = dataUri.split(',')[1];
    if (!base64) {
        throw new Error('Invalid data URI');
    }
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

    