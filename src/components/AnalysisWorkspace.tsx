import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Construction, ConstructionLayer, ClimateData, AnalysisResult } from '@/types/materials';
import { ukMaterialDatabase } from '@/data/ukMaterials';
import { ukMonthlyClimateData } from '@/data/ukClimate';
import { performCondensationAnalysis } from '@/utils/hygrothermalCalculations';
import { ConstructionBuilder } from '@/components/ConstructionBuilder';
import { ClimateInput } from '@/components/ClimateInput';
import { JunctionCanvas } from '@/components/JunctionCanvas';
import { GlastaDiagram, TemperatureProfile } from '@/components/charts/GlastaDiagram';
import { MonthlyAccumulationChart } from '@/components/charts/MonthlyAccumulationChart';
import { ResultsSummary } from '@/components/ResultsSummary';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Layers, BarChart3, FileText, Settings, 
  Play, Building2, Thermometer, Droplets,
  ChevronRight, Menu, X
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

  const runAnalysis = () => {
    setIsAnalyzing(true);
    
    // Simulate processing delay for UX
    setTimeout(() => {
      const result = performCondensationAnalysis(construction, climateData);
      setAnalysisResult(result);
      setActiveTab('results');
      setIsAnalyzing(false);
    }, 800);
  };

  const exportPDF = async () => {
    if (!analysisResult) return;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    
    // Title
    pdf.setFontSize(20);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Condensation Risk Analysis Report', margin, 25);
    
    // Subtitle
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-GB')} | BS EN ISO 13788 Compliance`, margin, 32);
    
    // Result badge
    pdf.setFontSize(12);
    if (analysisResult.overallResult === 'pass') {
      pdf.setTextColor(22, 163, 74);
      pdf.text('✓ COMPLIANT', pageWidth - margin - 30, 25);
    } else {
      pdf.setTextColor(220, 38, 38);
      pdf.text('✗ NON-COMPLIANT', pageWidth - margin - 35, 25);
    }

    // Construction summary
    let y = 45;
    pdf.setFontSize(11);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Construction Summary', margin, y);
    
    y += 8;
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105);
    
    construction.layers.forEach((layer, i) => {
      const text = `${i + 1}. ${layer.material.name} - ${layer.thickness}mm (λ=${layer.material.thermalConductivity} W/mK)`;
      pdf.text(text, margin + 5, y);
      y += 5;
    });

    // Key metrics
    y += 10;
    pdf.setFontSize(11);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Key Results', margin, y);
    
    y += 8;
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`U-Value: ${analysisResult.uValue} W/m²K`, margin + 5, y);
    y += 5;
    pdf.text(`Peak Accumulation: ${Math.max(...analysisResult.monthlyData.map(d => d.cumulativeAccumulation)).toFixed(0)} g/m²`, margin + 5, y);
    y += 5;
    pdf.text(`Year-End Retained: ${analysisResult.monthlyData[11]?.cumulativeAccumulation.toFixed(0) || 0} g/m²`, margin + 5, y);

    // Standards reference
    y += 15;
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Analysis performed in accordance with BS EN ISO 13788, BS EN 15026, and Approved Document C.', margin, y);
    
    pdf.save('condensation-analysis-report.pdf');
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
        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
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
                  <TabsContent value="construction" className="h-full m-0 p-4">
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
                        </div>

                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={exportPDF}
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Export PDF Report
                        </Button>
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
            />

            {/* Analysis Results */}
            {analysisResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0"
              >
                <div className="space-y-4 overflow-auto">
                  <GlastaDiagram result={analysisResult} />
                  <TemperatureProfile result={analysisResult} />
                </div>
                
                <div className="space-y-4 overflow-auto">
                  <MonthlyAccumulationChart monthlyData={analysisResult.monthlyData} />
                  <ResultsSummary 
                    result={analysisResult}
                    onExportPDF={exportPDF}
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
