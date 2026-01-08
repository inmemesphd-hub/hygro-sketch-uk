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
  ChevronDown, ChevronUp, Settings, Edit2, Replace
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateUValue, calculateLayerThermalResistance, calculateUValueWithoutBridging } from '@/utils/hygrothermalCalculations';

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
  const [selectingBridgingForLayer, setSelectingBridgingForLayer] = useState<number | null>(null);
  const [replacingLayerIndex, setReplacingLayerIndex] = useState<number | null>(null);
  const [editingRsi, setEditingRsi] = useState(false);
  const [editingRse, setEditingRse] = useState(false);

  const uValue = calculateUValue(construction);
  const uValueNoBridging = calculateUValueWithoutBridging(construction);

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

  const replaceLayerMaterial = (layerIndex: number, material: Material) => {
    const newLayers = [...construction.layers];
    newLayers[layerIndex] = { ...newLayers[layerIndex], material };
    onChange({ ...construction, layers: newLayers });
    setReplacingLayerIndex(null);
  };

  const updateBridgingMaterial = (layerIndex: number, material: Material) => {
    const layer = construction.layers[layerIndex];
    if (layer.bridging) {
      updateLayer(layerIndex, {
        bridging: { ...layer.bridging, material }
      });
    }
    setSelectingBridgingForLayer(null);
  };

  const handleMaterialSelect = (material: Material) => {
    if (selectingBridgingForLayer !== null) {
      updateBridgingMaterial(selectingBridgingForLayer, material);
    } else if (replacingLayerIndex !== null) {
      replaceLayerMaterial(replacingLayerIndex, material);
    } else {
      addLayer(material);
    }
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

  const updateSurfaceResistance = (type: 'internal' | 'external', value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
      if (type === 'internal') {
        onChange({ ...construction, internalSurfaceResistance: numValue });
      } else {
        onChange({ ...construction, externalSurfaceResistance: numValue });
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="panel-title">Construction Layers</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="text-right">
            <span className="data-label">U-Value</span>
            <div className="font-mono text-lg text-primary">
              {uValue.toFixed(3)}
              <span className="text-xs text-muted-foreground ml-1">W/m²K</span>
            </div>
          </div>
          {uValue !== uValueNoBridging && (
            <div className="text-xs text-muted-foreground">
              Without bridging: {uValueNoBridging.toFixed(3)}
            </div>
          )}
        </div>
      </div>

      {/* Surface labels based on construction type - For floors: Internal at BOTTOM, External/Ground at TOP */}
      {/* For walls: Internal at TOP, External at BOTTOM */}
      {construction.type === 'floor' ? (
        <>
          {/* External/Ground Surface at TOP for floors */}
          <div className="flex items-center gap-2 px-2 py-2 text-xs">
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">External Surface (Ground)</span>
              {editingRse ? (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Rse =</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={construction.externalSurfaceResistance}
                    onChange={(e) => updateSurfaceResistance('external', e.target.value)}
                    className="w-20 h-6 text-xs"
                    onBlur={() => setEditingRse(false)}
                    autoFocus
                  />
                  <span className="text-muted-foreground">m²K/W</span>
                </div>
              ) : (
                <button
                  onClick={() => setEditingRse(true)}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <span className="font-mono">(Rse = {construction.externalSurfaceResistance} m²K/W)</span>
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      ) : (
        <>
          {/* Internal Surface Rsi at TOP for walls */}
          <div className="flex items-center gap-2 px-2 py-2 text-xs">
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Internal Surface</span>
              {editingRsi ? (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Rsi =</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={construction.internalSurfaceResistance}
                    onChange={(e) => updateSurfaceResistance('internal', e.target.value)}
                    className="w-20 h-6 text-xs"
                    onBlur={() => setEditingRsi(false)}
                    autoFocus
                  />
                  <span className="text-muted-foreground">m²K/W</span>
                </div>
              ) : (
                <button
                  onClick={() => setEditingRsi(true)}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <span className="font-mono">(Rsi = {construction.internalSurfaceResistance} m²K/W)</span>
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      )}

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
                          {layer.bridging.percentage}% {layer.bridging.material.name}
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
                    {/* Replace Material Button */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Material</Label>
                        <p className="text-xs text-muted-foreground">{layer.material.name}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplacingLayerIndex(index);
                          setSelectingBridgingForLayer(null);
                          setAddingToIndex(null);
                          setMaterialLibraryOpen(true);
                        }}
                      >
                        <Replace className="w-4 h-4 mr-2" />
                        Replace
                      </Button>
                    </div>

                    {/* Thickness Slider + Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Thickness</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0.1"
                            max="1000"
                            step="0.1"
                            value={layer.thickness}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0 && val <= 1000) {
                                updateLayer(index, { thickness: val });
                              }
                            }}
                            className="w-20 h-7 text-sm font-mono"
                          />
                          <span className="text-sm text-muted-foreground">mm</span>
                        </div>
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
                          <div>
                            <span className="text-sm font-medium">
                              {layer.bridging.material.name}
                            </span>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              λ = {layer.bridging.material.thermalConductivity} W/mK
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectingBridgingForLayer(index);
                              setReplacingLayerIndex(null);
                              setAddingToIndex(null);
                              setMaterialLibraryOpen(true);
                            }}
                          >
                            Change
                          </Button>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Bridging Percentage</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0.001"
                                max="100"
                                step="0.001"
                                value={layer.bridging.percentage}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 0.001 && val <= 100) {
                                    updateLayer(index, {
                                      bridging: { ...layer.bridging!, percentage: val }
                                    });
                                  }
                                }}
                                className="w-28 h-7 text-xs font-mono"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                          <Slider
                            value={[Math.min(Math.max(layer.bridging.percentage, 0.1), 100)]}
                            onValueChange={([value]) => updateLayer(index, {
                              bridging: { ...layer.bridging!, percentage: value }
                            })}
                            min={0.1}
                            max={100}
                            step={0.1}
                          />
                          <p className="text-xs text-muted-foreground">
                            Slider: 0.1% - 100% | Manual input: 0.001% - 100%
                          </p>
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
              setSelectingBridgingForLayer(null);
              setReplacingLayerIndex(null);
              setMaterialLibraryOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Layer
          </Button>
        </div>
      </ScrollArea>

      {/* Bottom surface based on construction type */}
      {construction.type === 'floor' ? (
        <>
          {/* Internal Surface at BOTTOM for floors */}
          <div className="flex items-center gap-2 px-2 py-2 text-xs mt-2">
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Internal Surface (Room)</span>
              {editingRsi ? (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Rsi =</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={construction.internalSurfaceResistance}
                    onChange={(e) => updateSurfaceResistance('internal', e.target.value)}
                    className="w-20 h-6 text-xs"
                    onBlur={() => setEditingRsi(false)}
                    autoFocus
                  />
                  <span className="text-muted-foreground">m²K/W</span>
                </div>
              ) : (
                <button
                  onClick={() => setEditingRsi(true)}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <span className="font-mono">(Rsi = {construction.internalSurfaceResistance} m²K/W)</span>
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      ) : (
        <>
          {/* External Surface Rse at BOTTOM for walls */}
          <div className="flex items-center gap-2 px-2 py-2 text-xs mt-2">
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">External Surface</span>
              {editingRse ? (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Rse =</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={construction.externalSurfaceResistance}
                    onChange={(e) => updateSurfaceResistance('external', e.target.value)}
                    className="w-20 h-6 text-xs"
                    onBlur={() => setEditingRse(false)}
                    autoFocus
                  />
                  <span className="text-muted-foreground">m²K/W</span>
                </div>
              ) : (
                <button
                  onClick={() => setEditingRse(true)}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <span className="font-mono">(Rse = {construction.externalSurfaceResistance} m²K/W)</span>
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>
        </>
      )}

      <MaterialLibrary
        open={materialLibraryOpen}
        onClose={() => {
          setMaterialLibraryOpen(false);
          setSelectingBridgingForLayer(null);
          setReplacingLayerIndex(null);
          setAddingToIndex(null);
        }}
        onSelect={handleMaterialSelect}
        mode={selectingBridgingForLayer !== null ? 'bridging' : replacingLayerIndex !== null ? 'replace' : 'layer'}
      />
    </div>
  );
}
