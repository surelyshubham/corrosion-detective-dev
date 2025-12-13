
"use client";

import React from 'react';

export function PlatePercentLegend() {
  const levels = [
    { label: '90–100%', color: '#0000ff' },
    { label: '80–90%', color: '#00ff00' },
    { label: '70–80%', color: '#ffff00' },
    { label: '< 70%', color: '#ff0000' },
    { label: 'ND', color: '#888888' },
  ];

  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium mb-1">Condition (% Thickness)</div>
      {levels.map(l => (
        <div key={l.label} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm border"
            style={{ backgroundColor: l.color }}
          />
          <span>{l.label}</span>
        </div>
      ))}
    </div>
  );
}

    