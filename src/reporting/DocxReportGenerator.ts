// src/reporting/DocxReportGenerator.ts

import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import type { FinalReportPayload, ReportPatchSegment } from '@/lib/types';


// Helper: convert data URI to Buffer-safe Uint8Array
function dataUriToUint8(dataUri?: string): Uint8Array | null {
  if (!dataUri) return null;
  try {
    const commaIndex = dataUri.indexOf(',');
    if (commaIndex === -1) {
      console.warn('dataUriToUint8: no comma in data URI');
      return null;
    }
    const base64 = dataUri.substring(commaIndex + 1).trim();
    if (!base64) {
      console.warn('dataUriToUint8: empty base64 section');
      return null;
    }
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.error('dataUriToUint8 failed', err);
    return null;
  }
}

async function createImageParagraph(dataUrl?: string): Promise<Paragraph> {
    if (!dataUrl) {
        return new Paragraph({ text: "[image unavailable]", italics: true });
    }
    const imageBuffer = dataUriToUint8(dataUrl);
    if (!imageBuffer) {
        return new Paragraph({ text: "[image processing failed]", italics: true });
    }
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new ImageRun({
                data: imageBuffer,
                transformation: { width: 550, height: 350 },
            }),
        ],
    });
}


function createStatsTable(global: FinalReportPayload['global']): Table {
  const rows: TableRow[] = [];

  const pushRow = (label: string, value: string) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: label, bold: true })],
              }),
            ],
          }),
          new TableCell({
            children: [new Paragraph({ text: value })],
          }),
        ],
      }),
    );
  };

  pushRow('Asset', global.assetName || 'N/A');
  if (global.projectName)
    pushRow('Project', global.projectName);
  if (global.inspectionDate)
    pushRow('Inspection Date', global.inspectionDate);
  if (global.nominalThickness !== undefined)
    pushRow(
      'Nominal Thickness',
      `${global.nominalThickness.toFixed(2)} mm`,
    );

  pushRow('Min Thickness', `${global.minThickness.toFixed(2)} mm`);
  pushRow('Max Thickness', `${global.maxThickness.toFixed(2)} mm`);
  pushRow('Avg Thickness', `${global.avgThickness.toFixed(2)} mm`);

  if (global.corrodedAreaBelow80 !== undefined)
    pushRow(
      'Corroded Area (<80%)',
      `${global.corrodedAreaBelow80.toFixed(2)} %`,
    );
  if (global.corrodedAreaBelow70 !== undefined)
    pushRow(
      'Corroded Area (<70%)',
      `${global.corrodedAreaBelow70.toFixed(2)} %`,
    );
  if (global.corrodedAreaBelow60 !== undefined)
    pushRow(
      'Corroded Area (<60%)',
      `${global.corrodedAreaBelow60.toFixed(2)} %`,
    );

  return new Table({
    width: {
      size: 100,
      type: 'pct',
    },
    rows,
  });
}

function createPatchHeader(patch: ReportPatchSegment): Paragraph {
  const label = `Patch #${patch.id}`;
  return new Paragraph({
    text: label,
    heading: HeadingLevel.HEADING_2,
    spacing: { after: 200, before: 400 },
    pageBreakBefore: true,
  });
}

function createPatchStatsTable(patch: ReportPatchSegment): Table {
    const rows: TableRow[] = [];
    const {xMin, xMax, yMin, yMax} = patch.coordinates;

    const pushRow = (label: string, value: string) => {
        rows.push(
        new TableRow({
            children: [
            new TableCell({
                children: [
                new Paragraph({
                    children: [new TextRun({ text: label, bold: true })],
                }),
                ],
            }),
            new TableCell({
                children: [new Paragraph({ text: value })],
            }),
            ],
        }),
        );
    };

    pushRow(
        'Coordinates (X)',
        `${xMin.toFixed(0)} to ${xMax.toFixed(0)}`,
    );
    pushRow(
        'Coordinates (Y)',
        `${yMin.toFixed(0)} to ${yMax.toFixed(0)}`,
    );
    
    pushRow('Min Thickness', `${patch.worstThickness.toFixed(2)} mm`);
    pushRow('Avg Thickness', `${patch.avgThickness.toFixed(2)} mm`);
    
    const minPercentage = (patch.worstThickness / (patch.avgThickness > 0 ? patch.avgThickness : 1)) * 100;
    if(!isNaN(minPercentage)) {
        pushRow(
            'Minimum Remaining Wall',
            `${minPercentage.toFixed(1)} %`,
        );
    }
    pushRow('Measured Points', `${patch.pointCount}`);

    return new Table({
        width: { size: 100, type: 'pct' },
        rows,
    });
}


export async function generateReportDocx(
  payload: FinalReportPayload,
): Promise<Blob> {
  const { global, segments, remarks } = payload;

  const sections: any[] = [];

  // Build global page content
  const globalChildren: (Paragraph | Table)[] = [];

  globalChildren.push(
    new Paragraph({
      text: 'Corrosion Inspection Report',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  );

  globalChildren.push(new Paragraph({ text: '' }));

  globalChildren.push(new Paragraph({
    text: global.assetName ?? 'Unknown Asset',
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 }
  }));

  globalChildren.push(new Paragraph({ text: 'Global Statistics', heading: HeadingLevel.HEADING_1 }));
  (globalChildren as any).push(createStatsTable(global));

  if (remarks) {
    globalChildren.push(new Paragraph({ text: '', spacing: { before: 200 } }));
    globalChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Inspector Remarks' }));
    globalChildren.push(new Paragraph({ text: remarks }));
  }

  sections.push({
    children: globalChildren
  });

  // Create PAGE PER PATCH with async yielding to avoid UI freeze
  for (let i = 0; i < segments.length; i++) {

      // 👇 IMPORTANT: prevent main thread freeze
      await new Promise(resolve => setTimeout(resolve, 0));

      const patch = segments[i];

      const patchChildren : (Paragraph|Table)[] = [];

      patchChildren.push(createPatchHeader(patch));
      patchChildren.push(createPatchStatsTable(patch));
      patchChildren.push(new Paragraph({ text: "" })); // Spacer

      patchChildren.push(new Paragraph({ text: "Isometric View", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }));
      patchChildren.push(await createImageParagraph(patch.isoViewDataUrl));

      patchChildren.push(new Paragraph({ text: "Top View", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }));
      patchChildren.push(await createImageParagraph(patch.topViewDataUrl));
      
      patchChildren.push(new Paragraph({ text: "Side View", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }));
      patchChildren.push(await createImageParagraph(patch.sideViewDataUrl));
      
      patchChildren.push(new Paragraph({ text: "2D Heatmap", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }));
      patchChildren.push(await createImageParagraph(patch.heatmapDataUrl));

      if (patch.aiObservation) {
        patchChildren.push(new Paragraph({ text: 'AI Observation', heading: HeadingLevel.HEADING_3, spacing: {before: 200, after: 100 } }));
        patchChildren.push(new Paragraph({ text: patch.aiObservation }));
      }

      sections.push({
          children: patchChildren
      });

      // (Optional) show progress in console
      console.log(`DOCX page generated for patch ${i + 1} of ${segments.length}`);
  }


  // FINAL FIX — use docx official structure
  const doc = new Document({
    sections: sections
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}
