import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileDown, FileType } from 'lucide-react';

export interface BuildupForExport {
  id: string;
  name: string;
  projectName: string;
}

interface ReportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildups: BuildupForExport[];
  currentBuildupId: string | null;
  exportFormat: 'pdf' | 'word';
  onExport: (selectedBuildupIds: string[]) => void;
}

export function ReportExportDialog({
  open,
  onOpenChange,
  buildups,
  currentBuildupId,
  exportFormat,
  onExport,
}: ReportExportDialogProps) {
  const [selectedBuildups, setSelectedBuildups] = useState<Set<string>>(
    currentBuildupId ? new Set([currentBuildupId]) : new Set()
  );

  const handleToggleBuildup = (id: string) => {
    const newSelected = new Set(selectedBuildups);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedBuildups(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedBuildups.size === buildups.length) {
      setSelectedBuildups(new Set());
    } else {
      setSelectedBuildups(new Set(buildups.map(b => b.id)));
    }
  };

  const handleExport = () => {
    onExport(Array.from(selectedBuildups));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Report</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Select which build-ups to include in the report:
          </p>
          
          <div className="flex items-center gap-2 mb-3">
            <Checkbox
              id="select-all"
              checked={selectedBuildups.size === buildups.length}
              onCheckedChange={handleSelectAll}
            />
            <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Select All ({buildups.length} build-ups)
            </Label>
          </div>
          
          <ScrollArea className="h-[200px] border rounded-lg p-3">
            <div className="space-y-2">
              {buildups.map((buildup) => (
                <div key={buildup.id} className="flex items-center gap-2">
                  <Checkbox
                    id={buildup.id}
                    checked={selectedBuildups.has(buildup.id)}
                    onCheckedChange={() => handleToggleBuildup(buildup.id)}
                  />
                  <Label htmlFor={buildup.id} className="text-sm cursor-pointer flex-1">
                    <span className="font-medium">{buildup.name}</span>
                    <span className="text-muted-foreground ml-2">({buildup.projectName})</span>
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport}
            disabled={selectedBuildups.size === 0}
          >
            {exportFormat === 'pdf' ? (
              <FileDown className="w-4 h-4 mr-2" />
            ) : (
              <FileType className="w-4 h-4 mr-2" />
            )}
            Export {selectedBuildups.size} Build-up{selectedBuildups.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
