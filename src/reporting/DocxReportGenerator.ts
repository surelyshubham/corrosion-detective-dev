import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  ImageRun,
  Header,
  VerticalAlign,
  BorderStyle,
} from "docx";
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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export async function generateReportDocx(data: ReportData) {
  const { metadata, inspection, segments, images } = data;
  
  if (!inspection) {
    console.error("generateReportDocx called with no inspection data.");
    return;
  }
  
  const stats = inspection.stats;
  const patchImages = images.segmentShots || [];


  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Corrosion Inspection Report",
            heading: "Title",
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Client Name")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.companyName || "-"))] }),
                  new TableCell({ children: [new Paragraph("Scan Date")] }),
                  new TableCell({ children: [new Paragraph(metadata.scanDate ? format(metadata.scanDate, 'PP') : "-")] }),
                ],
              }),
               new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Project Name")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.projectName || "-"))] }),
                  new TableCell({ children: [new Paragraph("Report Date")] }),
                  new TableCell({ children: [new Paragraph(metadata.reportDate ? format(metadata.reportDate, 'PP') : "-")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Asset / Equipment")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.assetName || "-"))] }),
                   new TableCell({ children: [new Paragraph("Operator")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.operatorName || "-"))] }),
                ],
              }),
            ],
           }),
          
          new Paragraph({
            text: "Overall Asset Views",
            heading: "Title",
            spacing: { before: 400, after: 200 },
          }),
          
          new Paragraph({
            heading: "Heading2",
            children: [new TextRun("3D Surface View")],
          }),

          ...(images.fullModel3D
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: dataUriToBuffer(images.fullModel3D),
                      transformation: { width: 500, height: 250 },
                    }),
                  ],
                }),
              ]
            : []),

          new Paragraph({
            heading: "Heading2",
            children: [new TextRun("2D Heatmap View")],
            spacing: { before: 200 },
          }),

          ...(images.fullHeatmap2D
            ? [
                new Paragraph({
                   alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: dataUriToBuffer(images.fullHeatmap2D),
                      transformation: { width: 500, height: 250 },
                    }),
                  ],
                }),
              ]
            : []),
            
            ...createPatchTables(patchImages),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Report_${metadata.assetName?.replace(/ /g, "_") || 'Inspection'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}


function createPatchTables(patchImages: { segmentId: number; imageDataUrl: string }[]) {
  if (patchImages.length === 0) return [];
  
  const chunks = chunkArray(patchImages, 9);
  const result: (Paragraph | Table)[] = [
      new Paragraph({ text: "", pageBreakBefore: true }),
      new Paragraph({
        text: "Corrosion Patch Segments",
        heading: "Title",
        spacing: { before: 400, after: 200 },
      })
  ];

  for (const chunk of chunks) {
    const rows: TableRow[] = [];
    for (let i = 0; i < 3; i++) {
      const cells: TableCell[] = [];
      for (let j = 0; j < 3; j++) {
        const imgData = chunk[i * 3 + j];
        if (imgData) {
          try {
            cells.push(
              new TableCell({
                children: [
                  new Paragraph({
                    text: `Segment #${imgData.segmentId}`,
                    alignment: AlignmentType.CENTER,
                    style: "IntenseQuote" 
                  }),
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: dataUriToBuffer(imgData.imageDataUrl),
                        transformation: { width: 180, height: 120 },
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 33, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
              })
            );
          } catch(e) {
            console.error("Error adding image to DOCX", e)
            cells.push(new TableCell({ children: [new Paragraph("Image error")] }));
          }
        } else {
          cells.push(new TableCell({ children: [new Paragraph("")], borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          }}));
        }
      }
      rows.push(new TableRow({ children: cells }));
    }
    result.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );

    result.push(new Paragraph({ text: "", pageBreakBefore: true }));
  }
  
  // Remove last page break
  if(result.length > 2) result.pop();

  return result;
}
