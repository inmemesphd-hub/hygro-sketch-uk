import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Construction } from '@/types/materials';
import { ConstructionBuilder } from '@/components/ConstructionBuilder';
import { JunctionCanvas, FloorType } from '@/components/JunctionCanvas';
import { ProjectManager } from '@/components/ProjectManager';
import { useProjects, BuildupData } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, X, Thermometer, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const defaultConstruction: Construction = {
  id: 'default',
  name: 'New Construction',
  type: 'wall',
  layers: [],
  internalSurfaceResistance: 0.13,
  externalSurfaceResistance: 0.04,
};

export default function UValueWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { projects, currentProject, updateBuildup, createProject, createBuildup } = useProjects();

  const [construction, setConstruction] = useState<Construction>(defaultConstruction);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectPanelOpen, setProjectPanelOpen] = useState(true);

  const [selectedBuildupId, setSelectedBuildupId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [constructionType, setConstructionType] = useState<'wall' | 'floor'>('wall');
  const [floorType, setFloorType] = useState<FloorType>('ground');
  const [perimeter, setPerimeter] = useState<number>(40);
  const [area, setArea] = useState<number>(100);
  const [wallThickness, setWallThickness] = useState<number>(0.3);
  const [soilConductivity, setSoilConductivity] = useState<number>(2.0);

  // Auto-select first project/buildup if none selected
  useEffect(() => {
    const initProject = async () => {
      if (user && !selectedBuildupId) {
        if (projects.length === 0) {
          const project = await createProject('My First Project');
          if (project) {
            const buildup = await createBuildup(project.id, { name: 'Build-up 1' });
            if (buildup) {
              setSelectedBuildupId(buildup.id);
              setSelectedProjectId(project.id);
            }
          }
        } else if (projects.length > 0 && projects[0].buildups.length > 0) {
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
      }
    }
  }, [selectedBuildupId, selectedProjectId, projects]);

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
    _st?: string,
    sc?: number
  ) => {
    setConstructionType(type);
    if (type === 'floor') {
      if (ft) setFloorType(ft);
      if (p !== undefined) setPerimeter(p);
      if (a !== undefined) setArea(a);
      if (w !== undefined) setWallThickness(w);
      if (sc !== undefined) setSoilConductivity(sc);
      setConstruction(prev => ({
        ...prev,
        type: 'floor',
        internalSurfaceResistance: 0.17,
        externalSurfaceResistance: 0.00,
      }));
    } else {
      setConstruction(prev => ({
        ...prev,
        type: 'wall',
        internalSurfaceResistance: 0.13,
        externalSurfaceResistance: 0.04,
      }));
    }

    if (selectedBuildupId) {
      updateBuildup(selectedBuildupId, {
        construction_type: type,
        floor_type: type === 'floor' ? (ft || floorType) : null,
        perimeter: type === 'floor' ? (p || perimeter) : null,
        area: type === 'floor' ? (a || area) : null,
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="h-12 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 z-10">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">U-Value Calculations</span>
          <span className="text-xs text-muted-foreground">BS EN ISO 6946</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setProjectPanelOpen(!projectPanelOpen)}
          title="Toggle project panel"
        >
          {projectPanelOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title="Toggle construction panel"
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Project panel */}
        <AnimatePresence initial={false}>
          {projectPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="shrink-0 overflow-hidden border-r border-border"
            >
              <ProjectManager
                onSelectBuildup={handleSelectBuildup}
                selectedBuildupId={selectedBuildupId}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Construction sidebar */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 420, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="shrink-0 overflow-hidden border-r border-border bg-card flex flex-col"
            >
              <div className="flex-1 overflow-auto p-4">
                <ConstructionBuilder
                  construction={construction}
                  onChange={handleConstructionChange}
                  constructionType={constructionType}
                  floorType={floorType}
                  perimeter={perimeter}
                  area={area}
                  wallThickness={wallThickness}
                  soilConductivity={soilConductivity}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main canvas */}
        <main className="flex-1 overflow-auto p-4 bg-background">
          <div className="flex flex-col gap-4">
            <JunctionCanvas
              construction={construction}
              className="flex-shrink-0"
              constructionType={constructionType}
              floorType={floorType}
              perimeter={perimeter}
              area={area}
              onConstructionTypeChange={handleConstructionTypeChange}
            />

            {/* Info panel when no layers */}
            {construction.layers.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Thermometer className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">U-Value Calculator</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add construction layers in the sidebar to calculate thermal transmittance.
                    Supports parallel path bridging correction per BS EN ISO 6946 and ground floor
                    calculations per BS EN ISO 13370.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                    <span className="px-2 py-1 rounded bg-muted/40 border border-border">BS EN ISO 6946</span>
                    <span className="px-2 py-1 rounded bg-muted/40 border border-border">BS EN ISO 13370</span>
                    <span className="px-2 py-1 rounded bg-muted/40 border border-border">Parallel path bridging</span>
                    <span className="px-2 py-1 rounded bg-muted/40 border border-border">Part L compliance</span>
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
