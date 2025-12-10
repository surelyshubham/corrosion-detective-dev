import { NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { FinalReportPayload, GlobalStatsForDocx, ReportPatchSegment } from '@/reporting/DocxReportGenerator';

async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function createImageParagraph(dataUrl?: string): Promise<Paragraph> {
    if (!dataUrl) {
        return new Paragraph({ text: "[Image unavailable]", italics: true, alignment: AlignmentType.CENTER });
    }
    try {
        const buffer = await fetchImageBuffer(dataUrl);
        return new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new ImageRun({
                    data: buffer,
                    transformation: { width: 450, height: 250 },
                }),
            ],
        });
    } catch (error) {
        console.error("Failed to create image paragraph:", error);
        return new Paragraph({ text: "[Failed to load image]", italics: true, alignment: AlignmentType.CENTER });
    }
}


function createStatsTable(global: GlobalStatsForDocx): Table {
  const rows: TableRow[] = [];
  const pushRow = (label: string, value: string) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ text: value })] }),
        ],
      }),
    );
  };

  pushRow('Asset', global.assetName || 'N/A');
  if (global.projectName) pushRow('Project', global.projectName);
  if (global.inspectionDate) pushRow('Inspection Date', global.inspectionDate);
  if (global.nominalThickness !== undefined) pushRow('Nominal Thickness', `${Number(global.nominalThickness).toFixed(2)} mm`);
  pushRow('Min Thickness', `${Number(global.minThickness).toFixed(2)} mm`);
  pushRow('Max Thickness', `${Number(global.maxThickness).toFixed(2)} mm`);
  pushRow('Avg Thickness', `${Number(global.avgThickness).toFixed(2)} mm`);
  if (global.corrodedAreaBelow80 !== undefined) pushRow('Corroded Area (<80%)', `${Number(global.corrodedAreaBelow80).toFixed(2)} %`);
  if (global.corrodedAreaBelow70 !== undefined) pushRow('Corroded Area (<70%)', `${Number(global.corrodedAreaBelow70).toFixed(2)} %`);
  if (global.corrodedAreaBelow60 !== undefined) pushRow('Corroded Area (<60%)', `${Number(global.corrodedAreaBelow60).toFixed(2)} %`);

  return new Table({ width: { size: 100, type: 'pct' }, rows });
}

function createPatchHeader(patch: ReportPatchSegment): Paragraph {
  return new Paragraph({
    text: `Patch #${patch.id}`,
    heading: HeadingLevel.HEADING_2,
    spacing: { after: 200, before: 400 },
    pageBreakBefore: true,
  });
}

function createPatchStatsTable(patch: ReportPatchSegment, nominalThickness: number): Table {
    const rows: TableRow[] = [];
    const pushRow = (label: string, value: string) => {
        rows.push(new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
            new TableCell({ children: [new Paragraph({ text: value })] }),
        ]}));
    };

    pushRow('Coordinates (X)', `${patch.coordinates.xMin.toFixed(0)} to ${patch.coordinates.xMax.toFixed(0)}`);
    pushRow('Coordinates (Y)', `${patch.coordinates.yMin.toFixed(0)} to ${patch.coordinates.yMax.toFixed(0)}`);
    pushRow('Min Thickness', `${patch.worstThickness.toFixed(2)} mm`);
    pushRow('Avg Thickness', `${patch.avgThickness.toFixed(2)} mm`);
    const minPercentage = nominalThickness > 0 ? (patch.worstThickness / nominalThickness) * 100 : 0;
    if(!isNaN(minPercentage)) {
        pushRow('Minimum Remaining Wall', `${minPercentage.toFixed(1)} %`);
    }
    pushRow('Measured Points', `${patch.pointCount}`);

    return new Table({ width: { size: 100, type: 'pct' }, rows });
}


export async function POST(request: Request) {
  try {
    const payload: FinalReportPayload = await request.json();
    const { global, segments, remarks } = payload;
    
    const docSections: any[] = [];

    // --- Global Summary Page ---
    const globalChildren: (Paragraph | Table)[] = [
        new Paragraph({ text: 'Corrosion Inspection Report', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        new Paragraph({ text: global.assetName ?? 'Unknown Asset', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ text: 'Global Statistics', heading: HeadingLevel.HEADING_2 }),
        createStatsTable(global),
    ];
    if (remarks) {
        globalChildren.push(new Paragraph({ text: 'Inspector Remarks', heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }));
        globalChildren.push(new Paragraph({ text: remarks }));
    }
    docSections.push({ children: globalChildren });

    // --- Patch Pages ---
    for (const patch of segments) {
        const patchChildren: (Paragraph | Table)[] = [
            createPatchHeader(patch),
            createPatchStatsTable(patch, global.nominalThickness || 0),
            new Paragraph({ text: "Isometric View", alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 } }),
            await createImageParagraph(patch.isoViewUrl),
            new Paragraph({ text: "Top View", alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100, pageBreakBefore: true } }),
            await createImageParagraph(patch.topViewUrl),
            new Paragraph({ text: "Side View", alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100, pageBreakBefore: true } }),
            await createImageParagraph(patch.sideViewUrl),
            new Paragraph({ text: "2D Heatmap", alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100, pageBreakBefore: true } }),
            await createImageParagraph(patch.heatmapUrl),
        ];
        if (patch.aiObservation) {
            patchChildren.push(new Paragraph({ text: 'AI Observation', heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
            patchChildren.push(new Paragraph({ text: patch.aiObservation }));
        }
        docSections.push({ children: patchChildren });
    }
    
    const doc = new Document({ sections: docSections });
    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Report_${global.assetName || 'Asset'}.docx"`,
      },
    });

  } catch (error: any) {
    console.error('Error generating DOCX report:', error);
    return new NextResponse(`Error generating report: ${error.message}`, { status: 500 });
  }
}
