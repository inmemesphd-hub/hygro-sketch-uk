import { useState } from 'react';
import { useProjects, ProjectData, BuildupData } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  FolderPlus, 
  Folder, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  Plus,
  LogOut,
  User,
  Layers,
  Building2,
  Home,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectManagerProps {
  onSelectBuildup: (buildup: BuildupData | null, projectId: string) => void;
  selectedBuildupId: string | null;
}

export function ProjectManager({ onSelectBuildup, selectedBuildupId }: ProjectManagerProps) {
  const { user, signOut } = useAuth();
  const { 
    projects, 
    currentProject,
    setCurrentProject,
    createProject, 
    updateProject, 
    deleteProject,
    createBuildup,
    deleteBuildup,
    updateBuildup,
    duplicateBuildup,
    loading 
  } = useProjects();
  
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);
  const [editingBuildup, setEditingBuildup] = useState<BuildupData | null>(null);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [isEditBuildupOpen, setIsEditBuildupOpen] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const project = await createProject(newProjectName.trim());
    if (project) {
      setNewProjectName('');
      setIsNewProjectOpen(false);
      // Auto-create first buildup
      const buildup = await createBuildup(project.id, { name: 'Build-up 1' });
      if (buildup) {
        onSelectBuildup(buildup, project.id);
      }
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !newProjectName.trim()) return;
    await updateProject(editingProject.id, { name: newProjectName.trim() });
    setEditingProject(null);
    setNewProjectName('');
    setIsEditProjectOpen(false);
  };

  const handleAddBuildup = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const buildup = await createBuildup(projectId);
    if (buildup) {
      setCurrentProject(project);
      onSelectBuildup(buildup, projectId);
    }
  };

  const handleUpdateBuildup = async () => {
    if (!editingBuildup || !newProjectName.trim()) return;
    await updateBuildup(editingBuildup.id, { name: newProjectName.trim() });
    setEditingBuildup(null);
    setNewProjectName('');
    setIsEditBuildupOpen(false);
  };

  const handleDuplicateBuildup = async (buildup: BuildupData, project: ProjectData) => {
    const newBuildup = await duplicateBuildup(buildup.id);
    if (newBuildup) {
      setCurrentProject(project);
      onSelectBuildup(newBuildup, project.id);
    }
  };

  const handleSelectBuildup = (buildup: BuildupData, project: ProjectData) => {
    setCurrentProject(project);
    onSelectBuildup(buildup, project.id);
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* User header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium truncate">{user?.email}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* New project button */}
      <div className="p-3 border-b border-border">
        <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <FolderPlus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My Project"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewProjectOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateProject}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Projects list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {loading ? (
            <div className="text-center text-muted-foreground text-sm py-4">Loading...</div>
          ) : projects.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">
              No projects yet. Create one to get started!
            </div>
          ) : (
            projects.map((project) => (
              <div key={project.id} className="space-y-1">
                {/* Project header */}
                <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group">
                  <Folder className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{project.name}</span>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleAddBuildup(project.id)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Build-up
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setEditingProject(project);
                        setNewProjectName(project.name);
                        setIsEditProjectOpen(true);
                      }}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => deleteProject(project.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {/* Buildups list */}
                <div className="ml-4 space-y-1">
                  {project.buildups.map((buildup) => (
                    <div 
                      key={buildup.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-md cursor-pointer group",
                        selectedBuildupId === buildup.id 
                          ? "bg-primary/10 text-primary" 
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => handleSelectBuildup(buildup, project)}
                    >
                      {buildup.construction_type === 'floor' ? (
                        <Home className="w-4 h-4 shrink-0" />
                      ) : (
                        <Building2 className="w-4 h-4 shrink-0" />
                      )}
                      <span className="text-sm flex-1 truncate">
                        {buildup.buildup_number}. {buildup.name}
                      </span>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateBuildup(buildup, project);
                          }}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setEditingBuildup(buildup);
                            setNewProjectName(buildup.name);
                            setIsEditBuildupOpen(true);
                          }}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBuildup(buildup.id);
                              if (selectedBuildupId === buildup.id) {
                                onSelectBuildup(null, project.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                  
                  {/* Add buildup button */}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => handleAddBuildup(project.id)}
                  >
                    <Plus className="w-3 h-3 mr-2" />
                    Add build-up
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      {/* Edit project dialog */}
      <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-project-name">Project Name</Label>
              <Input
                id="edit-project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProject}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit buildup dialog */}
      <Dialog open={isEditBuildupOpen} onOpenChange={setIsEditBuildupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Build-up</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-buildup-name">Build-up Name</Label>
              <Input
                id="edit-buildup-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditBuildupOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateBuildup}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
