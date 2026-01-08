import { useState } from 'react';
import { Material, MaterialCategory } from '@/types/materials';
import { ukMaterialDatabase, materialCategories, getAllMaterials, addCustomMaterial, getCustomMaterials } from '@/data/ukMaterials';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, X, Beaker } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
interface MaterialLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelect: (material: Material) => void;
  mode?: 'layer' | 'bridging' | 'replace';
}
export function MaterialLibrary({
  open,
  onClose,
  onSelect,
  mode = 'layer'
}: MaterialLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MaterialCategory | 'all'>('all');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customMaterialsList, setCustomMaterialsList] = useState<Material[]>(getCustomMaterials());

  // Custom material form state
  const [customName, setCustomName] = useState('');
  const [customLambda, setCustomLambda] = useState('');
  const [customMu, setCustomMu] = useState('');
  const [customDensity, setCustomDensity] = useState('');
  const [customSpecificHeat, setCustomSpecificHeat] = useState('');
  const [customCategory, setCustomCategory] = useState<MaterialCategory>('custom');
  const [customDescription, setCustomDescription] = useState('');
  const allMaterials = [...ukMaterialDatabase, ...customMaterialsList];
  const filteredMaterials = allMaterials.filter(material => {
    const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase()) || material.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || material.category === activeCategory;
    return matchesSearch && matchesCategory;
  });
  const handleSelect = (material: Material) => {
    onSelect(material);
    onClose();
  };
  const handleCreateCustom = () => {
    if (!customName || !customLambda || !customMu) {
      toast.error('Please fill in required fields: Name, λ, and μ');
      return;
    }
    const newMaterial: Material = {
      id: `custom-${Date.now()}`,
      name: customName,
      category: customCategory,
      thermalConductivity: parseFloat(customLambda),
      vapourResistivity: parseFloat(customMu),
      density: parseFloat(customDensity) || 1000,
      specificHeat: parseFloat(customSpecificHeat) || 1000,
      description: customDescription || 'Custom material',
      isCustom: true
    };
    addCustomMaterial(newMaterial);
    setCustomMaterialsList([...getCustomMaterials()]);

    // Reset form
    setCustomName('');
    setCustomLambda('');
    setCustomMu('');
    setCustomDensity('');
    setCustomSpecificHeat('');
    setCustomDescription('');
    setShowCustomForm(false);
    toast.success(`Custom material "${customName}" created`);
    handleSelect(newMaterial);
  };
  const getModeLabel = () => {
    switch (mode) {
      case 'bridging':
        return 'Selecting Bridging Material';
      case 'replace':
        return 'Replacing Layer Material';
      default:
        return null;
    }
  };
  return <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col bg-card border-border p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            UK Material Library
            {getModeLabel() && <span className="text-xs px-2 py-1 rounded bg-warning/20 text-warning">
                {getModeLabel()}
              </span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-6 pb-6 flex flex-col gap-3">
          {/* Search and Custom Material Toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search materials..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-secondary border-border" />
            </div>
            <Button variant={showCustomForm ? "default" : "outline"} onClick={() => setShowCustomForm(!showCustomForm)} className="shrink-0">
              <Beaker className="w-4 h-4 mr-2" />
              Custom Material
            </Button>
          </div>

          {/* Custom Material Form */}
          {showCustomForm && <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-4 mb-4">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Beaker className="w-4 h-4 text-primary" />
                Create Custom Material
              </h4>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <Label className="text-xs">Material Name *</Label>
                  <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g., Special Insulation" className="mt-1" />
                </div>
                
                <div>
                  <Label className="text-xs">λ - Thermal Conductivity (W/mK) *</Label>
                  <Input type="number" step="0.001" value={customLambda} onChange={e => setCustomLambda(e.target.value)} placeholder="0.035" className="mt-1" />
                </div>
                
                <div>
                  <Label className="text-xs">μ - Vapour Resistivity (MNs/gm) *</Label>
                  <Input type="number" step="1" value={customMu} onChange={e => setCustomMu(e.target.value)} placeholder="50" className="mt-1" />
                </div>
                
                <div>
                  <Label className="text-xs">ρ - Density (kg/m³)</Label>
                  <Input type="number" step="1" value={customDensity} onChange={e => setCustomDensity(e.target.value)} placeholder="1000" className="mt-1" />
                </div>
                
                <div>
                  <Label className="text-xs">Specific Heat (J/kgK)</Label>
                  <Input type="number" step="1" value={customSpecificHeat} onChange={e => setCustomSpecificHeat(e.target.value)} placeholder="1000" className="mt-1" />
                </div>
                
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={customCategory} onValueChange={v => setCustomCategory(v as MaterialCategory)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {materialCategories.map(cat => <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label className="text-xs">Description</Label>
                <Input value={customDescription} onChange={e => setCustomDescription(e.target.value)} placeholder="Brief description of the material" className="mt-1" />
              </div>
              
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowCustomForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateCustom}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create & Select
                </Button>
              </div>
            </div>}

          {/* Category Tabs - Always visible with horizontal scroll */}
          <ScrollArea className="w-full shrink-0" orientation="horizontal">
            <div className="flex gap-2 pb-2 px-1">
              <Button variant={activeCategory === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setActiveCategory('all')} className="shrink-0 whitespace-nowrap">
                All ({allMaterials.length})
              </Button>
              {materialCategories.map(cat => {
              const count = allMaterials.filter(m => m.category === cat.value).length;
              if (count === 0) return null;
              return <Button key={cat.value} variant={activeCategory === cat.value ? 'default' : 'outline'} size="sm" onClick={() => setActiveCategory(cat.value)} className="shrink-0 whitespace-nowrap">
                    {cat.label} ({count})
                  </Button>;
            })}
            </div>
          </ScrollArea>

          {/* Materials Grid - Constrained height to ensure categories are visible */}
          <ScrollArea className="flex-1 min-h-0 max-h-[400px] border rounded-lg bg-secondary/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
              {filteredMaterials.map(material => <button key={material.id} onClick={() => handleSelect(material)} className={cn("material-layer text-left hover:border-primary/50 transition-all group", material.isCustom && "border-primary/30 bg-primary/5")}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {material.name}
                        </h4>
                        {material.isCustom && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                            Custom
                          </span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {material.description}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="min-w-0">
                      <span className="text-muted-foreground">λ</span>
                      <span className="ml-1 font-mono text-foreground">{material.thermalConductivity}</span>
                      <span className="text-muted-foreground ml-0.5 hidden sm:inline">W/mK</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-muted-foreground">μ</span>
                      <span className="ml-1 font-mono text-foreground">{material.vapourResistivity}</span>
                      <span className="text-muted-foreground ml-0.5 hidden sm:inline">MNs/gm</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-muted-foreground">ρ</span>
                      <span className="ml-1 font-mono text-foreground">{material.density}</span>
                      <span className="text-muted-foreground ml-0.5 hidden sm:inline">kg/m³</span>
                    </div>
                  </div>
                  
                  {material.thermalResistance && <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">R</span>
                      <span className="ml-1 font-mono text-primary">{material.thermalResistance}</span>
                      <span className="text-muted-foreground ml-0.5">m²K/W (fixed)</span>
                    </div>}
                </button>)}
              
              {filteredMaterials.length === 0 && <div className="col-span-2 text-center py-8 text-muted-foreground">
                  No materials found. Try a different search or create a custom material.
                </div>}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>;
}