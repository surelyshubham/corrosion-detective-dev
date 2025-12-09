
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

export interface GlobalStatsForDocx {
  assetName: string;
  projectName?: string;
  jobNumber?: string;
  inspectionDate?: string;
  nominalThickness?: number;
  minThickness: number;
  maxThickness: number;
  avgThickness: number;
  corrodedAreaBelow80?: number;
  corrodedAreaBelow70?: number;
  corrodedAreaBelow60?: number;
}

export interface ReportPatchSegment {
  id: number;
  label?: string;

  coordinates: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  pointCount: number;
  worstThickness: number;
  avgThickness: number;
  tier: string;

  isoViewDataUrl?: string;
  topViewDataUrl?: string;
  sideViewDataUrl?: string;
  heatmapDataUrl?: string;

  aiObservation?: string;
}

export interface FinalReportPayload {
  global: GlobalStatsForDocx;
  segments: ReportPatchSegment[];
  // Optional: any free-form remarks filled in the UI
  remarks?: string;
}

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

function createStatsTable(global: GlobalStatsForDocx): Table {
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
  if (global.jobNumber)
    pushRow('Job Number', global.jobNumber);
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
  const label = patch.label ?? `Patch #${patch.id}`;
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
    `${xMin.toFixed(0)} to ${xMax.toFixed(0)} mm`,
  );
  pushRow(
    'Coordinates (Y)',
    `${yMin.toFixed(0)} to ${yMax.toFixed(0)} mm`,
  );
  pushRow(
    'Patch Size',
    `${(xMax - xMin).toFixed(0)} mm x ${(yMax - yMin).toFixed(0)} mm`,
  );
  pushRow('Min Thickness', `${patch.worstThickness.toFixed(2)} mm`);
  pushRow('Avg Thickness', `${patch.avgThickness.toFixed(2)} mm`);
  
  const minPercentage = (patch.worstThickness / (patch as any).nominalThickness) * 100;
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

function createImageParagraph(label: string, dataUri?: string): Paragraph[] {
  const bytes = dataUriToUint8(dataUri);
  if (!bytes) {
    return [
      new Paragraph({
        text: `${label}: [image unavailable]`,
        italics: true,
      }),
    ];
  }

  return [
    new Paragraph({
      text: label,
      spacing: { after: 100 },
      bold: true,
    }),
    new Paragraph({
      children: [
        new ImageRun({
          data: bytes,
          transformation: {
            width: 480,
            height: 270,
          },
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  ];
}

export async function generateReportDocx(
  payload: FinalReportPayload,
): Promise<Blob> {
  const { global, segments, remarks } = payload;

  const doc = new Document({
    sections: [],
  });
  
  const sections: any[] = [];

  // --- Cover / Global section ---
  const globalChildren: (Paragraph | Table)[] = [];

  globalChildren.push(
    new Paragraph({
      text: 'Corrosion Inspection Report',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  );

  if (global.assetName) {
    globalChildren.push(
      new Paragraph({
        text: `Asset: ${global.assetName}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
    );
  }

  globalChildren.push(
    new Paragraph({
      text: '',
      spacing: { after: 200 },
    }),
  );

  globalChildren.push(new Paragraph({ text: 'Global Statistics', heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }));
  globalChildren.push(new Paragraph({ text: '' }));
  globalChildren.push(createStatsTable(global));

  if (remarks) {
    globalChildren.push(
      new Paragraph({
        text: '',
        spacing: { before: 200 },
      }),
    );
    globalChildren.push(
      new Paragraph({
        text: 'Inspector Remarks',
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 100 },
      }),
    );
    globalChildren.push(new Paragraph({ text: remarks }));
  }

  sections.push({
    children: globalChildren,
  });

  // --- Per-patch sections ---
  for (const patch of segments) {
    const children: (Paragraph | Table)[] = [];

    children.push(createPatchHeader(patch));
    children.push(
      new Paragraph({
        text:
          'Views: Isometric (45°/35°), Top (90°/0°), Side (0°/90°), plus the 2D heatmap.',
        italics: true,
        spacing: { after: 200 },
      }),
    );
    
    (children as any).push(createPatchStatsTable(patch));

    // Images
    children.push(...createImageParagraph('Isometric View', patch.isoViewDataUrl));
    children.push(...createImageParagraph('Top View', patch.topViewDataUrl));
    children.push(...createImageParagraph('Side View', patch.sideViewDataUrl));
    children.push(...createImageParagraph('2D Heatmap', patch.heatmapDataUrl));

    // AI Observation
    if (patch.aiObservation) {
      children.push(
        new Paragraph({
          text: 'AI Observation',
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }),
      );
      children.push(new Paragraph({ text: patch.aiObservation }));
    }

    sections.push({ children });
  }
  
  (doc as any).sections = sections;

  const buffer = await Packer.toBlob(doc);
  return buffer;
}
