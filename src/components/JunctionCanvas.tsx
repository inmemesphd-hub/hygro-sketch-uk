import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas as FabricCanvas, Rect, Line, FabricText } from 'fabric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Square, Minus, RotateCcw, ZoomIn, ZoomOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Construction } from '@/types/materials';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateGroundFloorUValue, calculateUValue, SOIL_TYPES, SoilType } from '@/utils/hygrothermalCalculations';

interface JunctionCanvasProps {
  construction: Construction;
  className?: string;
  constructionType?: 'wall' | 'floor';
  floorType?: FloorType;
  perimeter?: number;
  area?: number;
  wallThickness?: number;
  soilType?: SoilType;
  soilConductivity?: number;
  onConstructionTypeChange?: (
    type: 'wall' | 'floor', 
    floorType?: FloorType, 
    perimeter?: number, 
    area?: number,
    wallThickness?: number,
    soilType?: SoilType,
    soilConductivity?: number
  ) => void;
}

type ViewMode = 'wall' | 'floor';
export type FloorType = 'ground' | 'suspended' | 'solid' | 'intermediate';

// Material colors and patterns for cross-section
const getMaterialStyle = (category: string): { color: string; pattern?: string } => {
  switch (category) {
    case 'masonry':
      return { color: '#cd5c5c', pattern: 'brick' };
    case 'insulation':
      return { color: '#ffdab9', pattern: 'dots' };
    case 'concrete':
      return { color: '#a9a9a9', pattern: 'solid' };
    case 'timber':
      return { color: '#d2b48c', pattern: 'wood' };
    case 'membrane':
      return { color: '#6495ed', pattern: 'lines' };
    case 'plasterboard':
      return { color: '#f5f5dc', pattern: 'solid' };
    case 'metal':
      return { color: '#c0c0c0', pattern: 'metallic' };
    case 'airgap':
      return { color: '#f0f8ff', pattern: 'air' };
    case 'render':
      return { color: '#deb887', pattern: 'solid' };
    case 'cladding':
      return { color: '#8b4513', pattern: 'wood' };
    default:
      return { color: '#c8c8c8', pattern: 'solid' };
  }
};

