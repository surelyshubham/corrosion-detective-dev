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
