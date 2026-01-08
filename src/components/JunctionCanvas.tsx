import { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, Rect, Line, Text, Circle, Group } from 'fabric';
import { Button } from '@/components/ui/button';
import { 
  MousePointer, Square, Minus, RotateCcw, ZoomIn, ZoomOut, 
  Grid, Download, Trash2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Construction } from '@/types/materials';

interface JunctionCanvasProps {
  construction: Construction;
  className?: string;
}

type Tool = 'select' | 'wall' | 'floor' | 'roof';

export function JunctionCanvas({ construction, className }: JunctionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(1);

  // Layer colors matching the construction builder
  const layerColors = [
    '#3b82f6', // blue
    '#14b8a6', // cyan
    '#22c55e', // green
    '#f59e0b', // amber
    '#a855f7', // purple
    '#ec4899', // pink
    '#f97316', // orange
    '#10b981', // emerald
  ];

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 600,
      height: 400,
      backgroundColor: '#0c1222',
      selection: true,
    });

    setFabricCanvas(canvas);

    // Draw grid
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
    drawConstructionLayers(fabricCanvas, construction);
  }, [fabricCanvas, construction]);

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

  const drawConstructionLayers = (canvas: FabricCanvas, construction: Construction) => {
    if (construction.layers.length === 0) return;

    const startX = 100;
    const startY = 50;
    const layerHeight = 280;
    let currentX = startX;

    // Scale factor to visualize thickness (1mm = 0.8px for visibility)
    const scale = 0.8;

    construction.layers.forEach((layer, index) => {
      const layerWidth = Math.max(layer.thickness * scale, 20);
      const color = layerColors[index % layerColors.length];

      // Main layer rectangle
      const rect = new Rect({
        left: currentX,
        top: startY,
        width: layerWidth,
        height: layerHeight,
        fill: color + '40', // 25% opacity
        stroke: color,
        strokeWidth: 2,
        selectable: false,
        data: { type: 'layer', index },
      });

      // Layer label
      const label = new Text(layer.material.name.split(' ')[0], {
        left: currentX + layerWidth / 2,
        top: startY + layerHeight + 10,
        fontSize: 10,
        fill: '#94a3b8',
        originX: 'center',
        selectable: false,
        data: { type: 'layer', index },
      });

      // Thickness label
      const thicknessLabel = new Text(`${layer.thickness}mm`, {
        left: currentX + layerWidth / 2,
        top: startY - 15,
        fontSize: 9,
        fill: '#64748b',
        originX: 'center',
        selectable: false,
        data: { type: 'layer', index },
      });

      // Bridging indication
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
      }

      canvas.add(rect, label, thicknessLabel);
      currentX += layerWidth;
    });

    // Internal/External labels
    const intLabel = new Text('INTERNAL', {
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

    const extLabel = new Text('EXTERNAL', {
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

    canvas.add(intLabel, extLabel);
    canvas.renderAll();
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#0c1222';
    drawGrid(fabricCanvas);
    drawConstructionLayers(fabricCanvas, construction);
  };

  const handleZoom = (delta: number) => {
    if (!fabricCanvas) return;
    const newZoom = Math.max(0.5, Math.min(2, zoom + delta));
    setZoom(newZoom);
    fabricCanvas.setZoom(newZoom);
    fabricCanvas.renderAll();
  };

  return (
    <div className={cn("panel flex flex-col", className)}>
      <div className="panel-header border-b border-border">
        <span className="panel-title">2D Junction Model</span>
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
      <div className="flex items-center gap-1 p-2 border-b border-border bg-secondary/30">
        <Button
          variant={activeTool === 'select' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTool('select')}
        >
          <MousePointer className="w-4 h-4 mr-1" />
          Select
        </Button>
        <Button
          variant={activeTool === 'wall' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTool('wall')}
        >
          <Square className="w-4 h-4 mr-1" />
          Wall
        </Button>
        <Button
          variant={activeTool === 'floor' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTool('floor')}
        >
          <Minus className="w-4 h-4 mr-1" />
          Floor
        </Button>
      </div>

      {/* Canvas */}
      <div className="canvas-container flex-1 flex items-center justify-center p-4">
        <canvas ref={canvasRef} className="rounded border border-border/50" />
      </div>

      {/* Info Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground">
        <span>{construction.layers.length} layers | Total thickness: {construction.layers.reduce((s, l) => s + l.thickness, 0)}mm</span>
        <span>Grid: 20mm</span>
      </div>
    </div>
  );
}