export function JunctionCanvas({ 
  construction, 
  className, 
  constructionType: propConstructionType,
  floorType: propFloorType,
  perimeter: propPerimeter,
  area: propArea,
  wallThickness: propWallThickness,
  soilType: propSoilType,
  soilConductivity: propSoilConductivity,
  onConstructionTypeChange 
}: JunctionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(propConstructionType || 'wall');
  const [floorType, setFloorType] = useState<FloorType>(propFloorType || 'ground');
  const [perimeter, setPerimeter] = useState<number>(propPerimeter || 40);
  const [area, setArea] = useState<number>(propArea || 100);
  const [wallThickness, setWallThickness] = useState<number>(propWallThickness || 0.3);
  const [soilType, setSoilType] = useState<SoilType>(propSoilType || 'sand_gravel');
  const [soilConductivity, setSoilConductivity] = useState<number>(propSoilConductivity || 2.0);
  const [zoom, setZoom] = useState(1);
  
  // Local edit states for inputs to allow full deletion and typing
  const [perimeterEdit, setPerimeterEdit] = useState<string>('');
  const [areaEdit, setAreaEdit] = useState<string>('');
  const [wallThicknessEdit, setWallThicknessEdit] = useState<string>('');
  const [soilLambdaEdit, setSoilLambdaEdit] = useState<string>('');
  const [isEditingPerimeter, setIsEditingPerimeter] = useState(false);
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [isEditingWallThickness, setIsEditingWallThickness] = useState(false);
  const [isEditingSoilLambda, setIsEditingSoilLambda] = useState(false);

  // Sync local state with props when buildup changes
  useEffect(() => {
    if (propConstructionType !== undefined) setViewMode(propConstructionType);
  }, [propConstructionType]);

  useEffect(() => {
    if (propFloorType !== undefined) setFloorType(propFloorType);
  }, [propFloorType]);

  useEffect(() => {
    if (propPerimeter !== undefined) setPerimeter(propPerimeter);
  }, [propPerimeter]);

  useEffect(() => {
    if (propArea !== undefined) setArea(propArea);
  }, [propArea]);

  useEffect(() => {
    if (propWallThickness !== undefined) setWallThickness(propWallThickness);
  }, [propWallThickness]);

  useEffect(() => {
    if (propSoilType !== undefined) setSoilType(propSoilType);
  }, [propSoilType]);

  useEffect(() => {
    if (propSoilConductivity !== undefined) setSoilConductivity(propSoilConductivity);
  }, [propSoilConductivity]);

  // Calculate P/A ratio and ground floor U-value (recalculate when perimeter/area changes)
  const pARatio = area > 0 ? perimeter / area : 0;
  const displayUValue = useMemo(() => {
    if (viewMode === 'floor' && (floorType === 'ground' || floorType === 'solid' || floorType === 'suspended')) {
      return calculateGroundFloorUValue(construction, perimeter, area, floorType, wallThickness, soilConductivity);
    }
    return calculateUValue(construction);
  }, [viewMode, floorType, perimeter, area, wallThickness, soilConductivity, construction]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 600,
      height: 400,
      backgroundColor: '#0c1222',
      selection: false,
    });

    setFabricCanvas(canvas);
    drawGrid(canvas);

    return () => {
      canvas.dispose();
    };
  }, []);

  // Redraw construction visualization when layers change
  useEffect(() => {
    if (!fabricCanvas) return;
    
    // Clear existing construction visualization
    const objects = fabricCanvas.getObjects();
    objects.forEach(obj => {
      if ((obj as any).data?.type === 'layer') {
        fabricCanvas.remove(obj);
      }
    });

    // Draw construction layers
    drawConstructionLayers(fabricCanvas, construction, viewMode);
  }, [fabricCanvas, construction, viewMode]);

  // Notify parent when floor params change
  const notifyParent = (ft: FloorType, p: number, a: number, w: number, st: SoilType, sc: number) => {
    if (viewMode === 'floor' && onConstructionTypeChange) {
      onConstructionTypeChange('floor', ft, p, a, w, st, sc);
    }
  };

  useEffect(() => {
    if (viewMode === 'floor') {
      notifyParent(floorType, perimeter, area, wallThickness, soilType, soilConductivity);
    }
  }, [perimeter, area, floorType, wallThickness, soilType, soilConductivity]);

  const drawGrid = (canvas: FabricCanvas) => {
    const gridSize = 20;
    const width = 600;
    const height = 400;

    for (let i = 0; i <= width; i += gridSize) {
      const line = new Line([i, 0, i, height], {
        stroke: '#1e293b',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    for (let i = 0; i <= height; i += gridSize) {
      const line = new Line([0, i, width, i], {
        stroke: '#1e293b',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }
  };

  const drawConstructionLayers = (canvas: FabricCanvas, construction: Construction, mode: ViewMode) => {
    if (construction.layers.length === 0) return;

    const isFloor = mode === 'floor';
    const startX = isFloor ? 50 : 100;
    const startY = isFloor ? 80 : 50;
    const scale = 0.8;

    if (isFloor) {
      // Horizontal floor layout - Internal at TOP, Ground/External at BOTTOM
      // This matches the report orientation
      const layerWidth = 500;
      let currentY = startY;

      // "Internal surface" label at top
      const innerLabel = new FabricText('Internal Surface (Room)', {
        left: startX + layerWidth / 2,
        top: startY - 25,
        fontSize: 11,
        fill: '#22c55e',
        originX: 'center',
        selectable: false,
        data: { type: 'layer' },
      });
      canvas.add(innerLabel);

      // Draw layers in order - first layer is internal (at top), matching Build tab
      construction.layers.forEach((layer, index) => {
        const layerHeight = Math.max(layer.thickness * scale, 15);
        const { color } = getMaterialStyle(layer.material.category);

        // Layer rectangle
        const rect = new Rect({
          left: startX,
          top: currentY,
          width: layerWidth,
          height: layerHeight,
          fill: color,
          stroke: '#333',
          strokeWidth: 1,
          selectable: false,
          data: { type: 'layer', index },
        });

        // Layer label with bridging info
        let labelText = `${layer.thickness}mm ${layer.material.name}`;
        if (layer.bridging) {
          labelText += ` [${layer.bridging.percentage}% ${layer.bridging.material.name}]`;
        }
        const label = new FabricText(labelText, {
          left: startX + layerWidth / 2,
          top: currentY + layerHeight / 2,
          fontSize: 10,
          fill: '#000',
          originX: 'center',
          originY: 'center',
          selectable: false,
          data: { type: 'layer', index },
        });

        // Bridging indication
        if (layer.bridging) {
          const bridgeHeight = 3;
          const spacing = 60;
          for (let x = startX + 30; x < startX + layerWidth - 30; x += spacing) {
            const bridge = new Rect({
              left: x,
              top: currentY + (layerHeight - bridgeHeight) / 2,
              width: 20,
              height: bridgeHeight,
              fill: '#f59e0b',
              selectable: false,
              data: { type: 'layer', index },
            });
            canvas.add(bridge);
          }
        }

        canvas.add(rect, label);
        currentY += layerHeight;
      });

      // "Outer/Ground surface" label at bottom
      const outerLabel = new FabricText('External Surface (Ground/Below)', {
        left: startX + layerWidth / 2,
        top: currentY + 15,
        fontSize: 11,
        fill: '#3b82f6',
        originX: 'center',
        selectable: false,
        data: { type: 'layer' },
      });
      canvas.add(outerLabel);
    } else {
      // Vertical wall layout
      const layerHeight = 280;
      let currentX = startX;

      // "Internal" label
      const intLabel = new FabricText('INTERNAL', {
        left: 50,
        top: startY + layerHeight / 2,
        fontSize: 11,
        fill: '#22c55e',
        angle: -90,
        originX: 'center',
        originY: 'center',
        selectable: false,
        data: { type: 'layer' },
      });
      canvas.add(intLabel);

      construction.layers.forEach((layer, index) => {
        const layerWidth = Math.max(layer.thickness * scale, 20);
        const { color } = getMaterialStyle(layer.material.category);

        // Main layer rectangle
        const rect = new Rect({
          left: currentX,
          top: startY,
          width: layerWidth,
          height: layerHeight,
          fill: color,
          stroke: '#333',
          strokeWidth: 1,
          selectable: false,
          data: { type: 'layer', index },
        });

        // Material name (vertical text) - positioned inside the layer
        const shortName = layer.material.name.split(' ').slice(0, 2).join(' ');
        const verticalLabel = new FabricText(shortName, {
          left: currentX + layerWidth / 2,
          top: startY + layerHeight / 2,
          fontSize: 9,
          fill: '#000',
          angle: -90,
          originX: 'center',
          originY: 'center',
          selectable: false,
          data: { type: 'layer', index },
        });

        // Thickness label at top
        const thicknessLabel = new FabricText(`${layer.thickness}mm`, {
          left: currentX + layerWidth / 2,
          top: startY - 15,
          fontSize: 9,
          fill: '#64748b',
          originX: 'center',
          selectable: false,
          data: { type: 'layer', index },
        });

        // Bridging indication with label
        if (layer.bridging) {
          const bridgeWidth = 4;
          const spacing = 40;
          for (let y = startY + 20; y < startY + layerHeight - 20; y += spacing) {
            const bridge = new Rect({
              left: currentX + (layerWidth - bridgeWidth) / 2,
              top: y,
              width: bridgeWidth,
              height: 30,
              fill: '#f59e0b',
              selectable: false,
              data: { type: 'layer', index },
            });
            canvas.add(bridge);
          }
          
          // Bridging info label below
          const bridgeLabel = new FabricText(`${layer.bridging.percentage}% ${layer.bridging.material.name.split(' ')[0]}`, {
            left: currentX + layerWidth / 2,
            top: startY + layerHeight + 25,
            fontSize: 7,
            fill: '#f59e0b',
            originX: 'center',
            selectable: false,
            data: { type: 'layer', index },
          });
          canvas.add(bridgeLabel);
        }

        canvas.add(rect, verticalLabel, thicknessLabel);
        currentX += layerWidth;
      });

      // "External" label
      const extLabel = new FabricText('EXTERNAL', {
        left: currentX + 50,
        top: startY + layerHeight / 2,
        fontSize: 11,
        fill: '#3b82f6',
        angle: -90,
        originX: 'center',
        originY: 'center',
        selectable: false,
        data: { type: 'layer' },
      });
      canvas.add(extLabel);
    }

    canvas.renderAll();
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#0c1222';
    drawGrid(fabricCanvas);
    drawConstructionLayers(fabricCanvas, construction, viewMode);
  };

  const handleZoom = (delta: number) => {
    if (!fabricCanvas) return;
    const newZoom = Math.max(0.5, Math.min(2, zoom + delta));
    setZoom(newZoom);
    fabricCanvas.setZoom(newZoom);
    fabricCanvas.renderAll();
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'floor' && onConstructionTypeChange) {
      onConstructionTypeChange('floor', floorType, perimeter, area, wallThickness, soilType, soilConductivity);
    } else if (onConstructionTypeChange) {
      onConstructionTypeChange('wall');
    }
  };

  const handleFloorTypeChange = (type: FloorType) => {
    setFloorType(type);
    notifyParent(type, perimeter, area, wallThickness, soilType, soilConductivity);
  };

  const handleSoilTypeChange = (type: SoilType) => {
    setSoilType(type);
    const newLambda = SOIL_TYPES[type].lambda;
    setSoilConductivity(newLambda);
    notifyParent(floorType, perimeter, area, wallThickness, type, newLambda);
  };

  // Input handlers with proper deletion support
  const handlePerimeterFocus = () => {
    setIsEditingPerimeter(true);
    setPerimeterEdit(perimeter.toString());
  };

  const handlePerimeterBlur = () => {
    setIsEditingPerimeter(false);
    const val = parseFloat(perimeterEdit);
    if (!isNaN(val) && val > 0) {
      setPerimeter(val);
    }
  };

  const handleAreaFocus = () => {
    setIsEditingArea(true);
    setAreaEdit(area.toString());
  };

  const handleAreaBlur = () => {
    setIsEditingArea(false);
    const val = parseFloat(areaEdit);
    if (!isNaN(val) && val > 0) {
      setArea(val);
    }
  };

  const handleWallThicknessFocus = () => {
    setIsEditingWallThickness(true);
    setWallThicknessEdit(wallThickness.toString());
  };

  const handleWallThicknessBlur = () => {
    setIsEditingWallThickness(false);
    const val = parseFloat(wallThicknessEdit);
    if (!isNaN(val) && val >= 0.001 && val <= 1) {
      setWallThickness(val);
    }
  };

  const handleSoilLambdaFocus = () => {
    setIsEditingSoilLambda(true);
    setSoilLambdaEdit(soilConductivity.toString());
  };

  const handleSoilLambdaBlur = () => {
    setIsEditingSoilLambda(false);
    const val = parseFloat(soilLambdaEdit);
    if (!isNaN(val) && val >= 0.1 && val <= 10) {
      setSoilConductivity(val);
      notifyParent(floorType, perimeter, area, wallThickness, 'custom', val);
    }
  };

  return (
    <div className={cn("panel flex flex-col", className)}>
      <div className="panel-header border-b border-border">
        <span className="panel-title">Junction Model</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleZoom(-0.1)}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleZoom(0.1)}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="w-px h-4 bg-border mx-2" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClear}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-secondary/30 flex-wrap">
        <Button
          variant={viewMode === 'wall' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleViewModeChange('wall')}
        >
          <Square className="w-4 h-4 mr-1" />
          Wall
        </Button>
        <Button
          variant={viewMode === 'floor' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleViewModeChange('floor')}
        >
          <Minus className="w-4 h-4 mr-1" />
          Floor
        </Button>

        {viewMode === 'floor' && (
          <>
            <div className="w-px h-6 bg-border mx-2" />
            <Select value={floorType} onValueChange={(v) => handleFloorTypeChange(v as FloorType)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ground">Ground Floor</SelectItem>
                <SelectItem value="suspended">Suspended Floor</SelectItem>
                <SelectItem value="solid">Solid Floor</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
              </SelectContent>
            </Select>
            
            {(floorType === 'ground' || floorType === 'solid' || floorType === 'suspended') && (
              <>
                <div className="flex items-center gap-1 ml-2">
                  <Label className="text-xs text-muted-foreground">P:</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={isEditingPerimeter ? perimeterEdit : perimeter}
                    onFocus={handlePerimeterFocus}
                    onChange={(e) => setPerimeterEdit(e.target.value)}
                    onBlur={handlePerimeterBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-16 h-8 text-xs"
                    placeholder="m"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">A:</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={isEditingArea ? areaEdit : area}
                    onFocus={handleAreaFocus}
                    onChange={(e) => setAreaEdit(e.target.value)}
                    onBlur={handleAreaBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-16 h-8 text-xs"
                    placeholder="m²"
                  />
                  <span className="text-xs text-muted-foreground">m²</span>
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">w:</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={isEditingWallThickness ? wallThicknessEdit : wallThickness}
                    onFocus={handleWallThicknessFocus}
                    onChange={(e) => setWallThicknessEdit(e.target.value)}
                    onBlur={handleWallThicknessBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-16 h-8 text-xs"
                    placeholder="m"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">Ground:</Label>
                  <Select value={soilType} onValueChange={(v) => handleSoilTypeChange(v as SoilType)}>
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SOIL_TYPES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {soilType === 'custom' && (
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">λ:</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={isEditingSoilLambda ? soilLambdaEdit : soilConductivity}
                      onFocus={handleSoilLambdaFocus}
                      onChange={(e) => setSoilLambdaEdit(e.target.value)}
                      onBlur={handleSoilLambdaBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-14 h-8 text-xs"
                      placeholder="W/mK"
                    />
                    <span className="text-xs text-muted-foreground">W/mK</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Canvas */}
      <div className="canvas-container flex-1 flex items-center justify-center p-4 overflow-auto">
        <canvas ref={canvasRef} className="rounded border border-border/50" />
      </div>

      {/* Info Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground flex-wrap gap-2">
        <span>
          {construction.layers.length} layers | Total: {construction.layers.reduce((s, l) => s + l.thickness, 0)}mm
          {viewMode === 'floor' && (floorType === 'ground' || floorType === 'solid' || floorType === 'suspended') && ` | P/A: ${pARatio.toFixed(3)}`}
        </span>
        {viewMode === 'floor' && (floorType === 'ground' || floorType === 'solid' || floorType === 'suspended') && (
          <span className="font-mono text-primary">
            U-value (ISO 13370): {displayUValue.toFixed(3)} W/m²K
          </span>
        )}
        <span>Grid: 20mm</span>
      </div>
    </div>
  );
}
