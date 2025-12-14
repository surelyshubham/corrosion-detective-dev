
import { Header, Paragraph, ImageRun, TextRun, Footer, AlignmentType, PageNumber } from "docx";

export const HEADING_1 = "heading1";
export const HEADING_2 = "heading2";

export const STYLES = {
  paragraphStyles: [
    {
      id: HEADING_1,
      name: "Heading 1",
      basedOn: "Normal",
      next: "Normal",
      run: {
        font: "Calibri",
        size: 52, // 26pt
        bold: true,
        color: "003366",
      },
    },
    {
      id: HEADING_2,
      name: "Heading 2",
      basedOn: "Normal",
      next: "Normal",
      run: {
        font: "Calibri",
        size: 28, // 14pt
        bold: false,
        color: "003366",
      },
    },
  ],
};


export function base64ToUint8Array(base64: string) {
    const binary_string = window.atob(base64.split(',')[1]);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}


export function createHeader(assetInfo: any) {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            data: base64ToUint8Array(assetInfo.logoBase64),
            transformation: { width: 120, height: 40 },
          }),
          new TextRun({
            text: "   Robotic Thickness Survey Report",
            bold: true,
          }),
        ],
      }),
    ],
  });
}

export function createFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun("Page "), PageNumber.CURRENT],
      }),
    ],
  });
}
