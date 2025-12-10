
"use client";

import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import {
  pickTopNPatches,
  getPatchFromVault,
} from "@/report/patchHelpers";

const LOGO_URL = "https://www.sigmandt.com/images/logo.png";

export default function ReportPage() {
  const [assetId, setAssetId] = useState("ASSET-001");
  const [inspector, setInspector] = useState("Sigma NDT");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [patchVault, setPatchVault] = useState<any>(null);

  useEffect(() => {
    // Only runs on client
    try {
      const stored = localStorage.getItem("patchVault");
      if (stored) {
        const parsed = JSON.parse(stored);
        setPatchVault(parsed);
      }
    } catch (err) {
      console.error("Error loading PatchVault:", err);
    }
  }, []);

  async function generatePdf() {
    try {
      setBusy(true);
      setProgress(3);

      // 1. Load Data
      const topPatches = pickTopNPatches(patchVault, 10);
      if (!topPatches.length) {
        alert("No patches found. Please process a file first.");
        setBusy(false);
        return;
      }
      setProgress(10);

      // 2. Load Logo
      const logoBase64 = await fetch(LOGO_URL)
        .then((r) => r.blob())
        .then((b) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(b);
        })).catch(() => ""); // Fallback if logo fails

      setProgress(15);

      // 3. Create Container
      const container = document.createElement("div");
      container.style.position = "fixed";
      // INFO: Moving it to top-left 0 prevents some rendering bugs, z-index hides it
      container.style.left = "0px"; 
      container.style.top = "0px";
      container.style.width = "800px";
      container.style.zIndex = "-9999";
      container.style.visibility = "hidden"; // Hide visibility, not display
      document.body.appendChild(container);

      const pageStyle = `
        box-sizing:border-box; width:794px; min-height:1123px;
        padding:28px; background:white; color:#111;
        font-family: Arial, sans-serif; position:relative;
      `;
      const watermarkStyle = `
        position:absolute; left:50%; top:50%; transform:translate(-50%, -50%) rotate(-12deg);
        opacity:0.06; width:240px; pointer-events:none; filter:grayscale(100%);
      `;

      // --- BUILD HTML ---
      // Cover Page
      const cover = document.createElement("div");
      cover.setAttribute("style", pageStyle);
      cover.innerHTML = `
        <div style="text-align:center; margin-top:90px;">
          ${logoBase64 ? `<img src="${logoBase64}" style="width:300px; margin-bottom:24px;" />` : ''}
          <h1 style="font-size:28px;">Corrosion Inspection Report</h1>
          <div style="margin-top:12px; font-size:14px;">Asset: ${assetId}</div>
          <div style="font-size:14px;">Inspector: ${inspector}</div>
          <div style="font-size:14px;">Date: ${new Date().toISOString().slice(0,10)}</div>
        </div>
      `;
      container.appendChild(cover);

      // --- 2D VIEW PAGE ---
      const twoDPage = document.createElement("div");
      twoDPage.setAttribute("style", pageStyle);
      twoDPage.innerHTML = `
        <h2 style="margin-top:0;">Full Asset 2D Heatmap</h2>
        <div style="border:1px solid #ddd; padding:6px; display:flex; align-items:center; justify-content:center; height: 800px;">
          <img src="https://picsum.photos/seed/2dview/600/800" data-ai-hint="heatmap chart" style="max-width:100%; max-height:100%; object-fit:contain;" />
        </div>
        <p style="font-size:12px; color: #555; text-align:center; margin-top:10px;">Overall 2D unwrapped view of the asset showing corrosion distribution.</p>
      `;
       if(logoBase64) {
             const wm2D = document.createElement("img");
             wm2D.src = logoBase64;
             wm2D.setAttribute("style", watermarkStyle);
             twoDPage.appendChild(wm2D);
        }
      container.appendChild(twoDPage);
      
      // --- 3D VIEW PAGE ---
      const threeDPage = document.createElement("div");
      threeDPage.setAttribute("style", pageStyle);
      threeDPage.innerHTML = `
        <h2 style="margin-top:0;">Full Asset 3D View</h2>
        <div style="border:1px solid #ddd; padding:6px; display:flex; align-items:center; justify-content:center; height: 800px;">
          <img src="https://picsum.photos/seed/3dview/600/800" data-ai-hint="3d model" style="max-width:100%; max-height:100%; object-fit:contain;" />
        </div>
        <p style="font-size:12px; color: #555; text-align:center; margin-top:10px;">Overall 3D model of the asset showing surface condition and corrosion depth.</p>
      `;
       if(logoBase64) {
             const wm3D = document.createElement("img");
             wm3D.src = logoBase64;
             wm3D.setAttribute("style", watermarkStyle);
             threeDPage.appendChild(wm3D);
        }
      container.appendChild(threeDPage);

      // --- PATCH SUMMARY PAGE ---
      const patchSummaryPage = document.createElement("div");
      patchSummaryPage.setAttribute("style", pageStyle);
      let summaryHtml = `<h2 style="margin-top:0;">Top Corrosion Patch Summary</h2>`;
      summaryHtml += `<table style="width:100%; border-collapse: collapse; font-size: 12px;">
        <thead>
            <tr style="background:#f0f0f0;">
                <th style="padding:8px; border:1px solid #ccc; text-align:left;">Rank</th>
                <th style="padding:8px; border:1px solid #ccc; text-align:left;">Patch ID</th>
                <th style="padding:8px; border:1px solid #ccc; text-align:left;">Severity</th>
                <th style="padding:8px; border:1px solid #ccc; text-align:left;">Min Thick. (mm)</th>
                <th style="padding:8px; border:1px solid #ccc; text-align:left;">Area (m²)</th>
            </tr>
        </thead>
        <tbody>`;
      topPatches.forEach((meta, rank) => {
        summaryHtml += `
            <tr>
                <td style="padding:6px; border:1px solid #ddd;">${rank + 1}</td>
                <td style="padding:6px; border:1px solid #ddd;">${meta.id}</td>
                <td style="padding:6px; border:1px solid #ddd;">${meta.tier || '-'}</td>
                <td style="padding:6px; border:1px solid #ddd;">${meta.worstThickness?.toFixed(2) ?? "-"}</td>
                <td style="padding:6px; border:1px solid #ddd;">${(meta.area_m2 ?? 0).toFixed(4)}</td>
            </tr>
        `;
      });
      summaryHtml += `</tbody></table>`;
      patchSummaryPage.innerHTML = summaryHtml;
      if(logoBase64) {
         const wmSummary = document.createElement("img");
         wmSummary.src = logoBase64;
         wmSummary.setAttribute("style", watermarkStyle);
         patchSummaryPage.appendChild(wmSummary);
      }
      container.appendChild(patchSummaryPage);


      setProgress(50);

      // --- THE FIX: WAIT FOR IMAGES TO LOAD ---
      const allImages = Array.from(container.querySelectorAll("img"));
      await Promise.all(allImages.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve; // Don't crash if one image fails
          });
      }));

      // Extra safety buffer for layout rendering
      await new Promise(r => setTimeout(r, 200));

      // --- PDF RENDERING ---
      const pages = Array.from(container.children) as HTMLElement[];
      const pdf = new jsPDF("p", "pt", "a4");

      // Temporarily make visible for html2canvas to capture correctly
      container.style.visibility = "visible"; 
      // But keep it out of view via fixed positioning
      container.style.left = "-9999px"; 

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true, 
          logging: false,
          backgroundColor: "#ffffff",
          allowTaint: true // Helpful for blobs
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, 595, 842);
        
        setProgress(50 + Math.round((i / pages.length) * 40));
      }

      pdf.save(`Corrosion_Report_${assetId}.pdf`);

      setProgress(100);
      document.body.removeChild(container);
    } catch (err) {
      console.error(err);
      alert("Error: " + err);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 1000);
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Corrosion Report Generator</h1>

      <p style={{ opacity: 0.7 }}>
        This tool generates a lightweight PDF report using cached patch images.
        It does not re-render 2D/3D or upload anything to a server.
      </p>

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>
          <label>Asset ID</label>
          <input
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            style={{ display: "block", padding: 8 }}
          />
        </div>

        <div>
          <label>Inspector</label>
          <input
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            style={{ display: "block", padding: 8 }}
          />
        </div>
      </div>

      <button
        onClick={generatePdf}
        disabled={busy || !patchVault}
        style={{
          marginTop: 30,
          padding: "10px 22px",
          fontSize: 16,
          background: "#0284c7",
          color: "white",
          borderRadius: 8,
          cursor: (busy || !patchVault) ? 'not-allowed' : 'pointer',
          opacity: (busy || !patchVault) ? 0.5 : 1,
        }}
      >
        {busy ? `Generating... ${progress}%` : "Generate Corrosion PDF Report"}
      </button>
      {!patchVault && <p style={{color: '#f56565', fontSize: '12px', marginTop: '8px'}}>No data found. Please process a file in the main app first.</p>}
    </div>
  );
}

    