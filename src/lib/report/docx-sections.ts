import {
  AlignmentType,
  Footer,
  Header,
  ImageRun,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

import {
  COLORS,
  FONT,
  bodyText,
  heading,
  subheading,
  embedImage,
  pageBreak,
  spacer,
  cell,
} from "./docx-base";

/* -------------------------------------------------------------
   1. HEADER WITH LOGO
------------------------------------------------------------- */
export const buildHeader = async () => {
  // Fetch logo file stored at /public/logo.png
  const res = await fetch("http://localhost:9002/logo.png"); // Using absolute URL for server-side fetch
  const blob = await res.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new ImageRun({
            data: buffer,
            transformation: { width: 120, height: 45 },
          }),
        ],
      }),
    ],
  });
};

/* -------------------------------------------------------------
   2. FOOTER WITH PAGE NUMBER
------------------------------------------------------------- */
export const buildFooter = () =>
  new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: ["Page ", TextRun.PageNumber()],
            font: FONT.body,
            size: 20,
            color: COLORS.textLight,
          }),
        ],
      }),
    ],
  });

/* -------------------------------------------------------------
   3. COVER PAGE
------------------------------------------------------------- */
export const buildCoverPage = (meta: {
  assetId: string;
  clientName?: string;
  location?: string;
  date?: string;
}) => {
  return [
    spacer(300),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "INSPECTION REPORT",
          bold: true,
          size: 52,
          color: COLORS.primary,
          font: FONT.header,
        }),
      ],
      spacing: { after: 300 },
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Asset ID: ${meta.assetId}`,
          bold: true,
          size: 32,
          color: COLORS.textDark,
        }),
      ],
    }),

    spacer(100),

    ...(meta.clientName
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Client: ${meta.clientName}`,
                size: 26,
                color: COLORS.textLight,
              }),
            ],
          }),
          spacer(50),
        ]
      : []),

    ...(meta.location
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Location: ${meta.location}`,
                size: 26,
                color: COLORS.textLight,
              }),
            ],
          }),
          spacer(50),
        ]
      : []),

    ...(meta.date
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Date: ${meta.date}`,
                size: 26,
                color: COLORS.textLight,
              }),
            ],
          }),
        ]
      : []),

    pageBreak(),
  ];
};

/* -------------------------------------------------------------
   4. ASSET OVERVIEW PAGE
------------------------------------------------------------- */
export const buildAssetOverview = (inputs: {
  nominalThickness: number;
  minThickness: number;
  maxThickness: number;
  avgThickness: number;
  gridWidth: number;
  gridHeight: number;
  percentBelow80: number;
  percentBelow70: number;
  percentBelow60: number;
}) => {
  return [
    heading("Asset Overview", 1),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell([new Paragraph("Nominal Thickness")]),
            cell([new Paragraph(`${inputs.nominalThickness} mm`)]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Minimum Thickness Observed")]),
            cell([new Paragraph(`${inputs.minThickness.toFixed(2)} mm`)]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Maximum Thickness Observed")]),
            cell([new Paragraph(`${inputs.maxThickness.toFixed(2)} mm`)]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Average Thickness")]),
            cell([new Paragraph(`${inputs.avgThickness.toFixed(2)} mm`)]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Grid Resolution")]),
            cell([
              new Paragraph(`${inputs.gridWidth} × ${inputs.gridHeight} points`),
            ]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Area Below 80%")]),
            cell([new Paragraph(`${inputs.percentBelow80.toFixed(1)} %`)]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Area Below 70%")]),
            cell([new Paragraph(`${inputs.percentBelow70.toFixed(1)} %`)]),
          ],
        }),
        new TableRow({
          children: [
            cell([new Paragraph("Area Below 60%")]),
            cell([new Paragraph(`${inputs.percentBelow60.toFixed(1)} %`)]),
          ],
        }),
      ],
    }),

    spacer(200),
    pageBreak(),
  ];
};

/* -------------------------------------------------------------
   5. 2x2 IMAGE GRID SECTION
------------------------------------------------------------- */
export const build2x2ImageGrid = (title: string, images: string[]) => {
  // images: [img1, img2, img3, img4] as base64 PNGs

  if (images.length !== 4)
    throw new Error("build2x2ImageGrid expects exactly 4 images.");

  const rows = [];

  // 1st row
  rows.push(
    new TableRow({
      children: [
        cell([embedImage(images[0], 260, 260)]),
        cell([embedImage(images[1], 260, 260)]),
      ],
    })
  );

  // 2nd row
  rows.push(
    new TableRow({
      children: [
        cell([embedImage(images[2], 260, 260)]),
        cell([embedImage(images[3], 260, 260)]),
      ],
    })
  );

  return [
    heading(title, 1),
    spacer(100),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),

    spacer(200),
    pageBreak(),
  ];
};
