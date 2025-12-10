
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
import type { FinalReportPayload, ReportPatchSegment, GlobalStatsForDocx } from '../reporting/DocxReportGenerator';


type GenerateMessage = {
  cmd: 'generate_report',
  payload: FinalReportPayload,
};

function dataUriToUint8(dataUri?: string): Uint8Array | null {
  if (!dataUri) return null;
  try {
    const commaIndex = dataUri.indexOf(',');
    if (commaIndex === -1) return null;
    const base64 = dataUri.substring(commaIndex + 1).trim();
    if (!base64) return null;
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
  if (global.inspectionDate)
    pushRow('Inspection Date', global.inspectionDate);
  if (global.nominalThickness !== undefined)
    pushRow(
      'Nominal Thickness',
      `${Number(global.nominalThickness).toFixed(2)} mm`,
    );

  pushRow('Min Thickness', `${Number(global.minThickness).toFixed(2)} mm`);
  pushRow('Max Thickness', `${Number(global.maxThickness).toFixed(2)} mm`);
  pushRow('Avg Thickness', `${Number(global.avgThickness).toFixed(2)} mm`);

  if (global.corrodedAreaBelow80 !== undefined)
    pushRow(
      'Corroded Area (<80%)',
      `${Number(global.corrodedAreaBelow80).toFixed(2)} %`,
    );
  if (global.corrodedAreaBelow70 !== undefined)
    pushRow(
      'Corroded Area (<70%)',
      `${Number(global.corrodedAreaBelow70).toFixed(2)} %`,
    );
  if (global.corrodedAreaBelow60 !== undefined)
    pushRow(
      'Corroded Area (<60%)',
      `${Number(global.corrodedAreaBelow60).toFixed(2)} %`,
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

function createPatchStatsTable(patch: ReportPatchSegment, nominalThickness: number): Table {
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

    pushRow(
        'Coordinates (X)',
        `${patch.coordinates.xMin.toFixed(0)} to ${patch.coordinates.xMax.toFixed(0)}`,
    );
    pushRow(
        'Coordinates (Y)',
        `${patch.coordinates.yMin.toFixed(0)} to ${patch.coordinates.yMax.toFixed(0)}`,
    );
    
    pushRow('Min Thickness', `${patch.worstThickness.toFixed(2)} mm`);
    pushRow('Avg Thickness', `${patch.avgThickness.toFixed(2)} mm`);
    
    const minPercentage = (patch.worstThickness / nominalThickness) * 100;
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


self.addEventListener('message', async (ev: MessageEvent<GenerateMessage>) => {
    const { cmd, payload } = ev.data;
    if (cmd !== 'generate_report') return;

    try {
        const { global, segments, remarks } = payload;
        const sections: any[] = [];

        // Global page
        const globalChildren: (Paragraph | Table)[] = [
            new Paragraph({ text: 'Corrosion Inspection Report', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: global.assetName ?? 'Unknown Asset', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
            new Paragraph({ text: 'Global Statistics', heading: HeadingLevel.HEADING_1 }),
            createStatsTable(global),
        ];
        if (remarks) {
            globalChildren.push(new Paragraph({ text: '', spacing: { before: 200 } }));
            globalChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Inspector Remarks' }));
            globalChildren.push(new Paragraph({ text: remarks }));
        }
        sections.push({ children: globalChildren });

        // Patch pages
        for (const patch of segments) {
            const patchChildren: (Paragraph|Table)[] = [
                createPatchHeader(patch),
                createPatchStatsTable(patch, global.nominalThickness || 0),
                new Paragraph({ text: "" }), // Spacer
                new Paragraph({ text: "Isometric View", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }),
                await createImageParagraph(patch.isoViewDataUrl),
                new Paragraph({ text: "Top View", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }),
                await createImageParagraph(patch.topViewDataUrl),
                new Paragraph({ text: "Side View", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }),
                await createImageParagraph(patch.sideViewDataUrl),
                new Paragraph({ text: "2D Heatmap", alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } }),
                await createImageParagraph(patch.heatmapDataUrl),
            ];
            if (patch.aiObservation) {
                patchChildren.push(new Paragraph({ text: 'AI Observation', heading: HeadingLevel.HEADING_3, spacing: {before: 200, after: 100 } }));
                patchChildren.push(new Paragraph({ text: patch.aiObservation }));
            }
            sections.push({ children: patchChildren });
        }
        
        const doc = new Document({ sections });
        const buffer = await Packer.toBuffer(doc);
        self.postMessage({ ok: true, buffer }, [buffer]);

    } catch(err: any) {
        self.postMessage({ ok: false, error: err.message });
    }
});

    