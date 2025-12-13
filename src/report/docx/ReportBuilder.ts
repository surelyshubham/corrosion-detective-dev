import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import type { ReportInput } from "./types";
import { createCoverPage } from "./sections/coverPage";

export class ReportBuilder {
  private doc: Document;

  constructor(private input: ReportInput) {
    this.doc = new Document({
      sections: [],
    });
  }

  private async build() {
    const coverPage = await createCoverPage(this.input.assetInfo);
    
    // This is where we will add all the other sections
    this.doc.addSection(coverPage);

    // TODO: Add other sections
    // - Asset Overview
    // - Inspection Summary
    // - Legend
    // - Corrosion Patches
    // - ND Patches
    // - Conclusion
  }

  public async generate() {
    await this.build();

    Packer.toBlob(this.doc).then((blob) => {
      saveAs(blob, `Corrosion_Report_${this.input.assetInfo.assetTag}.docx`);
      console.log("Document created successfully");
    });
  }
}
