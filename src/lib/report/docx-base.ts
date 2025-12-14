import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

// -------------------------------------------------------------
// 1. BRAND COLORS + COMMON CONSTANTS
// -------------------------------------------------------------
export const COLORS = {
  primary: "1F4E78",
  border: "D0D0D0",
  textDark: "333333",
  textLight: "666666",
  severe: "C00000",
  moderate: "ED7D31",
  healthy: "70AD47",
  nd: "7F7F7F",
};

export const FONT = {
  header: "Calibri",
  body: "Calibri",
};

export const PAGE = {
  margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 1-inch margins
};

// -------------------------------------------------------------
// 2. UTILITY — CREATE SPACER LINES
// -------------------------------------------------------------
export const spacer = (size = 200) =>
  new Paragraph({
    spacing: { after: size },
    children: [],
  });

// -------------------------------------------------------------
// 3. UTILITY — PARAGRAPH STYLES
// -------------------------------------------------------------
export const heading = (text: string, level: number = 1) =>
  new Paragraph({
    text,
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { after: 200 },
  });

export const subheading = (text: string) =>
  new Paragraph({
    text,
    bold: true,
    spacing: { after: 100 },
  });

export const bodyText = (text: string) =>
  new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONT.body,
        size: 22,
        color: COLORS.textDark,
      }),
    ],
    spacing: { after: 150 },
  });

// -------------------------------------------------------------
// 4. UTILITY — BORDERED TABLE CELL
// -------------------------------------------------------------
export const cell = (children: any[], opts: Partial<TableCell> = {}) =>
  new TableCell({
    shading: opts.shading,
    borders: {
      top: { size: 1, color: COLORS.border },
      bottom: { size: 1, color: COLORS.border },
      left: { size: 1, color: COLORS.border },
      right: { size: 1, color: COLORS.border },
    },
    children,
    ...opts,
  });

// -------------------------------------------------------------
// 5. UTILITY — IMAGE EMBEDDER (Base64 PNG)
// -------------------------------------------------------------
export const embedImage = (base64: string, width: number, height: number) => {
  // Strip prefix if needed
  const clean = base64.replace(/^data:image\/png;base64,/, "");
  
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        data: bytes,
        transformation: {
          width,
          height,
        },
      }),
    ],
  });
};

// -------------------------------------------------------------
// 6. UTILITY — PAGE BREAK
// -------------------------------------------------------------
export const pageBreak = () =>
  new Paragraph({
    children: [new TextRun({ break: 1 })],
  });
