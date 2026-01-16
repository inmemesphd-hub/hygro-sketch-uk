import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Construction, ConstructionLayer, ClimateData, AnalysisResult } from '@/types/materials';
import { ukMaterialDatabase } from '@/data/ukMaterials';
import { ukMonthlyClimateData, getCityClimateData, ukCities, HumidityClass, reorderToOctSep } from '@/data/ukClimate';
import { performCondensationAnalysis, calculateUValue, calculateUValueWithoutBridging, calculateGroundFloorUValue } from '@/utils/hygrothermalCalculations';
import { ConstructionBuilder } from '@/components/ConstructionBuilder';
import { ClimateInput } from '@/components/ClimateInput';
import { JunctionCanvas, FloorType } from '@/components/JunctionCanvas';
import { GlastaDiagram, TemperatureProfile } from '@/components/charts/GlastaDiagram';
import { MonthlyAccumulationChart } from '@/components/charts/MonthlyAccumulationChart';
import { ResultsSummary } from '@/components/ResultsSummary';
import { DetailedResultsPanel } from '@/components/DetailedResultsPanel';
import { ProjectManager } from '@/components/ProjectManager';
import { BuildupSelectionDialog } from '@/components/BuildupSelectionDialog';
import { useProjects, BuildupData, ProjectData } from '@/hooks/useProjects';
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
  const [humidityClass, setHumidityClass] = useState<HumidityClass>(3);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState('construction');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectPanelOpen, setProjectPanelOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'word'>('pdf');
  const [selectedGlaserMonth, setSelectedGlaserMonth] = useState<string>('worst');
  const [showBuildupSelectionDialog, setShowBuildupSelectionDialog] = useState(false);
  const [multiAnalysisResults, setMultiAnalysisResults] = useState<Map<string, AnalysisResult>>(new Map());
  
  // Current buildup tracking
  const [selectedBuildupId, setSelectedBuildupId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // Floor-specific state
  const [constructionType, setConstructionType] = useState<'wall' | 'floor'>('wall');
  const [floorType, setFloorType] = useState<FloorType>('ground');
  const [perimeter, setPerimeter] = useState<number>(40);
  const [area, setArea] = useState<number>(100);
  const [wallThickness, setWallThickness] = useState<number>(0.3);
  const [soilConductivity, setSoilConductivity] = useState<number>(2.0);
  
  // Delay chart rendering until animation completes
  const [chartsReady, setChartsReady] = useState(false);
  
  const glastaDiagramRef = useRef<HTMLDivElement>(null);

  // Wait for animation to complete before rendering charts
  useEffect(() => {
    if (analysisResult) {
      setChartsReady(false);
      const timer = setTimeout(() => setChartsReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setChartsReady(false);
    }
  }, [analysisResult]);

  // Auto-select first project/buildup if none selected (don't auto-create multiple)
  useEffect(() => {
    const initProject = async () => {
      if (user && !selectedBuildupId) {
        if (projects.length === 0) {
          // Only create if no projects exist
          const project = await createProject('My First Project');
          if (project) {
            const buildup = await createBuildup(project.id, { name: 'Build-up 1' });
            if (buildup) {
              setSelectedBuildupId(buildup.id);
              setSelectedProjectId(project.id);
            }
          }
        } else if (projects.length > 0 && projects[0].buildups.length > 0) {
          // Auto-select first available buildup
          setSelectedBuildupId(projects[0].buildups[0].id);
          setSelectedProjectId(projects[0].id);
        }
      }
    };
    initProject();
  }, [user, projects.length, selectedBuildupId]);

  // Load buildup data when selection changes
  useEffect(() => {
    if (selectedBuildupId && selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      const buildup = project?.buildups.find(b => b.id === selectedBuildupId);
      
      if (buildup) {
        // Set correct surface resistances based on construction type per BS EN ISO 6946/13370
        const isFloorType = buildup.construction_type === 'floor';
        setConstruction({
          id: buildup.id,
          name: buildup.name,
          type: buildup.construction_type,
          layers: buildup.layers,
          internalSurfaceResistance: isFloorType ? 0.17 : 0.13,
          externalSurfaceResistance: isFloorType ? 0.00 : 0.04,
        });
        setConstructionType(buildup.construction_type);
        if (buildup.floor_type) setFloorType(buildup.floor_type);
        if (buildup.perimeter) setPerimeter(buildup.perimeter);
        if (buildup.area) setArea(buildup.area);
        
        // Update region, humidity class, and climate data
        const regionId = buildup.climate_location.toLowerCase();
        setSelectedRegion(regionId);
        const buildupHumidityClass = buildup.humidity_class || 3;
        setHumidityClass(buildupHumidityClass);
        setClimateData(getCityClimateData(regionId, buildupHumidityClass));
        
        // Only clear results if we're switching to a buildup without cached results
        // and NOT currently in the results tab
        if (activeTab !== 'results') {
          const cachedResult = multiAnalysisResults.get(buildup.id);
          if (cachedResult) {
            setAnalysisResult(cachedResult);
          } else {
            setAnalysisResult(null);
          }
        }
      }
    }
  }, [selectedBuildupId, selectedProjectId, projects, activeTab, multiAnalysisResults]);

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

  const handleConstructionTypeChange = (
    type: 'wall' | 'floor', 
    ft?: FloorType, 
    p?: number, 
    a?: number,
    w?: number,
    st?: string,
    sc?: number
  ) => {
    setConstructionType(type);
    if (type === 'floor') {
      if (ft) setFloorType(ft);
      if (p !== undefined) setPerimeter(p);
      if (a !== undefined) setArea(a);
      if (w !== undefined) setWallThickness(w);
      if (sc !== undefined) setSoilConductivity(sc);
      // Set floor-specific surface resistances per BS EN ISO 6946/13370
      setConstruction(prev => ({ 
        ...prev, 
        type: 'floor',
        internalSurfaceResistance: 0.17,
        externalSurfaceResistance: 0.00,
      }));
    } else {
      // Wall surface resistances per BS EN ISO 6946
      setConstruction(prev => ({ 
        ...prev, 
        type: 'wall',
        internalSurfaceResistance: 0.13,
        externalSurfaceResistance: 0.04,
      }));
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

  const handleRunAnalysisClick = () => {
    if (construction.layers.length === 0) return;
    setShowBuildupSelectionDialog(true);
  };

  const runAnalysisForBuildups = (buildupIds: string[]) => {
    if (buildupIds.length === 0) return;
    
    setIsAnalyzing(true);
    
    setTimeout(() => {
      try {
        const results = new Map<string, AnalysisResult>();
        const project = projects.find(p => p.id === selectedProjectId);
        
        for (const buildupId of buildupIds) {
          const buildup = project?.buildups.find(b => b.id === buildupId);
          if (!buildup || buildup.layers.length === 0) continue;
          
          // Set correct surface resistances based on construction type per BS EN ISO 6946/13370
          const isFloorType = buildup.construction_type === 'floor';
          const buildupConstruction: Construction = {
            id: buildup.id,
            name: buildup.name,
            type: buildup.construction_type,
            layers: buildup.layers,
            internalSurfaceResistance: isFloorType ? 0.17 : 0.13,
            externalSurfaceResistance: isFloorType ? 0.00 : 0.04,
          };
          
          const groundFloorParams = buildup.construction_type === 'floor' && 
            (buildup.floor_type === 'ground' || buildup.floor_type === 'solid' || buildup.floor_type === 'suspended')
            ? { perimeter: buildup.perimeter || 40, area: buildup.area || 100, floorType: buildup.floor_type as 'ground' | 'suspended' | 'solid' | 'intermediate' }
            : undefined;
          
          // Reorder climate data to Oct-Sep for analysis
          const octSepClimateData = reorderToOctSep(climateData);
          const result = performCondensationAnalysis(buildupConstruction, octSepClimateData, groundFloorParams);
          results.set(buildupId, result);
        }
        
        setMultiAnalysisResults(results);
        
        // Set the first buildup's result as the current analysisResult
        if (selectedBuildupId && results.has(selectedBuildupId)) {
          setAnalysisResult(results.get(selectedBuildupId)!);
        } else if (results.size > 0) {
          const firstResult = results.values().next().value;
          setAnalysisResult(firstResult);
        }
        
        setActiveTab('results');
      } catch (error) {
        console.error('Analysis error:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 800);
  };

  // Legacy single-buildup analysis
  const runAnalysis = () => {
    if (construction.layers.length === 0) return;
    
    setIsAnalyzing(true);
    
    setTimeout(() => {
      try {
        const groundFloorParams = constructionType === 'floor' && (floorType === 'ground' || floorType === 'solid' || floorType === 'suspended')
          ? { perimeter, area, floorType }
          : undefined;
        
        // Reorder climate data to Oct-Sep for analysis
        const octSepClimateData = reorderToOctSep(climateData);
        const result = performCondensationAnalysis(construction, octSepClimateData, groundFloorParams);
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
    const maxTextWidth = contentWidth - 10; // Extra padding for text
    
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

    // Helper to wrap text
    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      pdf.setFontSize(fontSize);
      return pdf.splitTextToSize(text, maxWidth);
    };

    // Get all buildups to export
    const project = projects.find(p => p.id === selectedProjectId);
    const buildupsToExport = Array.from(multiAnalysisResults.keys())
      .map(id => project?.buildups.find(b => b.id === id))
      .filter(Boolean) as BuildupData[];
    
    // If no multi-results, export current only
    if (buildupsToExport.length === 0 && analysisResult) {
      buildupsToExport.push({
        id: selectedBuildupId || 'current',
        name: construction.name,
        construction_type: constructionType,
        floor_type: floorType,
        layers: construction.layers,
      } as BuildupData);
    }

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
    
    let y = 50;
    
    // Project info
    if (project) {
      pdf.setTextColor(...colors.header);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Project: ${project.name}`, margin, y);
      y += 8;
    }
    
    pdf.setTextColor(...colors.muted);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Build-ups included: ${buildupsToExport.length}`, margin, y);
    y += 5;
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, y);
    y += 15;
    
    // Summary for each buildup
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y - 5, contentWidth, 8 + buildupsToExport.length * 8, 3, 3, 'F');
    
    pdf.setTextColor(...colors.header);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Build-up Summary', margin + 5, y + 3);
    y += 10;
    
    buildupsToExport.forEach((buildup, idx) => {
      const result = multiAnalysisResults.get(buildup.id) || analysisResult;
      if (!result) return;
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const isPass = result.overallResult === 'pass';
      
      pdf.setTextColor(...colors.text);
      pdf.text(`${idx + 1}. ${buildup.name}`, margin + 5, y);
      
      pdf.setTextColor(...(isPass ? colors.success : colors.fail));
      pdf.text(isPass ? 'PASS' : 'FAIL', margin + 100, y);
      
      pdf.setTextColor(...colors.muted);
      pdf.text(`U-Value: ${result.uValue.toFixed(3)} W/m²K`, margin + 120, y);
      
      y += 7;
    });
    
    y += 10;
    
    // Reference info
    pdf.setFillColor(...colors.lightBg);
    pdf.roundedRect(margin, y - 5, contentWidth, 25, 3, 3, 'F');
    
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.muted);
    pdf.text('Calculation Method:', margin + 5, y + 3);
    pdf.text('Internal Conditions:', margin + 5, y + 10);
    pdf.text('External Conditions:', margin + 5, y + 17);
    
    const selectedCityName = ukCities.find(c => c.id === selectedRegion)?.name || selectedRegion;
    pdf.setTextColor(...colors.text);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ISO 13788 (Glaser Method)', margin + 45, y + 3);
    pdf.text('ISO 13788 Annex C - Normal Occupancy', margin + 45, y + 10);
    pdf.text(`BS5250 Climate Data - ${selectedCityName}`, margin + 45, y + 17);

    // Now generate pages for each buildup
    for (const buildup of buildupsToExport) {
      const result = multiAnalysisResults.get(buildup.id) || analysisResult;
      if (!result) continue;
      
      const buildupConstruction = {
        layers: buildup.layers,
        type: buildup.construction_type,
      };
      const isFloor = buildup.construction_type === 'floor';

      // Construction details page
      pdf.addPage();
      
      pdf.setFillColor(...colors.primary);
      pdf.rect(0, 0, pageWidth, 15, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${buildup.name} - Construction Details`, margin, 10);
      
      y = 25;
      
      // Overall status
      const isPass = result.overallResult === 'pass';
      pdf.setFillColor(...(isPass ? colors.success : colors.fail));
      pdf.roundedRect(margin, y - 5, 50, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(isPass ? 'PASS' : 'FAIL', margin + 25, y + 3, { align: 'center' });
      
      pdf.setTextColor(...colors.text);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const statusText = isPass ? 'Construction complies with BS EN ISO 13788.' : (result.failureReason || 'Construction fails condensation criteria.');
      const wrappedStatus = wrapText(statusText, maxTextWidth - 60, 10);
      pdf.text(wrappedStatus, margin + 55, y + 3);
      
      y += 20;
      
      // Cross section - orientation based on construction type
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...colors.header);
      pdf.text('Construction Cross Section', margin, y);
      
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
      
      if (!isFloor) {
        // HORIZONTAL cross-section for walls: Internal on LEFT, External on RIGHT
        const totalThickness = buildup.layers.reduce((sum, l) => sum + l.thickness, 0);
        const maxLayerWidth = contentWidth - 35;
        const scale = Math.min(0.15, maxLayerWidth / totalThickness);
        const layerHeight = 30;
        const labelY = y + 10 + layerHeight / 2 + 3; // Aligned label position
        
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.success);
        pdf.text('Internal', margin, labelY);
        
        y += 10;
        
        let currentX = margin + 18;
        
        // Draw layers in order: first layer (internal side) on left, last layer (external side) on right
        buildup.layers.forEach((layer, idx) => {
          const layerWidth = Math.max(layer.thickness * scale, 15);
          const { color, pattern } = getMaterialPattern(layer.material.category);
          
          pdf.setFillColor(...color);
          pdf.rect(currentX, y, layerWidth, layerHeight, 'F');
          
          pdf.setDrawColor(100, 100, 100);
          pdf.setLineWidth(0.1);
          
          if (pattern === 'brick') {
            for (let px = currentX; px < currentX + layerWidth; px += 4) {
              pdf.line(px, y, px, y + layerHeight);
              const offset = (Math.floor((px - currentX) / 4) % 2) * 3;
              for (let py = y + offset; py < y + layerHeight; py += 6) {
                pdf.line(px, py, Math.min(px + 4, currentX + layerWidth), py);
              }
            }
          } else if (pattern === 'dots') {
            for (let px = currentX + 3; px < currentX + layerWidth - 2; px += 5) {
              for (let py = y + 3; py < y + layerHeight - 2; py += 5) {
                pdf.circle(px, py, 0.5, 'F');
              }
            }
          }
          
          // Bridging indication
          if (layer.bridging) {
            pdf.setFillColor(80, 80, 80);
            const studHeight = 3;
            for (let sy = y + 5; sy < y + layerHeight - 5; sy += 10) {
              pdf.rect(currentX, sy, layerWidth, studHeight, 'F');
            }
          }
          
          pdf.setDrawColor(...colors.border);
          pdf.setLineWidth(0.3);
          pdf.rect(currentX, y, layerWidth, layerHeight);
          
          // Label below
          pdf.setFontSize(6);
          pdf.setTextColor(0, 0, 0);
          pdf.text(`${layer.thickness}mm`, currentX + layerWidth / 2, y + layerHeight + 4, { align: 'center' });
          const materialShort = layer.material.name.split(' ').slice(0, 2).join(' ');
          pdf.text(materialShort.substring(0, 12), currentX + layerWidth / 2, y + layerHeight + 8, { align: 'center' });
          if (layer.bridging) {
            pdf.setTextColor(...colors.muted);
            const bridgeMaterialShort = layer.bridging.material.name.split(' ')[0];
            const bridgeLabel = `(${layer.bridging.percentage}% ${bridgeMaterialShort})`;
            pdf.text(bridgeLabel.substring(0, 20), currentX + layerWidth / 2, y + layerHeight + 12, { align: 'center' });
          }
          
          currentX += layerWidth;
        });
        
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.muted);
        pdf.text('External', currentX + 5, y + layerHeight / 2 + 3);
        
        y += layerHeight + 20;
      } else {
        // VERTICAL cross-section for floors: Internal (top) to Ground (bottom)
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.success);
        pdf.text('Internal', margin, y + 5);
        
        y += 10;
        
        let currentY = y;
        const totalThickness = buildup.layers.reduce((sum, l) => sum + l.thickness, 0);
        const maxLayerHeight = 80;
        const scale = Math.min(0.2, maxLayerHeight / totalThickness);
        
        // Draw layers in order (first layer = internal-most, at top)
        buildup.layers.forEach((layer, idx) => {
          const layerHeight = Math.max(layer.thickness * scale, 12);
          const { color, pattern } = getMaterialPattern(layer.material.category);
          
          pdf.setFillColor(...color);
          pdf.rect(margin, currentY, contentWidth, layerHeight, 'F');
          
          pdf.setDrawColor(100, 100, 100);
          pdf.setLineWidth(0.1);
          
          if (pattern === 'brick') {
            for (let py = currentY; py < currentY + layerHeight; py += 3) {
              pdf.line(margin, py, margin + contentWidth, py);
              const offset = (Math.floor((py - currentY) / 3) % 2) * 10;
              for (let px = margin + offset; px < margin + contentWidth; px += 20) {
                pdf.line(px, py, px, Math.min(py + 3, currentY + layerHeight));
              }
            }
          } else if (pattern === 'dots') {
            for (let py = currentY + 2; py < currentY + layerHeight - 1; py += 4) {
              for (let px = margin + 3; px < margin + contentWidth - 2; px += 6) {
                pdf.circle(px, py, 0.5, 'F');
              }
            }
          }
          
          // Bridging indication
          if (layer.bridging) {
            pdf.setFillColor(80, 80, 80);
            const studWidth = 3;
            const studSpacing = 30;
            for (let sx = margin + 15; sx < margin + contentWidth - 10; sx += studSpacing) {
              pdf.rect(sx, currentY, studWidth, layerHeight, 'F');
            }
          }
          
          pdf.setDrawColor(...colors.border);
          pdf.setLineWidth(0.3);
          pdf.rect(margin, currentY, contentWidth, layerHeight);
          
          pdf.setFontSize(7);
          pdf.setTextColor(0, 0, 0);
          let labelText = `${layer.thickness}mm ${layer.material.name}`;
          if (layer.bridging) {
            labelText += ` (${layer.bridging.percentage}% ${layer.bridging.material.name})`;
          }
          // Wrap text if too long instead of truncating
          const labelLines = pdf.splitTextToSize(labelText, contentWidth - 10);
          labelLines.forEach((line: string, lineIdx: number) => {
            pdf.text(line, margin + 3, currentY + layerHeight / 2 + 2 + (lineIdx * 4));
          });
          
          currentY += layerHeight;
        });
        
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.muted);
        pdf.text('Ground', margin, currentY + 8);
        
        y = currentY + 15;
      }
      
      // Layers table
      pdf.setFillColor(...colors.primary);
      pdf.rect(margin, y, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Layer', margin + 2, y + 5.5);
      pdf.text('Material', margin + 15, y + 5.5);
      pdf.text('Thickness', margin + 85, y + 5.5);
      pdf.text('Conductivity', margin + 110, y + 5.5);
      pdf.text('Vapour Res.', margin + 140, y + 5.5);
      
      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colors.text);
      
      buildup.layers.forEach((layer, i) => {
        let materialName = layer.material.name;
        if (layer.bridging) {
          materialName += ` (${layer.bridging.percentage}% ${layer.bridging.material.name})`;
        }
        
        // Wrap text to multiple lines if needed
        const maxMaterialWidth = 65;
        const materialLines = pdf.splitTextToSize(materialName, maxMaterialWidth);
        const rowHeight = Math.max(7, materialLines.length * 5);
        
        const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
        pdf.setFillColor(...(rowColor as [number, number, number]));
        pdf.rect(margin, y, contentWidth, rowHeight, 'F');
        
        pdf.setFontSize(7);
        pdf.text(`${i + 1}`, margin + 2, y + 5);
        
        // Draw wrapped material name
        materialLines.forEach((line: string, lineIdx: number) => {
          pdf.text(line, margin + 15, y + 5 + (lineIdx * 4));
        });
        
        pdf.text(`${layer.thickness} mm`, margin + 85, y + 5);
        pdf.text(`${layer.material.thermalConductivity} W/mK`, margin + 110, y + 5);
        pdf.text(`${layer.material.vapourResistivity} MNs/gm`, margin + 140, y + 5);
        
        y += rowHeight;
      });
      
      y += 5;
      
      // U-Value box
      pdf.setFillColor(...colors.lightBg);
      pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.text);
      pdf.text('U-Value (with bridging):', margin + 5, y + 7);
      pdf.setTextColor(...colors.primary);
      pdf.text(`${result.uValue.toFixed(3)} W/m²K`, margin + 55, y + 7);
      
      pdf.setTextColor(...colors.text);
      pdf.text('U-Value (without bridging):', margin + 5, y + 14);
      pdf.setTextColor(...colors.muted);
      pdf.text(`${(result.uValueWithoutBridging || result.uValue).toFixed(3)} W/m²K`, margin + 60, y + 14);

      // Surface condensation assessment
      y += 25;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...colors.header);
      pdf.text('Surface Condensation Assessment', margin, y);
      
      y += 8;
      
      // Check if surface condensation occurs
      const surfaceData = result.surfaceCondensationData || [];
      const hasSurfaceCondensation = surfaceData.some(s => s.tsi < s.minTsi);
      
      if (!hasSurfaceCondensation) {
        pdf.setFillColor(...colors.success);
        pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('No Surface Condensation Risk', margin + 5, y + 8);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const complianceText = 'In accordance with BS EN ISO 13788, the internal surface temperature (Tsi) remains above the minimum required value (Tsi,min) throughout the year. Mould growth is unlikely.';
        const wrappedCompliance = wrapText(complianceText, contentWidth - 10, 8);
        pdf.text(wrappedCompliance, margin + 5, y + 14);
        y += 25;
      } else {
        pdf.setFillColor(...colors.fail);
        pdf.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Surface Condensation Risk Identified', margin + 5, y + 8);
        y += 18;
      }

      // Results page for this buildup
      pdf.addPage();
      
      pdf.setFillColor(...colors.primary);
      pdf.rect(0, 0, pageWidth, 15, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${buildup.name} - Detailed Results`, margin, 10);
      
      y = 25;
      
      // Surface condensation table
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...colors.header);
      pdf.text('Surface Condensation Analysis', margin, y);
      
      y += 8;
      pdf.setFillColor(...colors.primary);
      pdf.rect(margin, y, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      
      const cols = ['Month', 'Ext °C', 'Ext RH%', 'Int °C', 'Int RH%', 'fRsi,min', 'Tsi,min', 'Tsi'];
      const colWidths = [22, 18, 20, 18, 20, 25, 22, 22];
      let colX = margin;
      cols.forEach((col, i) => {
        pdf.text(col, colX + 2, y + 5.5);
        colX += colWidths[i];
      });
      
      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colors.text);
      
      climateData.forEach((month, i) => {
        const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
        pdf.setFillColor(...(rowColor as [number, number, number]));
        pdf.rect(margin, y, contentWidth, 5.5, 'F');
        
        const sd = surfaceData[i];
        colX = margin;
        pdf.setFontSize(6);
        pdf.text(month.month.substring(0, 3), colX + 2, y + 4);
        colX += colWidths[0];
        pdf.text(month.externalTemp.toFixed(1), colX + 2, y + 4);
        colX += colWidths[1];
        pdf.text(month.externalRH.toString(), colX + 2, y + 4);
        colX += colWidths[2];
        pdf.text(month.internalTemp.toFixed(1), colX + 2, y + 4);
        colX += colWidths[3];
        pdf.text(month.internalRH.toString(), colX + 2, y + 4);
        colX += colWidths[4];
        pdf.text(sd?.minTempFactor.toFixed(3) || '-', colX + 2, y + 4);
        colX += colWidths[5];
        pdf.text(sd?.minTsi.toFixed(1) || '-', colX + 2, y + 4);
        colX += colWidths[6];
        pdf.text(sd?.tsi.toFixed(1) || '-', colX + 2, y + 4);
        
        y += 5.5;
      });
      
      y += 8;
      
      // Monthly moisture table
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...colors.header);
      pdf.text('Monthly Moisture Accumulation', margin, y);
      
      y += 8;
      pdf.setFillColor(...colors.primary);
      pdf.rect(margin, y, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.text('Month', margin + 2, y + 5.5);
      pdf.text('Condensation (g/m²)', margin + 30, y + 5.5);
      pdf.text('Evaporation (g/m²)', margin + 70, y + 5.5);
      pdf.text('Net (g/m²)', margin + 110, y + 5.5);
      pdf.text('Cumulative (g/m²)', margin + 140, y + 5.5);
      
      y += 8;
      pdf.setFont('helvetica', 'normal');
      
      result.monthlyData.forEach((data, i) => {
        const rowColor = i % 2 === 0 ? [255, 255, 255] : colors.lightBg;
        pdf.setFillColor(...(rowColor as [number, number, number]));
        pdf.rect(margin, y, contentWidth, 5.5, 'F');
        
        pdf.setTextColor(...colors.text);
        pdf.setFontSize(7);
        pdf.text(data.month.substring(0, 3), margin + 2, y + 4);
        pdf.text(data.condensationAmount.toFixed(1), margin + 30, y + 4);
        pdf.text(data.evaporationAmount.toFixed(1), margin + 70, y + 4);
        
        const netColor = data.netAccumulation > 0 ? colors.fail : colors.success;
        pdf.setTextColor(...netColor);
        pdf.text(data.netAccumulation.toFixed(1), margin + 110, y + 4);
        
        pdf.setTextColor(...colors.text);
        pdf.text(data.cumulativeAccumulation.toFixed(1), margin + 140, y + 4);
        
        y += 5.5;
      });
      
      // Glaser Diagram page for this specific buildup
      pdf.addPage();
      
      // Use the selected Glaser month from UI, or calculate worst month if 'worst' selected
      let displayMonthForGlaser = selectedGlaserMonth;
      let isWorstMonth = false;
      
      if (selectedGlaserMonth === 'worst') {
        isWorstMonth = true;
        let worstCondensation = 0;
        displayMonthForGlaser = 'January';
        result.monthlyData.forEach((data, idx) => {
          if (data.condensationAmount > worstCondensation) {
            worstCondensation = data.condensationAmount;
            displayMonthForGlaser = climateData[idx]?.month || 'January';
          }
        });
      }
      
      pdf.setFillColor(...colors.primary);
      pdf.rect(0, 0, pageWidth, 15, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${buildup.name} - Glaser Diagram`, margin, 10);
      
      y = 22;
      
      // Month subtitle prominently displayed
      pdf.setFontSize(10);
      pdf.setTextColor(...colors.header);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${displayMonthForGlaser}`, margin, y);
      if (isWorstMonth) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.muted);
        pdf.text(' (Worst case month for condensation)', margin + pdf.getTextWidth(displayMonthForGlaser) + 2, y);
      }
      y += 8;
      
      // Layer color palette function
      const getLayerColor = (category: string, idx: number): [number, number, number] => {
        const categoryColors: Record<string, [number, number, number]> = {
          'masonry': [169, 169, 169],
          'insulation': [255, 218, 185],
          'concrete': [190, 190, 190],
          'timber': [210, 180, 140],
          'membrane': [173, 216, 230],
          'plasterboard': [245, 245, 220],
          'metal': [192, 192, 192],
          'airgap': [240, 248, 255],
          'render': [255, 200, 150],
          'cladding': [205, 133, 63],
          'flooring': [222, 184, 135],
          'glazing': [200, 230, 250],
          'custom': [220, 220, 220],
        };
        const baseColor = categoryColors[category] || [200, 200, 200];
        // Alternate shades for adjacent layers
        if (idx % 2 === 1) {
          return baseColor.map(c => Math.min(255, c + 20)) as [number, number, number];
        }
        return baseColor;
      };
      
      // Get vapour pressure data from result
      const vpData = result.vapourPressureGradient;
      const tempData = result.temperatureGradient;
      
      if (vpData && vpData.length > 1) {
        // Calculate cumulative equivalent air thickness (Sd values)
        let cumulativeSd = 0;
        const sdPositions: { sd: number; layerName: string; position: number }[] = [];
        sdPositions.push({ sd: 0, layerName: 'Internal', position: 0 });
        
        buildup.layers.forEach((layer, idx) => {
          const sdValue = (layer.thickness / 1000) * layer.material.vapourResistivity;
          cumulativeSd += sdValue;
          sdPositions.push({ 
            sd: cumulativeSd, 
            layerName: layer.material.name,
            position: vpData[Math.min(idx + 1, vpData.length - 1)]?.position || 0
          });
        });
        
        const maxSd = cumulativeSd || 1;
        const maxPosition = vpData[vpData.length - 1].position;
        const maxPressure = Math.max(...vpData.map(p => Math.max(p.pressure, p.saturation)));
        const minPressure = Math.min(...vpData.map(p => Math.min(p.pressure, p.saturation)));
        const pressureRange = maxPressure - minPressure || 1;
        
        // Temperature data range
        const tempMin = tempData ? Math.min(...tempData.map(t => t.temperature)) : 0;
        const tempMax = tempData ? Math.max(...tempData.map(t => t.temperature)) : 20;
        const tempRange = tempMax - tempMin || 1;
        
        // Diagram layout - Two charts stacked: Temperature on top, Pressure below
        const tempDiagramHeight = 40;
        const pressureDiagramHeight = 80;
        const diagramWidth = contentWidth - 25;
        const diagramX = margin + 25;
        
        // ===== TEMPERATURE CHART (TOP) =====
        const tempDiagramY = y;
        
        // Draw temperature chart background with material colors
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.rect(diagramX, tempDiagramY, diagramWidth, tempDiagramHeight);
        
        // Draw material layer backgrounds for temp chart - EXTERNAL on LEFT, INTERNAL on RIGHT
        const plotWidth = diagramWidth;
        const narrowTempLayers: {name: string, centerX: number, bottomY: number}[] = [];
        
        // Reverse layers for external-left to internal-right orientation
        const reversedLayers = [...buildup.layers].reverse();
        let layerStartX = diagramX;
        
        reversedLayers.forEach((layer, idx) => {
          const sdValue = (layer.thickness / 1000) * layer.material.vapourResistivity;
          const layerWidth = Math.max((sdValue / maxSd) * plotWidth, 2); // Minimum 2mm width
          const layerColor = getLayerColor(layer.material.category, reversedLayers.length - 1 - idx);
          
          // Draw colored background rectangle
          pdf.setFillColor(...layerColor);
          pdf.rect(layerStartX, tempDiagramY, layerWidth, tempDiagramHeight, 'F');
          
          // Draw black border around each layer
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.3);
          pdf.rect(layerStartX, tempDiagramY, layerWidth, tempDiagramHeight);
          
          // Add vertical material label inside layer (if wide enough)
          const shortName = layer.material.name.slice(0, 12);
          if (layerWidth >= 6) {
            pdf.setFontSize(4);
            pdf.setTextColor(60, 60, 60);
            const centerX = layerStartX + layerWidth / 2;
            const centerY = tempDiagramY + tempDiagramHeight / 2;
            pdf.text(shortName, centerX, centerY, { angle: 90, align: 'center' });
          } else {
            // Track narrow layers for reference
            narrowTempLayers.push({
              name: layer.material.name,
              centerX: layerStartX + layerWidth / 2,
              bottomY: tempDiagramY + tempDiagramHeight
            });
          }
          
          layerStartX += layerWidth;
        });
        
        // Temperature Y-axis label
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.text);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Temperature (°C)', margin, tempDiagramY + tempDiagramHeight / 2, { angle: 90 });
        
        // Temperature Y-axis ticks
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5);
        const tempTicks = 3;
        for (let i = 0; i <= tempTicks; i++) {
          const temp = tempMin + (tempRange * i / tempTicks);
          const yPos = tempDiagramY + tempDiagramHeight - (i / tempTicks) * tempDiagramHeight;
          pdf.setDrawColor(...colors.border);
          pdf.line(diagramX - 2, yPos, diagramX, yPos);
          pdf.text(temp.toFixed(0), diagramX - 3, yPos + 1, { align: 'right' });
        }
        
        // Scale functions for temperature - FLIPPED: External (pos 0) on LEFT, Internal (maxPos) on RIGHT
        const scaleXT = (pos: number) => diagramX + diagramWidth - (pos / maxPosition) * diagramWidth;
        const scaleYT = (temp: number) => tempDiagramY + tempDiagramHeight - ((temp - tempMin) / tempRange) * tempDiagramHeight;
        
        // Draw temperature line (green) - ensure full coverage from external to internal
        if (tempData && tempData.length > 1) {
          pdf.setDrawColor(34, 139, 34); // Forest green
          pdf.setLineWidth(1);
          for (let i = 1; i < tempData.length; i++) {
            pdf.line(
              scaleXT(tempData[i-1].position), scaleYT(tempData[i-1].temperature),
              scaleXT(tempData[i].position), scaleYT(tempData[i].temperature)
            );
          }
          // Extend line to diagram edges if data doesn't cover full range
          if (tempData[0].position > 0) {
            pdf.line(diagramX + diagramWidth, scaleYT(tempData[0].temperature), scaleXT(tempData[0].position), scaleYT(tempData[0].temperature));
          }
          if (tempData[tempData.length - 1].position < maxPosition) {
            pdf.line(scaleXT(tempData[tempData.length - 1].position), scaleYT(tempData[tempData.length - 1].temperature), diagramX, scaleYT(tempData[tempData.length - 1].temperature));
          }
        }
        
        y = tempDiagramY + tempDiagramHeight + 5;
        
        // ===== PRESSURE CHART (BOTTOM) =====
        const pressureDiagramY = y;
        
        // Draw pressure chart background
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.rect(diagramX, pressureDiagramY, diagramWidth, pressureDiagramHeight);
        
        // Draw material layer backgrounds for pressure chart - EXTERNAL on LEFT, INTERNAL on RIGHT
        layerStartX = diagramX;
        const narrowPressureLayers: {name: string, centerX: number, bottomY: number}[] = [];
        reversedLayers.forEach((layer, idx) => {
          const sdValue = (layer.thickness / 1000) * layer.material.vapourResistivity;
          const layerWidth = Math.max((sdValue / maxSd) * plotWidth, 2);
          const layerColor = getLayerColor(layer.material.category, reversedLayers.length - 1 - idx);
          
          // Draw colored background rectangle
          pdf.setFillColor(...layerColor);
          pdf.rect(layerStartX, pressureDiagramY, layerWidth, pressureDiagramHeight, 'F');
          
          // Draw black border around each layer
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.3);
          pdf.rect(layerStartX, pressureDiagramY, layerWidth, pressureDiagramHeight);
          
          // Add vertical material label inside layer (if wide enough)
          const labelText = layer.material.name.length > 20 ? layer.material.name.slice(0, 20) : layer.material.name;
          if (layerWidth >= 8) {
            pdf.setFontSize(5);
            pdf.setTextColor(40, 40, 40);
            const centerX = layerStartX + layerWidth / 2;
            const centerY = pressureDiagramY + pressureDiagramHeight / 2;
            pdf.text(labelText, centerX, centerY, { angle: 90, align: 'center' });
          } else {
            // Track narrow layers for external labeling
            narrowPressureLayers.push({
              name: layer.material.name,
              centerX: layerStartX + layerWidth / 2,
              bottomY: pressureDiagramY + pressureDiagramHeight
            });
          }
          
          layerStartX += layerWidth;
        });
        
        // Pressure Y-axis label
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.text);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Pressure (Pa)', margin, pressureDiagramY + pressureDiagramHeight / 2, { angle: 90 });
        
        // Pressure Y-axis ticks
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5);
        const yTicks = 5;
        for (let i = 0; i <= yTicks; i++) {
          const pressure = minPressure + (pressureRange * i / yTicks);
          const yPos = pressureDiagramY + pressureDiagramHeight - (i / yTicks) * pressureDiagramHeight;
          pdf.setDrawColor(...colors.border);
          pdf.line(diagramX - 2, yPos, diagramX, yPos);
          pdf.text(Math.round(pressure).toString(), diagramX - 3, yPos + 1, { align: 'right' });
        }
        
        // Scale functions for pressure - FLIPPED: External (pos 0) on LEFT, Internal (maxPos) on RIGHT
        const scaleX = (pos: number) => diagramX + diagramWidth - (pos / maxPosition) * diagramWidth;
        const scaleY = (pressure: number) => pressureDiagramY + pressureDiagramHeight - ((pressure - minPressure) / pressureRange) * pressureDiagramHeight;
        
        // Draw saturation pressure line (blue) - ensure full coverage
        pdf.setDrawColor(59, 130, 246);
        pdf.setLineWidth(1);
        for (let i = 1; i < vpData.length; i++) {
          pdf.line(
            scaleX(vpData[i-1].position), scaleY(vpData[i-1].saturation),
            scaleX(vpData[i].position), scaleY(vpData[i].saturation)
          );
        }
        // Extend to diagram edges
        if (vpData[0].position > 0) {
          pdf.line(diagramX + diagramWidth, scaleY(vpData[0].saturation), scaleX(vpData[0].position), scaleY(vpData[0].saturation));
        }
        if (vpData[vpData.length - 1].position < maxPosition) {
          pdf.line(scaleX(vpData[vpData.length - 1].position), scaleY(vpData[vpData.length - 1].saturation), diagramX, scaleY(vpData[vpData.length - 1].saturation));
        }
        
        // Draw vapour pressure line (red) - ensure full coverage
        pdf.setDrawColor(239, 68, 68);
        pdf.setLineWidth(1);
        for (let i = 1; i < vpData.length; i++) {
          pdf.line(
            scaleX(vpData[i-1].position), scaleY(vpData[i-1].pressure),
            scaleX(vpData[i].position), scaleY(vpData[i].pressure)
          );
        }
        // Extend to diagram edges
        if (vpData[0].position > 0) {
          pdf.line(diagramX + diagramWidth, scaleY(vpData[0].pressure), scaleX(vpData[0].position), scaleY(vpData[0].pressure));
        }
        if (vpData[vpData.length - 1].position < maxPosition) {
          pdf.line(scaleX(vpData[vpData.length - 1].position), scaleY(vpData[vpData.length - 1].pressure), diagramX, scaleY(vpData[vpData.length - 1].pressure));
        }
        
        // Find and mark ALL condensation points (where lines cross/meet)
        // This is where partial VP exceeds or equals saturation VP
        const condensationPoints: {x: number, y: number}[] = [];
        
        for (let i = 0; i < vpData.length - 1; i++) {
          const p1 = vpData[i];
          const p2 = vpData[i + 1];
          // Check if lines cross in this segment
          const diff1 = p1.pressure - p1.saturation;
          const diff2 = p2.pressure - p2.saturation;
          
          // Crossing point: lines change from one side to the other
          if ((diff1 <= 0 && diff2 > 0) || (diff1 >= 0 && diff2 < 0)) {
            // Interpolate crossing point
            if (diff1 !== diff2) {
              const t = Math.abs(diff1) / (Math.abs(diff1) + Math.abs(diff2));
              const crossPos = p1.position + t * (p2.position - p1.position);
              const crossPressure = p1.pressure + t * (p2.pressure - p1.pressure);
              condensationPoints.push({
                x: scaleX(crossPos),
                y: scaleY(crossPressure)
              });
            }
          }
          
          // Also mark points where they meet exactly (diff1 === 0)
          if (diff1 === 0) {
            condensationPoints.push({
              x: scaleX(p1.position),
              y: scaleY(p1.pressure)
            });
          }
        }
        
        // Check last point too
        const lastPoint = vpData[vpData.length - 1];
        if (lastPoint.pressure >= lastPoint.saturation) {
          const exists = condensationPoints.some(cp => 
            Math.abs(cp.x - scaleX(lastPoint.position)) < 1 && 
            Math.abs(cp.y - scaleY(lastPoint.pressure)) < 1
          );
          if (!exists) {
            condensationPoints.push({
              x: scaleX(lastPoint.position),
              y: scaleY(lastPoint.pressure)
            });
          }
        }
        
        // Draw ALL condensation markers (red circle with black outline) where lines meet
        condensationPoints.forEach(point => {
          pdf.setFillColor(239, 68, 68);
          pdf.circle(point.x, point.y, 3, 'F');
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.5);
          pdf.circle(point.x, point.y, 3, 'S');
        });
        
        // X-Axis label
        y = pressureDiagramY + pressureDiagramHeight + 10;
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colors.text);
        pdf.text('Cumulative Equivalent Air Thickness (m)', diagramX + diagramWidth / 2, y, { align: 'center' });
        
        // X-Axis tick marks
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5);
        const xTicks = 6;
        for (let i = 0; i <= xTicks; i++) {
          const sdVal = (maxSd * i / xTicks).toFixed(2);
          const xPos = diagramX + (i / xTicks) * diagramWidth;
          pdf.setDrawColor(...colors.border);
          pdf.line(xPos, pressureDiagramY + pressureDiagramHeight, xPos, pressureDiagramY + pressureDiagramHeight + 2);
          pdf.text(sdVal, xPos, pressureDiagramY + pressureDiagramHeight + 6, { align: 'center' });
        }
        
        // Legend
        y += 12;
        pdf.setFontSize(7);
        
        // Temperature legend (green)
        pdf.setDrawColor(34, 139, 34);
        pdf.setLineWidth(1);
        pdf.line(margin, y, margin + 12, y);
        pdf.setTextColor(...colors.text);
        pdf.text('Temperature (°C)', margin + 15, y + 2);
        
        // Saturation VP legend (blue)
        pdf.setDrawColor(59, 130, 246);
        pdf.line(margin + 55, y, margin + 67, y);
        pdf.text('Saturated VP (Pa)', margin + 70, y + 2);
        
        // Partial VP legend (red)
        pdf.setDrawColor(239, 68, 68);
        pdf.line(margin + 115, y, margin + 127, y);
        pdf.text('Partial VP (Pa)', margin + 130, y + 2);
        
        y += 10;
        
        // Condensation zone indicator - unified RED color with BLACK outline matching chart
        if (condensationPoints.length > 0 || vpData.some(p => p.pressure >= p.saturation)) {
          pdf.setFillColor(239, 68, 68);
          pdf.circle(margin + 4, y - 2, 2.5, 'F');
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.4);
          pdf.circle(margin + 4, y - 2, 2.5, 'S');
          pdf.setTextColor(239, 68, 68);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Condensation zone (pv >= psat)', margin + 10, y);
          y += 8;
        }
        
        // Draw compact leader lines for narrow layers - no title, non-overlapping, full text
        if (narrowPressureLayers.length > 0) {
          const leaderBaseY = pressureDiagramY + pressureDiagramHeight + 14;
          const labelSpacing = Math.max(25, (diagramWidth - 20) / narrowPressureLayers.length);
          
          narrowPressureLayers.forEach((item, idx) => {
            // Calculate staggered label position to avoid overlap
            const labelX = diagramX + 5 + (idx * labelSpacing);
            const labelY = leaderBaseY + (idx % 2) * 6; // Stagger vertically
            
            // Short vertical leader from layer center
            pdf.setDrawColor(100, 100, 100);
            pdf.setLineWidth(0.2);
            pdf.line(item.centerX, item.bottomY, item.centerX, leaderBaseY - 2);
            
            // Horizontal line to label
            pdf.line(item.centerX, leaderBaseY - 2, labelX, leaderBaseY - 2);
            pdf.line(labelX, leaderBaseY - 2, labelX, labelY - 2);
            
            // Full text label with larger font - wrap if needed
            pdf.setFontSize(5);
            pdf.setTextColor(60, 60, 60);
            const wrappedText = pdf.splitTextToSize(item.name, 22);
            wrappedText.forEach((line: string, lineIdx: number) => {
              pdf.text(line, labelX + 1, labelY + (lineIdx * 3));
            });
          });
        }

        // Material layers list
        y += 5;
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colors.header);
        pdf.text('Material Layers:', margin, y);
        
        y += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colors.text);
        buildup.layers.forEach((layer, idx) => {
          const sdVal = ((layer.thickness / 1000) * layer.material.vapourResistivity).toFixed(3);
          const text = `${idx + 1}. ${layer.material.name} (${layer.thickness}mm, Sd=${sdVal}m)`;
          const wrappedText = pdf.splitTextToSize(text, contentWidth);
          wrappedText.forEach((line: string) => {
            pdf.text(line, margin, y);
            y += 4;
          });
          if (y > pageHeight - 30) {
            pdf.addPage();
            y = 25;
          }
        });
        
        y += 5;
      } else {
        pdf.setTextColor(...colors.muted);
        pdf.setFontSize(10);
        pdf.text('Vapour pressure data not available for this build-up.', margin, y + 20);
        y += 40;
      }
      
      // Note about diagram
      y += 5;
      pdf.setFontSize(7);
      pdf.setTextColor(...colors.muted);
      const diagramNote = 'Glaser diagram per BS EN ISO 13788. Condensation occurs where partial vapour pressure exceeds saturation pressure. X-axis shows cumulative equivalent air layer thickness (Sd = thickness × μ).';
      const wrappedNote = wrapText(diagramNote, contentWidth, 7);
      pdf.text(wrappedNote, margin, y);
    }
    
    // Footer on last page
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    const footerText = 'Analysis performed in accordance with BS EN ISO 13788, BS EN 15026, and Approved Document C of the UK Building Regulations.';
    const wrappedFooter = wrapText(footerText, contentWidth, 8);
    pdf.text(wrappedFooter, margin, pageHeight - 10);
    
    pdf.save('condensation-analysis-report.pdf');
  };

  const exportWord = async () => {
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
              <p className="text-xs text-muted-foreground">Condensation Risk Analysis</p>
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
            onClick={handleRunAnalysisClick}
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

      {/* Buildup Selection Dialog */}
      <BuildupSelectionDialog
        open={showBuildupSelectionDialog}
        onOpenChange={setShowBuildupSelectionDialog}
        currentProject={projects.find(p => p.id === selectedProjectId) || null}
        currentBuildupId={selectedBuildupId}
        onRunAnalysis={runAnalysisForBuildups}
      />

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
                      onChange={(data) => {
                        setClimateData(data);
                        // Save region to buildup
                        if (selectedBuildupId) {
                          updateBuildup(selectedBuildupId, { climate_location: selectedRegion });
                        }
                      }}
                      selectedRegion={selectedRegion}
                      onRegionChange={(region) => {
                        setSelectedRegion(region);
                        // Save region to buildup
                        if (selectedBuildupId) {
                          updateBuildup(selectedBuildupId, { climate_location: region });
                        }
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="results" className="h-full m-0 overflow-hidden">
                    {analysisResult && (
                      <div className="h-full p-4 flex flex-col">
                        {/* Build-up selector when multiple results exist */}
                        {multiAnalysisResults.size > 1 && (
                          <div className="mb-4">
                            <label className="text-xs text-muted-foreground mb-2 block">Select Build-up</label>
                            <Select 
                              value={selectedBuildupId || ''} 
                            onValueChange={(id) => {
                                if (!id) return;
                                
                                const result = multiAnalysisResults.get(id);
                                const project = projects.find(p => p.id === selectedProjectId);
                                const buildup = project?.buildups.find(b => b.id === id);
                                
                                // Only update if we have valid cached results
                                if (!result) {
                                  console.warn('No cached result found for buildup:', id);
                                  return;
                                }
                                if (!buildup) {
                                  console.warn('Buildup not found:', id);
                                  return;
                                }
                                
                                setSelectedBuildupId(id);
                                setAnalysisResult(result);
                                setConstruction({
                                  id: buildup.id,
                                  name: buildup.name,
                                  type: buildup.construction_type,
                                  layers: buildup.layers,
                                  internalSurfaceResistance: 0.13,
                                  externalSurfaceResistance: 0.04,
                                });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose build-up" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border z-50">
                                {Array.from(multiAnalysisResults.keys()).map(id => {
                                  const project = projects.find(p => p.id === selectedProjectId);
                                  const buildup = project?.buildups.find(b => b.id === id);
                                  const result = multiAnalysisResults.get(id);
                                  if (!buildup) return null;
                                  return (
                                    <SelectItem key={id} value={id}>
                                      <span className="flex items-center gap-2">
                                        {buildup.name}
                                        <span className={cn(
                                          "text-xs px-1.5 py-0.5 rounded",
                                          result?.overallResult === 'pass' 
                                            ? "bg-success/20 text-success" 
                                            : "bg-destructive/20 text-destructive"
                                        )}>
                                          {result?.overallResult === 'pass' ? 'PASS' : 'FAIL'}
                                        </span>
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <DetailedResultsPanel 
                          result={analysisResult}
                          climateData={climateData}
                          layers={construction.layers}
                          className="flex-1 overflow-hidden"
                        />
                        
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
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
          <div className="flex flex-col gap-4">
            {/* Canvas Section */}
            <JunctionCanvas 
              construction={construction}
              className="flex-shrink-0"
              constructionType={constructionType}
              floorType={floorType}
              perimeter={perimeter}
              area={area}
              onConstructionTypeChange={handleConstructionTypeChange}
            />

            {/* Analysis Results */}
            {analysisResult && (
              <div 
                className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                style={{ minHeight: 800 }}
              >
                {chartsReady ? (
                  <>
                    <div className="flex flex-col gap-4">
                      <div ref={glastaDiagramRef} style={{ minHeight: 400 }}>
                        <GlastaDiagram 
                          result={analysisResult} 
                          climateData={climateData}
                          selectedMonth={selectedGlaserMonth}
                          onMonthChange={setSelectedGlaserMonth}
                        />
                      </div>
                      <TemperatureProfile result={analysisResult} />
                    </div>
                    
                    <div className="flex flex-col gap-4">
                      <div style={{ minHeight: 350 }}>
                        <MonthlyAccumulationChart monthlyData={analysisResult.monthlyData} />
                      </div>
                      <ResultsSummary 
                        result={analysisResult}
                        onExportPDF={exportReport}
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 flex items-center justify-center" style={{ minHeight: 400 }}>
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                      <span className="text-muted-foreground text-sm">Preparing results...</span>
                    </div>
                  </div>
                )}
              </div>
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
