import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Construction, ConstructionLayer, ClimateData, AnalysisResult } from '@/types/materials';
import { ukMaterialDatabase } from '@/data/ukMaterials';
import { ukMonthlyClimateData } from '@/data/ukClimate';
import { performCondensationAnalysis, calculateUValue, calculateUValueWithoutBridging, calculateGroundFloorUValue } from '@/utils/hygrothermalCalculations';
import { ConstructionBuilder } from '@/components/ConstructionBuilder';
import { ClimateInput } from '@/components/ClimateInput';
import { JunctionCanvas, FloorType } from '@/components/JunctionCanvas';
import { GlastaDiagram, TemperatureProfile } from '@/components/charts/GlastaDiagram';
import { MonthlyAccumulationChart } from '@/components/charts/MonthlyAccumulationChart';
import { ResultsSummary } from '@/components/ResultsSummary';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Layers, BarChart3, FileText, Settings, 
  Play, Building2, Thermometer, Droplets,
  ChevronRight, Menu, X, FileDown, FileType
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Default construction with typical UK cavity wall
const defaultConstruction: Construction = {
  id: 'default',
  name: 'New Construction',
  type: 'wall',
  layers: [
    {
      id: 'layer-1',
      material: ukMaterialDatabase.find(m => m.id === 'plasterboard-std')!,
      thickness: 12.5,
    },
    {
      id: 'layer-2',
      material: ukMaterialDatabase.find(m => m.id === 'mineral-wool')!,
      thickness: 100,
      bridging: {
        material: ukMaterialDatabase.find(m => m.id === 'softwood')!,
        percentage: 15,
      },
    },
    {
      id: 'layer-3',
      material: ukMaterialDatabase.find(m => m.id === 'osb')!,
      thickness: 11,
    },
    {
      id: 'layer-4',
      material: ukMaterialDatabase.find(m => m.id === 'breather-membrane')!,
      thickness: 0.3,
    },
    {
      id: 'layer-5',
      material: ukMaterialDatabase.find(m => m.id === 'brick-clay')!,
      thickness: 102.5,
    },
  ],
  internalSurfaceResistance: 0.13,
  externalSurfaceResistance: 0.04,
};

