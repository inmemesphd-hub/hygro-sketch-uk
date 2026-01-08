import { useState } from 'react';
import { Material, MaterialCategory } from '@/types/materials';
import { ukMaterialDatabase, materialCategories, getMaterialsByCategory } from '@/data/ukMaterials';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface MaterialLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelect: (material: Material) => void;
}

export function MaterialLibrary({ open, onClose, onSelect }: MaterialLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MaterialCategory | 'all'>('all');

  const filteredMaterials = ukMaterialDatabase.filter(material => {
    const matchesSearch = material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      material.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || material.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSelect = (material: Material) => {
    onSelect(material);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">UK Material Library</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>

          {/* Category Tabs */}
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              <Button
                variant={activeCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory('all')}
                className="shrink-0"
              >
                All
              </Button>
              {materialCategories.map(cat => (
                <Button
                  key={cat.value}
                  variant={activeCategory === cat.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveCategory(cat.value)}
                  className="shrink-0"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </ScrollArea>

          {/* Materials Grid */}
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-4">
              {filteredMaterials.map(material => (
                <button
                  key={material.id}
                  onClick={() => handleSelect(material)}
                  className="material-layer text-left hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {material.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {material.description}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">λ</span>
                      <span className="ml-1 font-mono text-foreground">{material.thermalConductivity}</span>
                      <span className="text-muted-foreground ml-0.5">W/mK</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">μ</span>
                      <span className="ml-1 font-mono text-foreground">{material.vapourResistivity}</span>
                      <span className="text-muted-foreground ml-0.5">MNs/gm</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">ρ</span>
                      <span className="ml-1 font-mono text-foreground">{material.density}</span>
                      <span className="text-muted-foreground ml-0.5">kg/m³</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
