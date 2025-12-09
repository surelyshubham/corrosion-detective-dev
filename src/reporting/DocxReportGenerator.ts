
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableCell, TableRow, WidthType, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { downloadFile } from '@/lib/utils';
import type { MergedInspectionResult, ReportMetadata } from '@/lib/types';
import { format } from 'date-fns';
import type { IdentifiedPatch } from '@/reporting/patch-detector';


export interface ReportData {
  metadata: ReportMetadata & { defectThreshold: number };
  inspection: MergedInspectionResult;
  segments: IdentifiedPatch[];
  images: {
    fullModel3D?: string;
    fullHeatmap2D?: string;
    segmentShots?: { segmentId: number; imageDataUrl: string }[];
  };
}

function dataUriToBuffer(dataUri: string): ArrayBuffer {
    if (!dataUri || !dataUri.includes(',')) {
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
                    text: "Sigma NDT",
                    style: "header-left"
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
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Inspection Report",
              bold: true,
              size: 48,
            }),
          ],
        }),
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
        paragraphStyles: [
          {
            id: "header-left",
            name: "Header Left",
            basedOn: "Normal",
            next: "Normal",
            run: { size: 24, bold: true, color: "4287f5" },
            paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 200 } }
          },
          {
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

const createSegmentTable = (segment: IdentifiedPatch, nominal: number) => {
    const rows = [
        new TableRow({ children: [new TableCell({children: [new Paragraph("Severity Tier")]}), new TableCell({children: [new Paragraph(segment.severity)]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Worst Thickness")]}), new TableCell({children: [new Paragraph(`${segment.minThickness.toFixed(2)} mm`) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Average Thickness")]}), new TableCell({children: [new Paragraph(`${segment.avgThickness.toFixed(2)} mm`) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Point Count")]}), new TableCell({children: [new Paragraph(String(segment.boundingBox)) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Bounding Box (X)")]}), new TableCell({children: [new Paragraph(`${segment.coordinates.xMin} - ${segment.coordinates.xMax}`) ]})]}),
        new TableRow({ children: [new TableCell({children: [new Paragraph("Bounding Box (Y)")]}), new TableCell({children: [new Paragraph(`${segment.coordinates.yMin} - ${segment.coordinates.yMax}`) ]})]}),
    ];
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}