export default function AnalysisWorkspace() {
  const [construction, setConstruction] = useState<Construction>(defaultConstruction);
  const [climateData, setClimateData] = useState<ClimateData[]>(ukMonthlyClimateData);
  const [selectedRegion, setSelectedRegion] = useState('london');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('construction');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'word'>('pdf');
  const [selectedGlaserMonth, setSelectedGlaserMonth] = useState<string>('worst');
  
  // Floor-specific state
  const [constructionType, setConstructionType] = useState<'wall' | 'floor'>('wall');
  const [floorType, setFloorType] = useState<FloorType>('ground');
  const [perimeter, setPerimeter] = useState<number>(40);
  const [area, setArea] = useState<number>(100);
  
  const glastaDiagramRef = useRef<HTMLDivElement>(null);

  const handleConstructionTypeChange = (type: 'wall' | 'floor', ft?: FloorType, p?: number, a?: number) => {
    setConstructionType(type);
    if (type === 'floor') {
      if (ft) setFloorType(ft);
      if (p !== undefined) setPerimeter(p);
      if (a !== undefined) setArea(a);
      setConstruction(prev => ({ ...prev, type: 'floor' }));
    } else {
      setConstruction(prev => ({ ...prev, type: 'wall' }));
    }
  };

  const runAnalysis = () => {
    if (construction.layers.length === 0) return;
    
    setIsAnalyzing(true);
    
    // Simulate processing delay for UX
    setTimeout(() => {
      try {
        const groundFloorParams = constructionType === 'floor' && (floorType === 'ground' || floorType === 'solid' || floorType === 'suspended')
          ? { perimeter, area, floorType }
          : undefined;
        
        const result = performCondensationAnalysis(construction, climateData, groundFloorParams);
        setAnalysisResult(result);
        setActiveTab('results');
      } catch (error) {
        console.error('Analysis error:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 800);
  };

  const exportReport = async () => {
    if (!analysisResult) return;

    if (exportFormat === 'pdf') {
      await exportPDF();
    } else {
      await exportWord();
    }
  };

  const exportPDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    // Approved Document C color scheme
    const colors = {
      primary: [0, 102, 153] as [number, number, number], // Teal blue
      success: [0, 128, 0] as [number, number, number],
      fail: [220, 53, 69] as [number, number, number],
      header: [43, 57, 72] as [number, number, number],
      text: [51, 51, 51] as [number, number, number],
      muted: [119, 119, 119] as [number, number, number],
      border: [200, 200, 200] as [number, number, number],
      lightBg: [245, 247, 250] as [number, number, number],
    };

    // ==================== COVER PAGE ====================
    // Header bar
    pdf.setFillColor(...colors.primary);
    pdf.rect(0, 0, pageWidth, 35, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Condensation Risk Analysis', margin, 23);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('BS EN ISO 13788 Compliant Report', margin, 30);
    
    // Status badge
    let y = 55;
    const isPass = analysisResult!.overallResult === 'pass';
    pdf.setFillColor(...(isPass ? colors.success : colors.fail));
    pdf.roundedRect(margin, y - 10, 50, 16, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(isPass ? 'PASS' : 'FAIL', margin + 25, y, { align: 'center' });
    
    pdf.setTextColor(...colors.text);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(isPass ? 'Structure is free of condensation.' : (analysisResult!.failureReason || 'Structure fails condensation criteria.'), margin + 55, y);
    
    // Summary info
    y = 85;
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y - 5, contentWidth, 35, 3, 3, 'F');
    
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.muted);
    pdf.text('Calculation Method:', margin + 5, y + 5);
    pdf.text('Internal Conditions:', margin + 5, y + 12);
    pdf.text('External Conditions:', margin + 5, y + 19);
    pdf.text('Generated:', margin + 5, y + 26);
    
    pdf.setTextColor(...colors.text);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ISO 13788 (Glaser Method)', margin + 45, y + 5);
    pdf.text('ISO 13788 Annex C - Normal Occupancy', margin + 45, y + 12);
    pdf.text('BS5250 Climate Data', margin + 45, y + 19);
    pdf.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), margin + 45, y + 26);
    
    // ==================== CONSTRUCTION DETAILS ====================
    y = 135;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(...colors.header);
    pdf.text('Construction Details - Cross Section', margin, y);
    
    y += 8;
    
    // Labels for surfaces
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.primary);
    pdf.text('Outer Surface', margin, y + 5);
    
    y += 10;
    
    // Draw construction cross-section with labels (horizontal like reference image)
    const sectionStartY = y;
    const layerWidth = contentWidth;
    
    // Material patterns and colors
    const getMaterialPattern = (category: string): { color: [number, number, number]; pattern: string } => {
      switch (category) {
        case 'masonry':
          return { color: [205, 92, 92], pattern: 'brick' };
        case 'insulation':
          return { color: [255, 200, 150], pattern: 'dots' };
        case 'concrete':
          return { color: [169, 169, 169], pattern: 'solid' };
        case 'timber':
          return { color: [210, 180, 140], pattern: 'wood' };
        case 'membrane':
          return { color: [100, 149, 237], pattern: 'lines' };
        case 'plasterboard':
          return { color: [245, 245, 220], pattern: 'solid' };
        case 'metal':
          return { color: [192, 192, 192], pattern: 'metallic' };
        case 'airgap':
          return { color: [240, 248, 255], pattern: 'air' };
        case 'render':
          return { color: [222, 184, 135], pattern: 'solid' };
        case 'cladding':
          return { color: [139, 69, 19], pattern: 'wood' };
        default:
          return { color: [200, 200, 200], pattern: 'solid' };
      }
    };
    
    let currentY = y;
    const totalThickness = construction.layers.reduce((sum, l) => sum + l.thickness, 0);
    const maxLayerHeight = 80; // Max height for the cross-section
    const scale = Math.min(0.2, maxLayerHeight / totalThickness);
    
    construction.layers.forEach((layer, idx) => {
      const layerHeight = Math.max(layer.thickness * scale, 12);
      const { color, pattern } = getMaterialPattern(layer.material.category);
      
      // Draw layer rectangle
      pdf.setFillColor(...color);
      pdf.rect(margin, currentY, layerWidth, layerHeight, 'F');
      
      // Add patterns
      pdf.setDrawColor(100, 100, 100);
      pdf.setLineWidth(0.1);
      
      if (pattern === 'brick') {
        for (let py = currentY; py < currentY + layerHeight; py += 3) {
          pdf.line(margin, py, margin + layerWidth, py);
          const offset = (Math.floor((py - currentY) / 3) % 2) * 10;
          for (let px = margin + offset; px < margin + layerWidth; px += 20) {
            pdf.line(px, py, px, Math.min(py + 3, currentY + layerHeight));
          }
        }
      } else if (pattern === 'dots') {
        for (let py = currentY + 2; py < currentY + layerHeight - 1; py += 4) {
          for (let px = margin + 3; px < margin + layerWidth - 2; px += 6) {
            pdf.circle(px, py, 0.5, 'F');
          }
        }
      }
      
      // Bridging indication
      if (layer.bridging) {
        pdf.setFillColor(80, 80, 80);
        const studWidth = 3;
        const studSpacing = 30;
        for (let sx = margin + 15; sx < margin + layerWidth - 10; sx += studSpacing) {
          pdf.rect(sx, currentY, studWidth, layerHeight, 'F');
        }
      }
      
      // Border
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, currentY, layerWidth, layerHeight);
      
      // Layer label inside the layer
      pdf.setFontSize(7);
      pdf.setTextColor(0, 0, 0);
      let labelText = `${layer.thickness}mm ${layer.material.name}`;
      if (layer.bridging) {
        labelText += ` (${layer.bridging.percentage}% ${layer.bridging.material.name})`;
      }
      pdf.text(labelText, margin + 3, currentY + layerHeight / 2 + 2);
      
      currentY += layerHeight;
    });
    
    // Inner surface label
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.success);
    pdf.text('Inner Surface', margin, currentY + 8);
    
    y = currentY + 15;
    
    // Construction table with correct Greek symbols
    pdf.setFillColor(...colors.primary);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Layer', margin + 2, y + 5.5);
    pdf.text('Material', margin + 20, y + 5.5);
    pdf.text('Thickness (mm)', margin + 90, y + 5.5);
    // Use proper text for symbols since jsPDF doesn't support Greek well
    pdf.text('Conductivity', margin + 120, y + 5.5);
    pdf.text('Vapour Res.', margin + 148, y + 5.5);
    
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.text);
    
    construction.layers.forEach((layer, i) => {
      const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
      pdf.setFillColor(...(rowColor as [number, number, number]));
      pdf.rect(margin, y, contentWidth, 7, 'F');
      
      pdf.setFontSize(8);
      pdf.text(`${i + 1}`, margin + 2, y + 5);
      let materialName = layer.material.name;
      if (layer.bridging) {
        materialName += ` (${layer.bridging.percentage}% ${layer.bridging.material.name})`;
      }
      pdf.text(materialName.substring(0, 40), margin + 20, y + 5);
      pdf.text(layer.thickness.toString(), margin + 95, y + 5);
      pdf.text(`${layer.material.thermalConductivity} W/mK`, margin + 120, y + 5);
      pdf.text(`${layer.material.vapourResistivity} MNs/gm`, margin + 148, y + 5);
      
      y += 7;
    });
    
    // U-value summary
    y += 5;
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('U-Value (with bridging):', margin + 5, y + 8);
    pdf.setTextColor(...colors.primary);
    pdf.text(`${analysisResult!.uValue.toFixed(3)} W/m2K`, margin + 55, y + 8);
    
    pdf.setTextColor(...colors.text);
    pdf.text('U-Value (without bridging):', margin + 5, y + 16);
    pdf.setTextColor(...colors.muted);
    pdf.text(`${(analysisResult!.uValueWithoutBridging || analysisResult!.uValue).toFixed(3)} W/m2K`, margin + 60, y + 16);
    
    // ==================== NEW PAGE - RESULTS ====================
    pdf.addPage();
    
    // Header
    pdf.setFillColor(...colors.primary);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Detailed Results: Surface Condensation', margin, 10);
    
    y = 25;
    
    // Surface condensation table (like the reference image)
    pdf.setFillColor(...colors.primary);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    
    const cols = ['Month', 'Ext Temp', 'Ext RH (%)', 'Int Temp', 'Int RH (%)', 'Min Temp Factor', 'Min Tsi', 'Tsi'];
    const colWidths = [20, 20, 22, 20, 22, 28, 22, 22];
    let colX = margin;
    cols.forEach((col, i) => {
      pdf.text(col, colX + 2, y + 5.5);
      colX += colWidths[i];
    });
    
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.text);
    
    const surfaceData = analysisResult!.surfaceCondensationData || [];
    climateData.forEach((month, i) => {
      const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
      pdf.setFillColor(...(rowColor as [number, number, number]));
      pdf.rect(margin, y, contentWidth, 6, 'F');
      
      const sd = surfaceData[i];
      colX = margin;
      pdf.setFontSize(7);
      pdf.text(month.month.substring(0, 3), colX + 2, y + 4.5);
      colX += colWidths[0];
      pdf.text(month.externalTemp.toFixed(1), colX + 2, y + 4.5);
      colX += colWidths[1];
      pdf.text(month.externalRH.toString(), colX + 2, y + 4.5);
      colX += colWidths[2];
      pdf.text(month.internalTemp.toFixed(1), colX + 2, y + 4.5);
      colX += colWidths[3];
      pdf.text(month.internalRH.toString(), colX + 2, y + 4.5);
      colX += colWidths[4];
      pdf.text(sd?.minTempFactor.toFixed(3) || '-', colX + 2, y + 4.5);
      colX += colWidths[5];
      pdf.text(sd?.minTsi.toFixed(1) || '-', colX + 2, y + 4.5);
      colX += colWidths[6];
      pdf.text(sd?.tsi.toFixed(1) || '-', colX + 2, y + 4.5);
      
      y += 6;
    });
    
    // Monthly accumulation summary
    y += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...colors.header);
    pdf.text('Monthly Moisture Accumulation', margin, y);
    
    y += 8;
    pdf.setFillColor(...colors.primary);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.text('Month', margin + 2, y + 5.5);
    pdf.text('Condensation (g/m2)', margin + 30, y + 5.5);
    pdf.text('Evaporation (g/m2)', margin + 70, y + 5.5);
    pdf.text('Net (g/m2)', margin + 110, y + 5.5);
    pdf.text('Cumulative (g/m2)', margin + 140, y + 5.5);
    
    y += 8;
    pdf.setFont('helvetica', 'normal');
    
    analysisResult!.monthlyData.forEach((data, i) => {
      const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
      pdf.setFillColor(...(rowColor as [number, number, number]));
      pdf.rect(margin, y, contentWidth, 6, 'F');
      
      pdf.setTextColor(...colors.text);
      pdf.setFontSize(7);
      pdf.text(data.month.substring(0, 3), margin + 2, y + 4.5);
      pdf.text(data.condensationAmount.toFixed(1), margin + 30, y + 4.5);
      pdf.text(data.evaporationAmount.toFixed(1), margin + 70, y + 4.5);
      
      const netColor = data.netAccumulation > 0 ? colors.fail : colors.success;
      pdf.setTextColor(...netColor);
      pdf.text(data.netAccumulation.toFixed(1), margin + 110, y + 4.5);
      
      pdf.setTextColor(...colors.text);
      pdf.text(data.cumulativeAccumulation.toFixed(1), margin + 140, y + 4.5);
      
      y += 6;
    });
    
    // ==================== NEW PAGE - GLASTA DIAGRAM ====================
    pdf.addPage();
    
    // Header
    pdf.setFillColor(...colors.primary);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Glaser Diagram', margin, 10);
    
    // Capture the Glasta diagram
    if (glastaDiagramRef.current) {
      try {
        const canvas = await html2canvas(glastaDiagramRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', margin, 25, contentWidth, contentWidth * 0.6);
      } catch (e) {
        console.error('Failed to capture Glasta diagram', e);
      }
    }
    
    // Standards reference at bottom
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    pdf.text(
      'Analysis performed in accordance with BS EN ISO 13788, BS EN 15026, and Approved Document C of the UK Building Regulations.',
      margin,
      pageHeight - 10
    );
    
    pdf.save('condensation-analysis-report.pdf');
  };

  const exportWord = async () => {
    // Generate HTML content for Word document
    const isPass = analysisResult!.overallResult === 'pass';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; max-width: 800px; margin: 0 auto; }
          h1 { color: #006699; border-bottom: 2px solid #006699; padding-bottom: 10px; }
          h2 { color: #2b3948; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th { background-color: #006699; color: white; padding: 8px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          tr:nth-child(even) { background-color: #f5f7fa; }
          .pass { color: #008000; font-weight: bold; }
          .fail { color: #dc3545; font-weight: bold; }
          .summary-box { background-color: #f5f7fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { font-size: 9pt; color: #777; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>Condensation Risk Analysis Report</h1>
        
        <div class="summary-box">
          <p><strong>Status:</strong> <span class="${isPass ? 'pass' : 'fail'}">${isPass ? 'PASS' : 'FAIL'}</span></p>
          <p><strong>Summary:</strong> ${isPass ? 'Structure is free of condensation.' : analysisResult!.failureReason}</p>
          <p><strong>Calculation Method:</strong> ISO 13788 (Glaser Method)</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
        </div>
        
        <h2>Construction Details</h2>
        <table>
          <tr>
            <th>Layer</th>
            <th>Material</th>
            <th>Thickness (mm)</th>
            <th>Conductivity (W/mK)</th>
            <th>Vapour Resistivity (MNs/gm)</th>
          </tr>
          ${construction.layers.map((layer, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${layer.material.name}${layer.bridging ? ` (${layer.bridging.percentage}% ${layer.bridging.material.name})` : ''}</td>
              <td>${layer.thickness}</td>
              <td>${layer.material.thermalConductivity}</td>
              <td>${layer.material.vapourResistivity}</td>
            </tr>
          `).join('')}
        </table>
        
        <div class="summary-box">
          <p><strong>U-Value (with bridging):</strong> ${analysisResult!.uValue.toFixed(3)} W/m²K</p>
          <p><strong>U-Value (without bridging):</strong> ${(analysisResult!.uValueWithoutBridging || analysisResult!.uValue).toFixed(3)} W/m²K</p>
        </div>
        
        <h2>Monthly Results</h2>
        <table>
          <tr>
            <th>Month</th>
            <th>Ext Temp (°C)</th>
            <th>Ext RH (%)</th>
            <th>Int Temp (°C)</th>
            <th>Int RH (%)</th>
            <th>Cumulative (g/m²)</th>
          </tr>
          ${climateData.map((month, i) => `
            <tr>
              <td>${month.month}</td>
              <td>${month.externalTemp}</td>
              <td>${month.externalRH}</td>
              <td>${month.internalTemp}</td>
              <td>${month.internalRH}</td>
              <td>${analysisResult!.monthlyData[i]?.cumulativeAccumulation.toFixed(1) || 0}</td>
            </tr>
          `).join('')}
        </table>
        
        <div class="footer">
          <p>Analysis performed in accordance with BS EN ISO 13788, BS EN 15026, and Approved Document C of the UK Building Regulations.</p>
        </div>
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'condensation-analysis-report.doc';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">HygroTherm UK</h1>
              <p className="text-xs text-muted-foreground">2D Condensation Risk Analysis</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {construction.layers.length} layers
            </span>
            <span className="flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5" />
              {selectedRegion.charAt(0).toUpperCase() + selectedRegion.slice(1).replace('-', ' ')}
            </span>
          </div>
          
          <Button
            onClick={runAnalysis}
            disabled={construction.layers.length === 0 || isAnalyzing}
            className="glow-primary"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Wider now */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 420, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-r border-border bg-card overflow-hidden shrink-0"
            >
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className="w-full rounded-none border-b border-border h-12 bg-transparent p-0">
                  <TabsTrigger 
                    value="construction" 
                    className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                  >
                    <Layers className="w-4 h-4 mr-2" />
                    Build
                  </TabsTrigger>
                  <TabsTrigger 
                    value="climate" 
                    className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                  >
                    <Thermometer className="w-4 h-4 mr-2" />
                    Climate
                  </TabsTrigger>
                  <TabsTrigger 
                    value="results" 
                    className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                    disabled={!analysisResult}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Results
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-hidden">
                  <TabsContent value="construction" className="h-full m-0 p-4 overflow-auto">
                    <ConstructionBuilder 
                      construction={construction}
                      onChange={setConstruction}
                    />
                  </TabsContent>

                  <TabsContent value="climate" className="h-full m-0 p-4 overflow-auto">
                    <ClimateInput
                      climateData={climateData}
                      onChange={setClimateData}
                      selectedRegion={selectedRegion}
                      onRegionChange={setSelectedRegion}
                    />
                  </TabsContent>

                  <TabsContent value="results" className="h-full m-0 overflow-auto">
                    {analysisResult && (
                      <div className="p-4 space-y-4">
                        <div className={cn(
                          "p-4 rounded-lg text-center",
                          analysisResult.overallResult === 'pass'
                            ? "bg-success/10 border border-success/30"
                            : "bg-destructive/10 border border-destructive/30"
                        )}>
                          <div className={cn(
                            "text-2xl font-bold",
                            analysisResult.overallResult === 'pass' ? "text-success" : "text-destructive"
                          )}>
                            {analysisResult.overallResult === 'pass' ? 'PASS' : 'FAIL'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            U-Value: {analysisResult.uValue} W/m²K
                          </div>
                          {analysisResult.uValueWithoutBridging && analysisResult.uValueWithoutBridging !== analysisResult.uValue && (
                            <div className="text-xs text-muted-foreground">
                              Without bridging: {analysisResult.uValueWithoutBridging} W/m²K
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as 'pdf' | 'word')}>
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pdf">PDF</SelectItem>
                              <SelectItem value="word">Word</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="outline" 
                            className="flex-1"
                            onClick={exportReport}
                          >
                            {exportFormat === 'pdf' ? (
                              <FileDown className="w-4 h-4 mr-2" />
                            ) : (
                              <FileType className="w-4 h-4 mr-2" />
                            )}
                            Export {exportFormat.toUpperCase()} Report
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Canvas Area */}
        <main className="flex-1 overflow-auto p-4 bg-background">
          <div className="h-full flex flex-col gap-4">
            {/* Canvas Section */}
            <JunctionCanvas 
              construction={construction}
              className="flex-shrink-0"
              onConstructionTypeChange={handleConstructionTypeChange}
            />

            {/* Analysis Results */}
            {analysisResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[500px]"
              >
                <div className="flex flex-col gap-4">
                  <div ref={glastaDiagramRef} className="flex-1 min-h-[350px]">
                    <GlastaDiagram 
                      result={analysisResult} 
                      climateData={climateData}
                      selectedMonth={selectedGlaserMonth}
                      onMonthChange={setSelectedGlaserMonth}
                      className="h-full"
                    />
                  </div>
                  <TemperatureProfile result={analysisResult} />
                </div>
                
                <div className="flex flex-col gap-4">
                  <MonthlyAccumulationChart monthlyData={analysisResult.monthlyData} className="flex-1 min-h-[350px]" />
                  <ResultsSummary 
                    result={analysisResult}
                    onExportPDF={exportReport}
                  />
                </div>
              </motion.div>
            )}

            {/* Empty State */}
            {!analysisResult && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Droplets className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Ready to Analyze</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Build your construction layers in the sidebar, configure climate data for your UK region, 
                    then click "Run Analysis" to perform a full condensation risk assessment.
                  </p>
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" />
                      BS EN ISO 13788
                    </span>
                    <span className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" />
                      BS EN 15026
                    </span>
                    <span className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" />
                      Part C / BR 497
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
