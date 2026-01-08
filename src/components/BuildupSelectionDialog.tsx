import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BuildupData, ProjectData } from '@/hooks/useProjects';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Layers } from 'lucide-react';

interface BuildupSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProject: ProjectData | null;
  currentBuildupId: string | null;
  onRunAnalysis: (buildupIds: string[]) => void;
}

export function BuildupSelectionDialog({
  open,
  onOpenChange,
  currentProject,
  currentBuildupId,
  onRunAnalysis,
}: BuildupSelectionDialogProps) {
  const [selectedBuildups, setSelectedBuildups] = useState<string[]>([]);
  const [mode, setMode] = useState<'single' | 'multiple' | null>(null);

  const handleModeSelect = (selectedMode: 'single' | 'multiple') => {
    if (selectedMode === 'single') {
      // Run analysis for current buildup only
      if (currentBuildupId) {
        onRunAnalysis([currentBuildupId]);
        onOpenChange(false);
      }
    } else {
      setMode('multiple');
      // Pre-select current buildup
      if (currentBuildupId) {
        setSelectedBuildups([currentBuildupId]);
      }
    }
  };

  const handleBuildupToggle = (buildupId: string) => {
    setSelectedBuildups(prev => 
      prev.includes(buildupId) 
        ? prev.filter(id => id !== buildupId)
        : [...prev, buildupId]
    );
  };

  const handleSelectAll = () => {
    if (currentProject) {
      setSelectedBuildups(currentProject.buildups.map(b => b.id));
    }
  };

  const handleDeselectAll = () => {
    setSelectedBuildups([]);
  };

  const handleConfirm = () => {
    if (selectedBuildups.length > 0) {
      onRunAnalysis(selectedBuildups);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setMode(null);
    setSelectedBuildups([]);
    onOpenChange(false);
  };

  if (!currentProject) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run Analysis</DialogTitle>
          <DialogDescription>
            Choose whether to analyze just the current build-up or generate a report for multiple build-ups.
          </DialogDescription>
        </DialogHeader>

        {mode === null ? (
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => handleModeSelect('single')}
            >
              <Layers className="w-6 h-6" />
              <span className="text-sm">Current Build-up Only</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => handleModeSelect('multiple')}
              disabled={currentProject.buildups.length < 2}
            >
              <FileText className="w-6 h-6" />
              <span className="text-sm">Multiple Build-ups</span>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                {selectedBuildups.length} of {currentProject.buildups.length} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                  Clear
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[200px] border rounded-md p-2">
              <div className="space-y-2">
                {currentProject.buildups.map((buildup) => (
                  <div
                    key={buildup.id}
                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50"
                  >
                    <Checkbox
                      id={buildup.id}
                      checked={selectedBuildups.includes(buildup.id)}
                      onCheckedChange={() => handleBuildupToggle(buildup.id)}
                    />
                    <Label htmlFor={buildup.id} className="flex-1 cursor-pointer">
                      <div className="font-medium text-sm">{buildup.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {buildup.construction_type === 'wall' ? 'Wall' : 'Floor'} • {buildup.layers.length} layers
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setMode(null)}>
                Back
              </Button>
              <Button 
                onClick={handleConfirm}
                disabled={selectedBuildups.length === 0}
              >
                Run Analysis ({selectedBuildups.length})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
