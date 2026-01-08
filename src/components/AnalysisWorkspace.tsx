import { useState, useMemo, useRef, useEffect } from 'react';
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
import { ProjectManager } from '@/components/ProjectManager';
import { ReportExportDialog, BuildupForExport } from '@/components/ReportExportDialog';
import { useProjects, BuildupData } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Layers, BarChart3, FileText, Settings, 
  Play, Building2, Thermometer, Droplets,
  ChevronRight, Menu, X, FileDown, FileType, FolderOpen, PanelLeftClose, PanelLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Default construction with typical UK cavity wall
const defaultConstruction: Construction = {
  id: 'default',
  name: 'New Construction',
  type: 'wall',
  layers: [],
  internalSurfaceResistance: 0.13,
  externalSurfaceResistance: 0.04,
};

export default function AnalysisWorkspace() {
  const { user } = useAuth();
  const { projects, currentProject, updateBuildup, createProject, createBuildup } = useProjects();
  
  const [construction, setConstruction] = useState<Construction>(defaultConstruction);
  const [climateData, setClimateData] = useState<ClimateData[]>(ukMonthlyClimateData);
  const [selectedRegion, setSelectedRegion] = useState('london');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('construction');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectPanelOpen, setProjectPanelOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'word'>('pdf');
  const [selectedGlaserMonth, setSelectedGlaserMonth] = useState<string>('worst');
  const [showExportDialog, setShowExportDialog] = useState(false);
  
  // Current buildup tracking
  const [selectedBuildupId, setSelectedBuildupId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // Floor-specific state
  const [constructionType, setConstructionType] = useState<'wall' | 'floor'>('wall');
  const [floorType, setFloorType] = useState<FloorType>('ground');
  const [perimeter, setPerimeter] = useState<number>(40);
  const [area, setArea] = useState<number>(100);
  
  const glastaDiagramRef = useRef<HTMLDivElement>(null);

  // Auto-create first project if none exist
  useEffect(() => {
    const initProject = async () => {
      if (user && projects.length === 0 && !selectedBuildupId) {
        const project = await createProject('My First Project');
        if (project) {
          const buildup = await createBuildup(project.id, { name: 'Build-up 1' });
          if (buildup) {
            setSelectedBuildupId(buildup.id);
            setSelectedProjectId(project.id);
          }
        }
      }
    };
    initProject();
  }, [user, projects.length]);

  // Load buildup data when selection changes
  useEffect(() => {
    if (selectedBuildupId && selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      const buildup = project?.buildups.find(b => b.id === selectedBuildupId);
      
      if (buildup) {
        setConstruction({
          id: buildup.id,
          name: buildup.name,
          type: buildup.construction_type,
          layers: buildup.layers,
          internalSurfaceResistance: 0.13,
          externalSurfaceResistance: 0.04,
        });
        setConstructionType(buildup.construction_type);
        if (buildup.floor_type) setFloorType(buildup.floor_type);
        if (buildup.perimeter) setPerimeter(buildup.perimeter);
        if (buildup.area) setArea(buildup.area);
        setSelectedRegion(buildup.climate_location.toLowerCase());
        setAnalysisResult(null); // Clear previous results
      }
    }
  }, [selectedBuildupId, selectedProjectId, projects]);

  // Auto-save buildup changes
  const handleConstructionChange = (newConstruction: Construction) => {
    setConstruction(newConstruction);
    if (selectedBuildupId) {
      updateBuildup(selectedBuildupId, { layers: newConstruction.layers });
    }
  };

  const handleSelectBuildup = (buildup: BuildupData | null, projectId: string) => {
    if (buildup) {
      setSelectedBuildupId(buildup.id);
      setSelectedProjectId(projectId);
    } else {
      setSelectedBuildupId(null);
    }
  };

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
    
    // Save to database
    if (selectedBuildupId) {
      updateBuildup(selectedBuildupId, {
        construction_type: type,
        floor_type: type === 'floor' ? (ft || floorType) : null,
        perimeter: type === 'floor' ? (p || perimeter) : null,
        area: type === 'floor' ? (a || area) : null,
      });
    }
  };

  const runAnalysis = () => {
    if (construction.layers.length === 0) return;
    
    setIsAnalyzing(true);
    
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

  // Get all buildups for export dialog
  const getAllBuildupsForExport = (): BuildupForExport[] => {
    const allBuildups: BuildupForExport[] = [];
    projects.forEach(project => {
      project.buildups.forEach(buildup => {
        allBuildups.push({
          id: buildup.id,
          name: buildup.name,
          projectName: project.name,
        });
      });
    });
    return allBuildups;
  };

  const handleOpenExportDialog = () => {
    if (!analysisResult) return;
    setShowExportDialog(true);
  };

  const handleExportWithSelection = async (selectedBuildupIds: string[]) => {
    if (exportFormat === 'pdf') {
      await exportPDF(selectedBuildupIds);
    } else {
      await exportWord(selectedBuildupIds);
    }
  };

  // Helper function to wrap text within a max width
  const wrapText = (pdf: jsPDF, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = pdf.getTextWidth(testLine);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  };

  const exportPDF = async (selectedBuildupIds: string[]) => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    const maxTextWidth = contentWidth - 10;
    
    const colors = {
      primary: [0, 102, 153] as [number, number, number],
      success: [0, 128, 0] as [number, number, number],
      fail: [220, 53, 69] as [number, number, number],
      header: [43, 57, 72] as [number, number, number],
      text: [51, 51, 51] as [number, number, number],
      muted: [119, 119, 119] as [number, number, number],
      border: [200, 200, 200] as [number, number, number],
      lightBg: [245, 247, 250] as [number, number, number],
    };

    // Check if any surface condensation occurs
    const hasSurfaceCondensation = analysisResult!.surfaceCondensationData?.some(
      sd => sd.tsi < sd.minTsi
    ) ?? false;

    // Cover page
    pdf.setFillColor(...colors.primary);
    pdf.rect(0, 0, pageWidth, 35, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Condensation Risk Analysis', margin, 23);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('BS EN ISO 13788 Compliant Report', margin, 30);
    
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
    
    // Wrap the status text
    const statusText = isPass ? 'Structure is free of condensation risk.' : (analysisResult!.failureReason || 'Structure fails condensation criteria.');
    const wrappedStatus = wrapText(pdf, statusText, maxTextWidth - 55);
    wrappedStatus.forEach((line, idx) => {
      pdf.text(line, margin + 55, y + (idx * 5));
    });
    
    // Surface condensation statement (BS EN ISO 13788 compliant)
    y = 75;
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.header);
    pdf.text('Surface Condensation Assessment (BS EN ISO 13788):', margin + 5, y + 7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.text);
    if (!hasSurfaceCondensation) {
      pdf.setTextColor(...colors.success);
      pdf.text('No surface condensation risk detected. Mould growth is unlikely under normal conditions.', margin + 5, y + 14);
    } else {
      pdf.setTextColor(...colors.fail);
      pdf.text('Surface condensation risk detected. Mould growth may occur. Remedial action recommended.', margin + 5, y + 14);
    }
    
    y = 100;
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
    
    // Construction details with orientation based on type
    y = 150;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(...colors.header);
    const crossSectionTitle = constructionType === 'floor' ? 'Construction Details - Cross Section (Horizontal)' : 'Construction Details - Cross Section (Vertical)';
    pdf.text(crossSectionTitle, margin, y);
    
    y += 8;
    
    const getMaterialPattern = (category: string): { color: [number, number, number]; pattern: string } => {
      switch (category) {
        case 'masonry': return { color: [205, 92, 92], pattern: 'brick' };
        case 'insulation': return { color: [255, 200, 150], pattern: 'dots' };
        case 'concrete': return { color: [169, 169, 169], pattern: 'solid' };
        case 'timber': return { color: [210, 180, 140], pattern: 'wood' };
        case 'membrane': return { color: [100, 149, 237], pattern: 'lines' };
        case 'plasterboard': return { color: [245, 245, 220], pattern: 'solid' };
        case 'metal': return { color: [192, 192, 192], pattern: 'metallic' };
        case 'airgap': return { color: [240, 248, 255], pattern: 'air' };
        case 'render': return { color: [222, 184, 135], pattern: 'solid' };
        case 'cladding': return { color: [139, 69, 19], pattern: 'wood' };
        default: return { color: [200, 200, 200], pattern: 'solid' };
      }
    };
    
    const totalThickness = construction.layers.reduce((sum, l) => sum + l.thickness, 0);
    
    if (constructionType === 'floor') {
      // Horizontal cross section for floors
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.primary);
      pdf.text('External (Ground)', margin, y + 5);
      
      y += 10;
      let currentY = y;
      const maxLayerHeight = 60;
      const scale = Math.min(0.15, maxLayerHeight / totalThickness);
      
      construction.layers.forEach((layer, idx) => {
        const layerHeight = Math.max(layer.thickness * scale, 10);
        const { color, pattern } = getMaterialPattern(layer.material.category);
        
        pdf.setFillColor(...color);
        pdf.rect(margin, currentY, contentWidth, layerHeight, 'F');
        
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(0.1);
        
        if (pattern === 'brick') {
          for (let py = currentY; py < currentY + layerHeight; py += 3) {
            pdf.line(margin, py, margin + contentWidth, py);
          }
        } else if (pattern === 'dots') {
          for (let py = currentY + 2; py < currentY + layerHeight - 1; py += 4) {
            for (let px = margin + 3; px < margin + contentWidth - 2; px += 6) {
              pdf.circle(px, py, 0.4, 'F');
            }
          }
        }
        
        // Bridging indication with label
        let bridgingNote = '';
        if (layer.bridging) {
          pdf.setFillColor(80, 80, 80);
          const studWidth = 2;
          const studSpacing = 25;
          for (let sx = margin + 15; sx < margin + contentWidth - 10; sx += studSpacing) {
            pdf.rect(sx, currentY, studWidth, layerHeight, 'F');
          }
          bridgingNote = ` [Bridging: ${layer.bridging.percentage}% ${layer.bridging.material.name}]`;
        }
        
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.rect(margin, currentY, contentWidth, layerHeight);
        
        pdf.setFontSize(7);
        pdf.setTextColor(0, 0, 0);
        const labelText = `${layer.thickness}mm ${layer.material.name}${bridgingNote}`;
        const truncatedLabel = labelText.length > 70 ? labelText.substring(0, 67) + '...' : labelText;
        pdf.text(truncatedLabel, margin + 3, currentY + layerHeight / 2 + 2);
        
        currentY += layerHeight;
      });
      
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.success);
      pdf.text('Internal (Room)', margin, currentY + 8);
      y = currentY + 15;
    } else {
      // Vertical cross section for walls
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.success);
      pdf.text('Internal', margin, y + 5);
      
      y += 10;
      const sectionHeight = 50;
      const maxSectionWidth = contentWidth - 40;
      const scale = Math.min(0.3, maxSectionWidth / totalThickness);
      let currentX = margin + 20;
      
      construction.layers.forEach((layer, idx) => {
        const layerWidth = Math.max(layer.thickness * scale, 15);
        const { color, pattern } = getMaterialPattern(layer.material.category);
        
        pdf.setFillColor(...color);
        pdf.rect(currentX, y, layerWidth, sectionHeight, 'F');
        
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(0.1);
        
        if (pattern === 'brick') {
          for (let py = y; py < y + sectionHeight; py += 4) {
            pdf.line(currentX, py, currentX + layerWidth, py);
            const offset = (Math.floor((py - y) / 4) % 2) * 5;
            for (let px = currentX + offset; px < currentX + layerWidth; px += 10) {
              pdf.line(px, py, px, Math.min(py + 4, y + sectionHeight));
            }
          }
        } else if (pattern === 'dots') {
          for (let py = y + 2; py < y + sectionHeight - 1; py += 4) {
            for (let px = currentX + 2; px < currentX + layerWidth - 1; px += 4) {
              pdf.circle(px, py, 0.4, 'F');
            }
          }
        }
        
        // Bridging indication
        if (layer.bridging) {
          pdf.setFillColor(80, 80, 80);
          const bridgeWidth = 2;
          const spacing = 8;
          for (let by = y + 5; by < y + sectionHeight - 5; by += spacing) {
            pdf.rect(currentX + (layerWidth - bridgeWidth) / 2, by, bridgeWidth, 4, 'F');
          }
        }
        
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.rect(currentX, y, layerWidth, sectionHeight);
        
        // Layer label below
        pdf.setFontSize(6);
        pdf.setTextColor(0, 0, 0);
        const shortName = layer.material.name.split(' ').slice(0, 2).join(' ');
        pdf.text(`${layer.thickness}mm`, currentX + layerWidth / 2, y + sectionHeight + 5, { align: 'center' });
        pdf.text(shortName, currentX + layerWidth / 2, y + sectionHeight + 9, { align: 'center' });
        if (layer.bridging) {
          pdf.setFontSize(5);
          pdf.setTextColor(...colors.muted);
          pdf.text(`${layer.bridging.percentage}% bridging`, currentX + layerWidth / 2, y + sectionHeight + 13, { align: 'center' });
        }
        
        currentX += layerWidth;
      });
      
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.primary);
      pdf.text('External', currentX + 5, y + sectionHeight / 2);
      
      y += sectionHeight + 20;
    }
    
    // Layer table
    y += 5;
    pdf.setFillColor(...colors.primary);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Layer', margin + 2, y + 5.5);
    pdf.text('Material', margin + 15, y + 5.5);
    pdf.text('Thick. (mm)', margin + 85, y + 5.5);
    pdf.text('Conductivity', margin + 110, y + 5.5);
    pdf.text('Vapour Res.', margin + 140, y + 5.5);
    pdf.text('Bridging', margin + 165, y + 5.5);
    
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.text);
    
    construction.layers.forEach((layer, i) => {
      const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
      pdf.setFillColor(...(rowColor as [number, number, number]));
      pdf.rect(margin, y, contentWidth, 7, 'F');
      
      pdf.setFontSize(7);
      pdf.text(`${i + 1}`, margin + 2, y + 5);
      const materialName = layer.material.name.substring(0, 35);
      pdf.text(materialName, margin + 15, y + 5);
      pdf.text(layer.thickness.toString(), margin + 90, y + 5);
      pdf.text(`${layer.material.thermalConductivity}`, margin + 115, y + 5);
      pdf.text(`${layer.material.vapourResistivity}`, margin + 145, y + 5);
      pdf.text(layer.bridging ? `${layer.bridging.percentage}%` : '-', margin + 170, y + 5);
      
      y += 7;
    });
    
    y += 5;
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('U-Value (with bridging):', margin + 5, y + 8);
    pdf.setTextColor(...colors.primary);
    pdf.text(`${analysisResult!.uValue.toFixed(3)} W/m²K`, margin + 55, y + 8);
    
    pdf.setTextColor(...colors.text);
    pdf.text('U-Value (without bridging):', margin + 5, y + 16);
    pdf.setTextColor(...colors.muted);
    pdf.text(`${(analysisResult!.uValueWithoutBridging || analysisResult!.uValue).toFixed(3)} W/m²K`, margin + 60, y + 16);
    
    // Results page
    pdf.addPage();
    
    pdf.setFillColor(...colors.primary);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Detailed Results: Surface Condensation', margin, 10);
    
    y = 25;
    
    pdf.setFillColor(...colors.primary);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    
    const cols = ['Month', 'Ext Temp', 'Ext RH', 'Int Temp', 'Int RH', 'fRsi,min', 'Min Tsi', 'Tsi', 'Status'];
    const colWidths = [18, 18, 18, 18, 18, 20, 18, 18, 30];
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
      const isSafe = sd ? sd.tsi >= sd.minTsi : true;
      
      colX = margin;
      pdf.setFontSize(6);
      pdf.setTextColor(...colors.text);
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
      colX += colWidths[7];
      pdf.setTextColor(...(isSafe ? colors.success : colors.fail));
      pdf.text(isSafe ? 'No risk' : 'Risk', colX + 2, y + 4.5);
      
      y += 6;
    });
    
    // Surface condensation summary
    y += 8;
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.header);
    pdf.text('Surface Condensation Assessment per BS EN ISO 13788:', margin + 5, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    if (!hasSurfaceCondensation) {
      pdf.setTextColor(...colors.success);
      pdf.text('No surface condensation occurs. Mould growth is unlikely under the assessed conditions.', margin + 5, y + 12);
    } else {
      pdf.setTextColor(...colors.fail);
      pdf.text('Surface condensation risk detected in one or more months. Remedial action required per Approved Document C.', margin + 5, y + 12);
    }
    
    y += 24;
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
    pdf.text('Condensation (g/m²)', margin + 25, y + 5.5);
    pdf.text('Evaporation (g/m²)', margin + 65, y + 5.5);
    pdf.text('Net (g/m²)', margin + 105, y + 5.5);
    pdf.text('Cumulative (g/m²)', margin + 135, y + 5.5);
    
    y += 8;
    pdf.setFont('helvetica', 'normal');
    
    analysisResult!.monthlyData.forEach((data, i) => {
      const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
      pdf.setFillColor(...(rowColor as [number, number, number]));
      pdf.rect(margin, y, contentWidth, 6, 'F');
      
      pdf.setTextColor(...colors.text);
      pdf.setFontSize(7);
      pdf.text(data.month.substring(0, 3), margin + 2, y + 4.5);
      pdf.text(data.condensationAmount.toFixed(1), margin + 35, y + 4.5);
      pdf.text(data.evaporationAmount.toFixed(1), margin + 75, y + 4.5);
      
      const netColor = data.netAccumulation > 0 ? colors.fail : colors.success;
      pdf.setTextColor(...netColor);
      pdf.text(data.netAccumulation.toFixed(1), margin + 110, y + 4.5);
      
      pdf.setTextColor(...colors.text);
      pdf.text(data.cumulativeAccumulation.toFixed(1), margin + 145, y + 4.5);
      
      y += 6;
    });
    
    // Glaser diagram page
    pdf.addPage();
    
    pdf.setFillColor(...colors.primary);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Glaser Diagram - Temperature and Vapour Pressure Profile', margin, 10);
    
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
    
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    const footerLines = wrapText(pdf, 
      'Analysis performed in accordance with BS EN ISO 13788, BS EN 15026, and Approved Document C of the UK Building Regulations. Temperature profile shows gradient from external to internal surface through each construction layer.',
      contentWidth
    );
    footerLines.forEach((line, idx) => {
      pdf.text(line, margin, pageHeight - 15 + (idx * 4));
    });
    
    pdf.save('condensation-analysis-report.pdf');
  };

  const exportWord = async (selectedBuildupIds: string[]) => {
    const isPass = analysisResult!.overallResult === 'pass';
    const hasSurfaceCondensation = analysisResult!.surfaceCondensationData?.some(
      sd => sd.tsi < sd.minTsi
    ) ?? false;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #006699; border-bottom: 2px solid #006699; padding-bottom: 10px; }
          h2 { color: #2b3948; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th { background-color: #006699; color: white; padding: 8px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; word-wrap: break-word; max-width: 200px; }
          tr:nth-child(even) { background-color: #f5f7fa; }
          .pass { color: #008000; font-weight: bold; }
          .fail { color: #dc3545; font-weight: bold; }
          .summary-box { background-color: #f5f7fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .surface-status { padding: 10px; border-radius: 5px; margin: 15px 0; }
          .surface-pass { background-color: #d4edda; color: #155724; }
          .surface-fail { background-color: #f8d7da; color: #721c24; }
          .footer { font-size: 9pt; color: #777; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>Condensation Risk Analysis Report</h1>
        
        <div class="summary-box">
          <p><strong>Status:</strong> <span class="${isPass ? 'pass' : 'fail'}">${isPass ? 'PASS' : 'FAIL'}</span></p>
          <p><strong>Summary:</strong> ${isPass ? 'Structure is free of condensation risk.' : analysisResult!.failureReason}</p>
          <p><strong>Calculation Method:</strong> ISO 13788 (Glaser Method)</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
        </div>
        
        <div class="surface-status ${!hasSurfaceCondensation ? 'surface-pass' : 'surface-fail'}">
          <strong>Surface Condensation Assessment (BS EN ISO 13788):</strong><br/>
          ${!hasSurfaceCondensation 
            ? 'No surface condensation risk detected. Mould growth is unlikely under normal conditions.' 
            : 'Surface condensation risk detected. Mould growth may occur. Remedial action recommended per Approved Document C.'}
        </div>
        
        <h2>Construction Details ${constructionType === 'floor' ? '(Horizontal Cross Section)' : '(Vertical Cross Section)'}</h2>
        <table>
          <tr>
            <th>Layer</th>
            <th>Material</th>
            <th>Thickness (mm)</th>
            <th>Conductivity (W/mK)</th>
            <th>Vapour Resistivity (MNs/gm)</th>
            <th>Bridging</th>
          </tr>
          ${construction.layers.map((layer, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${layer.material.name}</td>
              <td>${layer.thickness}</td>
              <td>${layer.material.thermalConductivity}</td>
              <td>${layer.material.vapourResistivity}</td>
              <td>${layer.bridging ? `${layer.bridging.percentage}% ${layer.bridging.material.name}` : '-'}</td>
            </tr>
          `).join('')}
        </table>
        
        <div class="summary-box">
          <p><strong>U-Value (with bridging):</strong> ${analysisResult!.uValue.toFixed(3)} W/m²K</p>
          <p><strong>U-Value (without bridging):</strong> ${(analysisResult!.uValueWithoutBridging || analysisResult!.uValue).toFixed(3)} W/m²K</p>
        </div>
        
        <h2>Surface Condensation Analysis</h2>
        <table>
          <tr>
            <th>Month</th>
            <th>Ext Temp (°C)</th>
            <th>Ext RH (%)</th>
            <th>Int Temp (°C)</th>
            <th>Int RH (%)</th>
            <th>fRsi,min</th>
            <th>Min Tsi (°C)</th>
            <th>Tsi (°C)</th>
            <th>Status</th>
          </tr>
          ${climateData.map((month, i) => {
            const sd = analysisResult!.surfaceCondensationData?.[i];
            const isSafe = sd ? sd.tsi >= sd.minTsi : true;
            return `
              <tr>
                <td>${month.month}</td>
                <td>${month.externalTemp}</td>
                <td>${month.externalRH}</td>
                <td>${month.internalTemp}</td>
                <td>${month.internalRH}</td>
                <td>${sd?.minTempFactor.toFixed(3) || '-'}</td>
                <td>${sd?.minTsi.toFixed(1) || '-'}</td>
                <td>${sd?.tsi.toFixed(1) || '-'}</td>
                <td style="color: ${isSafe ? '#008000' : '#dc3545'}">${isSafe ? 'No risk' : 'Risk'}</td>
              </tr>
            `;
          }).join('')}
        </table>
        
        <h2>Monthly Moisture Accumulation</h2>
        <table>
          <tr>
            <th>Month</th>
            <th>Condensation (g/m²)</th>
            <th>Evaporation (g/m²)</th>
            <th>Net (g/m²)</th>
            <th>Cumulative (g/m²)</th>
          </tr>
          ${analysisResult!.monthlyData.map((data, i) => `
            <tr>
              <td>${data.month}</td>
              <td>${data.condensationAmount.toFixed(1)}</td>
              <td>${data.evaporationAmount.toFixed(1)}</td>
              <td style="color: ${data.netAccumulation > 0 ? '#dc3545' : '#008000'}">${data.netAccumulation.toFixed(1)}</td>
              <td>${data.cumulativeAccumulation.toFixed(1)}</td>
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
    <>
      <ReportExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        buildups={getAllBuildupsForExport()}
        currentBuildupId={selectedBuildupId}
        exportFormat={exportFormat}
        onExport={handleExportWithSelection}
      />
      
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setProjectPanelOpen(!projectPanelOpen)}
          >
            {projectPanelOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
          </Button>
          
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
        {/* Project Panel */}
        <AnimatePresence>
          {projectPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 overflow-hidden"
            >
              <ProjectManager 
                onSelectBuildup={handleSelectBuildup}
                selectedBuildupId={selectedBuildupId}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar */}
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
                      onChange={handleConstructionChange}
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
                            onClick={handleOpenExportDialog}
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
                    onExportPDF={handleOpenExportDialog}
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
