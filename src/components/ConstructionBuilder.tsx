import { useState } from 'react';
import { Construction, ConstructionLayer, Material } from '@/types/materials';
import { ukMaterialDatabase } from '@/data/ukMaterials';
import { MaterialLibrary } from './MaterialLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, Trash2, GripVertical, Layers, 
  ChevronDown, ChevronUp, Settings 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateUValue, calculateLayerThermalResistance } from '@/utils/hygrothermalCalculations';

interface ConstructionBuilderProps {
  construction: Construction;
  onChange: (construction: Construction) => void;
}

const layerColors = [
  'bg-layer-1',
  'bg-layer-2',
  'bg-layer-3',
  'bg-layer-4',
  'bg-layer-5',
  'bg-layer-6',
  'bg-layer-7',
  'bg-layer-8',
];

export function ConstructionBuilder({ construction, onChange }: ConstructionBuilderProps) {
  const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [addingToIndex, setAddingToIndex] = useState<number | null>(null);

  const uValue = calculateUValue(construction);

  const addLayer = (material: Material) => {
    const newLayer: ConstructionLayer = {
      id: `layer-${Date.now()}`,
      material,
      thickness: 100,
    };

    const newLayers = [...construction.layers];
    if (addingToIndex !== null) {
      newLayers.splice(addingToIndex, 0, newLayer);
    } else {
      newLayers.push(newLayer);
    }

    onChange({ ...construction, layers: newLayers });
    setAddingToIndex(null);
  };

  const updateLayer = (index: number, updates: Partial<ConstructionLayer>) => {
    const newLayers = [...construction.layers];
    newLayers[index] = { ...newLayers[index], ...updates };
    onChange({ ...construction, layers: newLayers });
  };

  const removeLayer = (index: number) => {
    const newLayers = construction.layers.filter((_, i) => i !== index);
    onChange({ ...construction, layers: newLayers });
  };

  const moveLayer = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= construction.layers.length) return;

    const newLayers = [...construction.layers];
    [newLayers[index], newLayers[newIndex]] = [newLayers[newIndex], newLayers[index]];
    onChange({ ...construction, layers: newLayers });
  };

  const toggleBridging = (index: number, enabled: boolean) => {
    const layer = construction.layers[index];
    if (enabled) {
      updateLayer(index, {
        bridging: {
          material: ukMaterialDatabase.find(m => m.id === 'softwood')!,
          percentage: 15,
        },
      });
    } else {
      const { bridging, ...rest } = layer;
      const newLayers = [...construction.layers];
      newLayers[index] = rest as ConstructionLayer;
      onChange({ ...construction, layers: newLayers });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="panel-title">Construction Layers</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="data-label">U-Value</span>
            <div className="font-mono text-lg text-primary">
              {uValue.toFixed(3)}
              <span className="text-xs text-muted-foreground ml-1">W/m²K</span>
            </div>
          </div>
        </div>
      </div>

      {/* Internal Surface Label */}
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <div className="flex-1 h-px bg-border" />
        <span>Internal Surface (Rsi = {construction.internalSurfaceResistance} m²K/W)</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-1">
          {construction.layers.map((layer, index) => {
            const layerR = calculateLayerThermalResistance(layer);
            const isExpanded = expandedLayer === layer.id;
            const colorClass = layerColors[index % layerColors.length];

            return (
              <div
                key={layer.id}
                className={cn(
                  "rounded-lg border border-border bg-card/50 overflow-hidden transition-all",
                  isExpanded && "ring-1 ring-primary/50"
                )}
              >
                {/* Layer Header */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/30"
                  onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                >
                  <div className={cn("w-3 h-8 rounded", colorClass)} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{layer.material.name}</span>
                      {layer.bridging && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                          {layer.bridging.percentage}% bridged
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono">{layer.thickness}mm</span>
                      <span className="font-mono">R = {layerR.toFixed(3)} m²K/W</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); moveLayer(index, 'up'); }}
                      disabled={index === 0}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); moveLayer(index, 'down'); }}
                      disabled={index === construction.layers.length - 1}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeLayer(index); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4 bg-secondary/20">
                    {/* Thickness Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Thickness</Label>
                        <span className="font-mono text-sm">{layer.thickness} mm</span>
                      </div>
                      <Slider
                        value={[layer.thickness]}
                        onValueChange={([value]) => updateLayer(index, { thickness: value })}
                        min={1}
                        max={500}
                        step={1}
                        className="py-2"
                      />
                    </div>

                    {/* Material Properties */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Thermal Conductivity (λ)</span>
                        <div className="font-mono mt-0.5">{layer.material.thermalConductivity} W/mK</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Vapour Resistivity (μ)</span>
                        <div className="font-mono mt-0.5">{layer.material.vapourResistivity} MNs/gm</div>
                      </div>
                    </div>

                    {/* Bridging Toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div>
                        <Label className="text-sm">Thermal Bridging</Label>
                        <p className="text-xs text-muted-foreground">Add studs, rails, or other bridging elements</p>
                      </div>
                      <Switch
                        checked={!!layer.bridging}
                        onCheckedChange={(checked) => toggleBridging(index, checked)}
                      />
                    </div>

                    {/* Bridging Details */}
                    {layer.bridging && (
                      <div className="space-y-3 p-3 rounded-lg bg-card border border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {layer.bridging.material.name}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAddingToIndex(index);
                              setMaterialLibraryOpen(true);
                            }}
                          >
                            Change
                          </Button>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Bridging Percentage</Label>
                            <span className="font-mono text-sm">{layer.bridging.percentage}%</span>
                          </div>
                          <Slider
                            value={[layer.bridging.percentage]}
                            onValueChange={([value]) => updateLayer(index, {
                              bridging: { ...layer.bridging!, percentage: value }
                            })}
                            min={1}
                            max={50}
                            step={1}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Layer Button */}
          <Button
            variant="outline"
            className="w-full h-12 border-dashed border-2 hover:border-primary hover:bg-primary/5"
            onClick={() => {
              setAddingToIndex(null);
              setMaterialLibraryOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Layer
          </Button>
        </div>
      </ScrollArea>

      {/* External Surface Label */}
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground mt-2">
        <div className="flex-1 h-px bg-border" />
        <span>External Surface (Rse = {construction.externalSurfaceResistance} m²K/W)</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <MaterialLibrary
        open={materialLibraryOpen}
        onClose={() => setMaterialLibraryOpen(false)}
        onSelect={addLayer}
      />
    </div>
  );
}
