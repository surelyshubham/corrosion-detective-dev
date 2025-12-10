
'use client';
// src/app/report/page.tsx
import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  pickTopNPatches,
  getPatchFromVault,
  getPatchViewUrls,
} from '@/report/patchHelpers';

const LOGO_URL = 'https://www.sigmandt.com/images/logo.png';

type GlobalImages = {
  top?: string;
  side?: string;
  iso?: string;
  heat?: string;
};

// Try to read global images from DataVault (optional)
function getGlobalImages(): GlobalImages {
  const w: any = window as any;
  const dv = w.DataVault;
  if (!dv) return {};
  // adjust keys if yours are different
  return dv.reportGlobals || {};
}

const pageStyle = `
  box-sizing: border-box;
  width: 794px;
  min-height: 1123px;
  padding: 28px;
  background: white;
  color: #111;
  font-family: Arial, Helvetica, sans-serif;
  position: relative;
`;

const watermarkStyle = `
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) rotate(-12deg);
  opacity: 0.06;
  pointer-events: none;
  width: 240px;
  filter: grayscale(100%);
`;

const ReportPage: React.FC = () => {
  const [assetId, setAssetId] = useState('ASSET-001');
  const [inspector, setInspector] = useState('Inspector Name');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function generatePdf() {
    try {
      setBusy(true);
      setProgress(2);

      // 1) pick top-10 patches
      const top = pickTopNPatches(10);
      if (!top.length) {
        alert('No patches found in PatchVault. Please process a file first.');
        setBusy(false);
        setProgress(0);
        return;
      }

      setProgress(5);

      // 2) logo for cover + watermark
      const logoBase64 = await fetch(LOGO_URL)
        .then(r => r.blob())
        .then(
          blob =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }),
        );

      setProgress(10);

      // 3) prepare hidden container
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '800px';
      container.style.zIndex = '-1000';
      document.body.appendChild(container);

      // --- COVER PAGE ---
      const cover = document.createElement('div');
      cover.setAttribute('style', pageStyle);
      cover.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
          <img src="${logoBase64}" style="width:320px; height:auto; object-fit:contain; margin-bottom:24px;" />
          <h1 style="font-size:28px; margin: 8px 0 6px;">Corrosion Inspection Report</h1>
          <div style="font-size:14px; color:#444; margin-bottom:4px;">Asset: ${assetId}</div>
          <div style="font-size:13px; color:#444; margin-bottom:20px;">Inspector: ${inspector} — Date: ${new Date()
            .toISOString()
            .slice(0, 10)}</div>
          <div style="width:60%; text-align:center; color:#333; font-size:13px;">
            <p>This report summarizes the top ${top.length} corrosion patches based on severity, depth, and area. Full dataset remains available in the analysis system.</p>
          </div>
        </div>
      `;
      const wmCover = document.createElement('img');
      wmCover.src = logoBase64;
      wmCover.setAttribute('style', watermarkStyle);
      cover.appendChild(wmCover);
      container.appendChild(cover);

      setProgress(15);

      // --- GLOBAL VIEWS PAGE (optional) ---
      const g = getGlobalImages();
      const globalUrls = [g.top, g.side, g.iso, g.heat].filter(Boolean) as string[];

      if (globalUrls.length) {
        const gpage = document.createElement('div');
        gpage.setAttribute('style', pageStyle);
        let ghtml = `<h2 style="margin-top:0">Global Views</h2>`;
        ghtml += `<div style="display:flex; flex-wrap:wrap; gap:8px;">`;
        for (const url of globalUrls.slice(0, 4)) {
          ghtml += `
            <div style="flex: 1 1 48%; min-height: 180px; border:1px solid #eee; padding:6px; display:flex; align-items:center; justify-content:center;">
              <img src="${url}" style="max-width:100%; max-height:300px; object-fit:contain;" />
            </div>`;
        }
        ghtml += `</div>`;
        gpage.innerHTML = ghtml;
        const wm = document.createElement('img');
        wm.src = logoBase64;
        wm.setAttribute('style', watermarkStyle);
        gpage.appendChild(wm);
        container.appendChild(gpage);
      }

      setProgress(25);

      // --- PATCH PAGES ---
      top.forEach((meta, idx) => {
        const entry = getPatchFromVault(meta.id);
        const urls = entry ? getPatchViewUrls(entry) : [];
        const page = document.createElement('div');
        page.setAttribute('style', pageStyle);

        let html = `<h2 style="margin-top:0">Patch ${meta.id} — Rank ${idx + 1}</h2>`;
        html += `<div style="display:flex; gap:12px; align-items:flex-start;">`;

        // left column = stats
        html += `
          <div style="width:36%; font-size:13px; color:#333;">
            <div><strong>Area:</strong> ${(meta.area_m2 ?? 0).toFixed(4)} m²</div>
            <div><strong>Avg Depth:</strong> ${meta.avgDepth_mm ?? '-'} mm</div>
            <div><strong>Max Depth:</strong> ${meta.maxDepth_mm ?? '-'} mm</div>
            <div><strong>Severity:</strong> ${meta.severity ?? '-'}</div>
            <div style="margin-top:8px;"><strong>Remark:</strong>
              <div style="margin-top:6px; color:#555">${meta.shortInsight || '-'}</div>
            </div>
          </div>
        `;

        // right column = 2x2 images
        html += `<div style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:8px;">`;
        for (let i = 0; i < 4; i++) {
          const url = urls[i];
          html += `
            <div style="min-height:120px; border:1px solid #eee; display:flex; align-items:center; justify-content:center; padding:6px;">
              ${
                url
                  ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;" />`
                  : `<div style="color:#999; font-size:12px;">(no image)</div>`
              }
            </div>`;
        }
        html += `</div>`; // end grid
        html += `</div>`; // end flex

        page.innerHTML = html;
        const wm = document.createElement('img');
        wm.src = logoBase64;
        wm.setAttribute('style', watermarkStyle);
        page.appendChild(wm);
        container.appendChild(page);
      });

      setProgress(65);

      // --- APPENDIX PAGE ---
      const appendix = document.createElement('div');
      appendix.setAttribute('style', pageStyle);
      appendix.innerHTML = `
        <h2 style="margin-top:0">Appendix</h2>
        <p style="font-size:13px; color:#444;">
          The complete corrosion dataset, including all detected patches and raw thickness maps,
          is stored within the analysis system (PatchVault/DataVault). This PDF presents a
          focused summary of the most significant ${top.length} patches.
        </p>
      `;
      const wmA = document.createElement('img');
      wmA.src = logoBase64;
      wmA.setAttribute('style', watermarkStyle);
      appendix.appendChild(wmA);
      container.appendChild(appendix);

      setProgress(70);

      // give layout a moment
      await new Promise(res => setTimeout(res, 50));

      // 4) render each child as pdf page
      const pages = Array.from(container.children) as HTMLElement[];
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        setProgress(70 + Math.round((i / pages.length) * 25));

        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
        const w = imgWidth * ratio;
        const h = imgHeight * ratio;
        const x = (pageWidth - w) / 2;
        const y = (pageHeight - h) / 2;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', x, y, w, h, undefined, 'FAST');
      }

      setProgress(97);

      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const fileName = `SigmaCorrosionReport-${assetId}-${new Date().toISOString().slice(0, 10)}.pdf`;

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        try {
          a.remove();
        } catch {}
      }, 2000);

      // cleanup DOM
      try {
        document.body.removeChild(container);
      } catch {}

      setProgress(100);
    } catch (err) {
      console.error('PDF generation error', err);
      alert('Failed to generate report PDF: ' + String(err));
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 1000);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: 'auto' }}>
      <div className="p-6 border rounded-lg bg-card text-card-foreground">
        <h1 className="text-2xl font-headline font-bold">Corrosion Report Generator</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This page generates a lightweight PDF report using cached patch views from the data vault.
          It does not re-render 2D/3D views and does not upload anything to a server.
        </p>

        <div className="grid grid-cols-2 gap-4 my-6">
          <div>
            <label className="text-sm font-medium">Asset ID</label>
            <input
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2 bg-background border"
              value={assetId}
              onChange={e => setAssetId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Inspector</label>
            <input
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2 bg-background border"
              value={inspector}
              onChange={e => setInspector(e.target.value)}
            />
          </div>
        </div>

        <button onClick={generatePdf} disabled={busy} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full">
          {busy ? `Generating... ${progress}%` : 'Generate Corrosion PDF Report'}
        </button>

        {busy && (
          <div className="mt-4">
            <div className="text-sm text-center text-muted-foreground">Progress: {progress}%</div>
            <div
              className="mt-2 w-full bg-secondary rounded-full h-2.5"
            >
              <div
                className="bg-primary h-2.5 rounded-full"
                style={{
                  width: `${progress}%`,
                  transition: 'width 0.2s',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;
