import jsPDF from 'jspdf';
import { Construction, ConstructionLayer } from '@/types/materials';
import {
  calculateUValue,
  calculateUValueWithoutBridging,
  calculateLayerThermalResistance,
  calculateLayerThermalResistanceNoBridging,
  calculateGroundFloorUValue,
} from '@/utils/hygrothermalCalculations';
import { FloorType } from '@/components/JunctionCanvas';

interface UValueExportOptions {
  construction: Construction;
  constructionType: 'wall' | 'floor';
  floorType?: FloorType;
  perimeter?: number;
  area?: number;
  wallThickness?: number;
  soilConductivity?: number;
  projectName?: string;
  buildupName?: string;
}

const colors = {
  primary: [0, 102, 153] as [number, number, number],
  success: [34, 139, 34] as [number, number, number],
  warning: [200, 140, 0] as [number, number, number],
  header: [43, 57, 72] as [number, number, number],
  text: [51, 51, 51] as [number, number, number],
  muted: [119, 119, 119] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  lightBg: [245, 247, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const getMaterialPattern = (category: string): { color: [number, number, number] } => {
  switch (category) {
    case 'masonry': return { color: [205, 92, 92] };
    case 'insulation': return { color: [255, 200, 150] };
    case 'concrete': return { color: [169, 169, 169] };
    case 'timber': return { color: [210, 180, 140] };
    case 'membrane': return { color: [100, 149, 237] };
    case 'plasterboard': return { color: [245, 245, 220] };
    case 'metal': return { color: [192, 192, 192] };
    case 'airgap': return { color: [240, 248, 255] };
    case 'render': return { color: [222, 184, 135] };
    case 'cladding': return { color: [139, 69, 19] };
    case 'flooring': return { color: [180, 140, 100] };
    default: return { color: [200, 200, 200] };
  }
};

export async function exportUValuePDF(options: UValueExportOptions) {
  const {
    construction,
    constructionType,
    floorType = 'ground',
    perimeter = 40,
    area = 100,
    wallThickness = 0.3,
    soilConductivity = 2.0,
    projectName,
    buildupName,
  } = options;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Compute values
  const isFloor = constructionType === 'floor';
  const isGroundFloor = isFloor && (floorType === 'ground' || floorType === 'solid' || floorType === 'suspended');

  const uValue = isGroundFloor
    ? calculateGroundFloorUValue(construction, perimeter, area, floorType, wallThickness, soilConductivity)
    : calculateUValue(construction);

  const uValueNoBridging = calculateUValueWithoutBridging(construction);
  const hasBridging = construction.layers.some(l => l.bridging);
  const totalR = uValue > 0 ? 1 / uValue : 0;

  // Part L 2021 limiting U-values
  const partLLimits: Record<string, number> = {
    wall: 0.30,
    floor: 0.25,
  };
  const partLLimit = partLLimits[constructionType] || 0.30;
  const passesPartL = uValue <= partLLimit;

  let y = 0;

  // ── Cover / Title ──
  pdf.setFillColor(...colors.primary);
  pdf.rect(0, 0, pageWidth, 40, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.text('U-Value Calculation Report', margin, 20);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  const standards = isGroundFloor
    ? 'BS EN ISO 6946:2017 · BS EN ISO 13370:2017'
    : 'BS EN ISO 6946:2017';
  pdf.text(standards, margin, 30);
  if (hasBridging) {
    pdf.text('Combined Method (Parallel Path Bridging)', margin, 36);
  }

  y = 50;

  // Project & buildup info
  pdf.setTextColor(...colors.header);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  if (projectName) {
    pdf.text(`Project: ${projectName}`, margin, y);
    y += 7;
  }
  pdf.text(`Build-up: ${buildupName || construction.name}`, margin, y);
  y += 7;

  pdf.setTextColor(...colors.muted);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const typeLabel = isFloor ? `Floor (${floorType})` : 'Wall';
  pdf.text(`Element Type: ${typeLabel}`, margin, y);
  y += 5;
  pdf.text(
    `Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    margin,
    y
  );
  y += 12;

  // ── U-Value Result Box ──
  const resultBoxH = hasBridging ? 38 : 28;
  pdf.setFillColor(...colors.lightBg);
  pdf.roundedRect(margin, y, contentWidth, resultBoxH, 3, 3, 'F');
  pdf.setDrawColor(...colors.border);
  pdf.roundedRect(margin, y, contentWidth, resultBoxH, 3, 3, 'S');

  pdf.setTextColor(...colors.header);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Calculated U-Value', margin + 5, y + 8);

  pdf.setTextColor(...colors.primary);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${uValue.toFixed(3)} W/m²K`, margin + 5, y + 20);

  // Part L compliance badge
  const badgeX = margin + contentWidth - 55;
  pdf.setFillColor(...(passesPartL ? colors.success : colors.warning));
  pdf.roundedRect(badgeX, y + 5, 50, 14, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(passesPartL ? 'COMPLIANT' : 'EXCEEDS LIMIT', badgeX + 25, y + 10, { align: 'center' });
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Part L limit: ${partLLimit.toFixed(2)} W/m²K`, badgeX + 25, y + 16, { align: 'center' });

  if (hasBridging) {
    pdf.setTextColor(...colors.muted);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`U-value without bridging: ${uValueNoBridging.toFixed(3)} W/m²K`, margin + 5, y + 30);
    pdf.text(
      `Bridging correction: +${((uValue - uValueNoBridging) * 1000).toFixed(1)} mW/m²K`,
      margin + 5,
      y + 35
    );
  }

  y += resultBoxH + 10;

  // ── Total R breakdown ──
  pdf.setTextColor(...colors.header);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Thermal Resistance Summary', margin, y);
  y += 6;

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.text);
  pdf.text(`Total Thermal Resistance (R_T): ${totalR.toFixed(3)} m²K/W`, margin + 5, y);
  y += 5;
  pdf.text(
    `Internal Surface Resistance (R_si): ${construction.internalSurfaceResistance.toFixed(2)} m²K/W`,
    margin + 5,
    y
  );
  y += 5;
  pdf.text(
    `External Surface Resistance (R_se): ${construction.externalSurfaceResistance.toFixed(2)} m²K/W`,
    margin + 5,
    y
  );
  y += 5;

  if (isGroundFloor) {
    pdf.text(`Floor Perimeter (P): ${perimeter} m`, margin + 5, y);
    y += 5;
    pdf.text(`Floor Area (A): ${area} m²`, margin + 5, y);
    y += 5;
    pdf.text(`P/A Ratio: ${(perimeter / area).toFixed(3)}`, margin + 5, y);
    y += 5;
    pdf.text(`Soil Conductivity (λ_g): ${soilConductivity} W/mK`, margin + 5, y);
    y += 5;
  }

  y += 8;

  // ── Construction Cross-Section ──
  pdf.setTextColor(...colors.header);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Construction Cross-Section', margin, y);
  y += 8;

  if (!isFloor) {
    // Horizontal cross-section for walls
    const totalThickness = construction.layers.reduce((sum, l) => sum + l.thickness, 0);
    const maxLayerWidth = contentWidth - 35;
    const scale = Math.min(0.15, maxLayerWidth / totalThickness);
    const layerHeight = 32;

    pdf.setFontSize(7);
    pdf.setTextColor(...colors.success);
    pdf.text('Internal', margin, y + layerHeight / 2 + 2);

    let currentX = margin + 18;

    construction.layers.forEach((layer) => {
      const layerWidth = Math.max(layer.thickness * scale, 15);
      const { color } = getMaterialPattern(layer.material.category);

      pdf.setFillColor(...color);
      pdf.rect(currentX, y, layerWidth, layerHeight, 'F');

      // Brick pattern for masonry
      if (layer.material.category === 'masonry') {
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(0.1);
        for (let px = currentX; px < currentX + layerWidth; px += 4) {
          pdf.line(px, y, px, y + layerHeight);
          const offset = (Math.floor((px - currentX) / 4) % 2) * 3;
          for (let py2 = y + offset; py2 < y + layerHeight; py2 += 6) {
            pdf.line(px, py2, Math.min(px + 4, currentX + layerWidth), py2);
          }
        }
      } else if (layer.material.category === 'insulation') {
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(0.1);
        for (let px = currentX + 3; px < currentX + layerWidth - 2; px += 5) {
          for (let py2 = y + 3; py2 < y + layerHeight - 2; py2 += 5) {
            pdf.circle(px, py2, 0.5, 'F');
          }
        }
      }

      // Bridging studs
      if (layer.bridging) {
        pdf.setFillColor(80, 80, 80);
        for (let sy = y + 5; sy < y + layerHeight - 5; sy += 10) {
          pdf.rect(currentX, sy, layerWidth, 2.5, 'F');
        }
      }

      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.3);
      pdf.rect(currentX, y, layerWidth, layerHeight);

      // Labels below
      pdf.setFontSize(6);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${layer.thickness}mm`, currentX + layerWidth / 2, y + layerHeight + 4, { align: 'center' });
      const materialShort = layer.material.name.split(' ').slice(0, 2).join(' ').substring(0, 14);
      pdf.text(materialShort, currentX + layerWidth / 2, y + layerHeight + 8, { align: 'center' });
      if (layer.bridging) {
        pdf.setTextColor(...colors.muted);
        pdf.text(
          `(${layer.bridging.percentage}% ${layer.bridging.material.name.split(' ')[0]})`,
          currentX + layerWidth / 2,
          y + layerHeight + 12,
          { align: 'center' }
        );
      }

      currentX += layerWidth;
    });

    pdf.setFontSize(7);
    pdf.setTextColor(...colors.muted);
    pdf.text('External', currentX + 5, y + layerHeight / 2 + 2);

    y += layerHeight + 18;
  } else {
    // Vertical cross-section for floors
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.success);
    pdf.text('Internal (Top)', margin, y + 3);
    y += 6;

    const totalThickness = construction.layers.reduce((sum, l) => sum + l.thickness, 0);
    const maxH = 70;
    const scale = Math.min(0.15, maxH / totalThickness);
    let currentY = y;

    construction.layers.forEach((layer) => {
      const lh = Math.max(layer.thickness * scale, 10);
      const { color } = getMaterialPattern(layer.material.category);

      pdf.setFillColor(...color);
      pdf.rect(margin, currentY, contentWidth, lh, 'F');

      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, currentY, contentWidth, lh);

      // Label inside
      pdf.setFontSize(7);
      pdf.setTextColor(0, 0, 0);
      let labelText = `${layer.thickness}mm ${layer.material.name}`;
      if (layer.bridging) {
        labelText += ` (${layer.bridging.percentage}% ${layer.bridging.material.name})`;
      }
      const lines = pdf.splitTextToSize(labelText, contentWidth - 10);
      lines.forEach((line: string, li: number) => {
        pdf.text(line, margin + 3, currentY + lh / 2 + 2 + li * 4);
      });

      currentY += lh;
    });

    pdf.setFontSize(7);
    pdf.setTextColor(...colors.muted);
    pdf.text(isGroundFloor ? 'Ground' : 'External (Below)', margin, currentY + 6);

    y = currentY + 14;
  }

  // ── Layers Table ──
  // Check if we need a new page
  const estimatedTableHeight = 16 + construction.layers.length * 8;
  if (y + estimatedTableHeight > pageHeight - 20) {
    pdf.addPage();
    y = 20;
  }

  pdf.setTextColor(...colors.header);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Layer Schedule', margin, y);
  y += 6;

  // Table header
  const colDefs = [
    { label: '#', x: 0, w: 8 },
    { label: 'Material', x: 8, w: 62 },
    { label: 'Thickness (mm)', x: 70, w: 28 },
    { label: 'λ (W/mK)', x: 98, w: 22 },
    { label: 'R (m²K/W)', x: 120, w: 25 },
    { label: 'Bridging', x: 145, w: 35 },
  ];

  pdf.setFillColor(...colors.primary);
  pdf.rect(margin, y, contentWidth, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  colDefs.forEach((col) => {
    pdf.text(col.label, margin + col.x + 2, y + 5);
  });
  y += 7;

  // Rsi row
  pdf.setFillColor(...colors.lightBg);
  pdf.rect(margin, y, contentWidth, 6, 'F');
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(...colors.muted);
  pdf.text('Rsi', margin + 2, y + 4.5);
  pdf.text('Internal surface resistance', margin + 10, y + 4.5);
  pdf.text(construction.internalSurfaceResistance.toFixed(3), margin + 122, y + 4.5);
  y += 6;

  // Layer rows
  pdf.setFont('helvetica', 'normal');
  construction.layers.forEach((layer, i) => {
    const layerR = calculateLayerThermalResistance(layer);
    const rowBg = i % 2 === 0 ? colors.white : colors.lightBg;
    const rowH = 7;

    pdf.setFillColor(...rowBg);
    pdf.rect(margin, y, contentWidth, rowH, 'F');

    pdf.setTextColor(...colors.text);
    pdf.setFontSize(7);
    pdf.text(`${i + 1}`, margin + 2, y + 5);

    // Material name (wrap if needed)
    const nameLines = pdf.splitTextToSize(layer.material.name, 58);
    pdf.text(nameLines[0], margin + 10, y + 5);

    pdf.text(`${layer.thickness}`, margin + 72, y + 5);
    pdf.text(`${layer.material.thermalConductivity}`, margin + 100, y + 5);
    pdf.text(layerR.toFixed(3), margin + 122, y + 5);

    if (layer.bridging) {
      pdf.setTextColor(...colors.warning);
      const bridgeText = `${layer.bridging.percentage}% ${layer.bridging.material.name.split(' ')[0]}`;
      pdf.text(bridgeText.substring(0, 18), margin + 147, y + 5);
    }

    y += rowH;
  });

  // Rse row
  pdf.setFillColor(...colors.lightBg);
  pdf.rect(margin, y, contentWidth, 6, 'F');
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(...colors.muted);
  pdf.text('Rse', margin + 2, y + 4.5);
  pdf.text(isFloor ? 'Ground/external surface resistance' : 'External surface resistance', margin + 10, y + 4.5);
  pdf.text(construction.externalSurfaceResistance.toFixed(3), margin + 122, y + 4.5);
  y += 6;

  // Total row
  pdf.setFillColor(...colors.primary);
  pdf.rect(margin, y, contentWidth, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TOTAL', margin + 2, y + 5);
  pdf.text(`R_T = ${totalR.toFixed(3)} m²K/W`, margin + 72, y + 5);
  pdf.text(`U = ${uValue.toFixed(3)} W/m²K`, margin + 122, y + 5);
  y += 12;

  // ── Bridging Details (if any) ──
  const bridgedLayers = construction.layers.filter(l => l.bridging);
  if (bridgedLayers.length > 0) {
    if (y + 40 > pageHeight - 20) {
      pdf.addPage();
      y = 20;
    }

    pdf.setTextColor(...colors.header);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Thermal Bridging Details', margin, y);
    y += 6;

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.text);
    pdf.text(
      'Bridging correction applied using the Combined Method (BS EN ISO 6946:2017 §6.7.2).',
      margin + 5,
      y
    );
    y += 5;
    pdf.text(
      'R_T = (R_upper + R_lower) / 2, where R_upper assumes parallel heat flow and R_lower assumes isothermal planes.',
      margin + 5,
      y
    );
    y += 8;

    bridgedLayers.forEach((layer) => {
      if (!layer.bridging) return;
      pdf.setFontSize(7);
      pdf.setTextColor(...colors.text);
      const desc = `• ${layer.material.name} (${layer.thickness}mm): ${layer.bridging.percentage}% bridged by ${layer.bridging.material.name} (λ = ${layer.bridging.material.thermalConductivity} W/mK)`;
      const wLines = pdf.splitTextToSize(desc, contentWidth - 10);
      wLines.forEach((line: string) => {
        pdf.text(line, margin + 5, y);
        y += 4;
      });
    });

    y += 5;
  }

  // ── Standards & Methodology Footer ──
  if (y + 50 > pageHeight - 20) {
    pdf.addPage();
    y = 20;
  }

  pdf.setFillColor(...colors.lightBg);
  pdf.roundedRect(margin, y, contentWidth, 45, 3, 3, 'F');

  pdf.setTextColor(...colors.header);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Applicable Standards & Methodology', margin + 5, y + 8);

  pdf.setTextColor(...colors.text);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');

  const methodLines = [
    '• BS EN ISO 6946:2017 — Building components and building elements. Thermal resistance and thermal transmittance. Calculation methods.',
    hasBridging
      ? '• Combined Method (§6.7.2) — Thermal bridging assessed via upper/lower resistance limits for parallel heat flow paths.'
      : null,
    isGroundFloor
      ? '• BS EN ISO 13370:2017 — Thermal performance of buildings. Heat transfer via the ground. Calculation methods.'
      : null,
    '• UK Building Regulations Approved Document Part L (Conservation of fuel and power) — Limiting fabric parameters.',
    `• Surface resistances per BS EN ISO 6946: Rsi = ${construction.internalSurfaceResistance} m²K/W, Rse = ${construction.externalSurfaceResistance} m²K/W.`,
  ].filter(Boolean) as string[];

  let lineY = y + 14;
  methodLines.forEach((line) => {
    const wrapped = pdf.splitTextToSize(line, contentWidth - 10);
    wrapped.forEach((w: string) => {
      pdf.text(w, margin + 5, lineY);
      lineY += 4;
    });
  });

  // ── Page footer ──
  const addFooter = (pageNum: number, totalPages: number) => {
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.muted);
    pdf.text(
      `U-Value Calculation Report — Page ${pageNum} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  };

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    addFooter(i, totalPages);
  }

  // Save
  const filename = `U-Value_${(buildupName || construction.name || 'calculation').replace(/\s+/g, '_')}.pdf`;
  pdf.save(filename);
}
