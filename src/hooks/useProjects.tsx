import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Construction, ConstructionLayer, Material } from '@/types/materials';
import { ukMaterialDatabase } from '@/data/ukMaterials';
import { FloorType } from '@/components/JunctionCanvas';
import { HumidityClass } from '@/data/ukClimate';

export interface BuildupData {
  id: string;
  project_id: string;
  name: string;
  buildup_number: number;
  construction_type: 'wall' | 'floor';
  floor_type: FloorType | null;
  perimeter: number | null;
  area: number | null;
  layers: ConstructionLayer[];
  climate_location: string;
  humidity_class: HumidityClass;
  internal_temp: number;
  internal_rh: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectData {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  buildups: BuildupData[];
}

// Helper to serialize layers for storage (convert material objects to IDs, store custom material data)
const serializeLayers = (layers: ConstructionLayer[]): any[] => {
  return layers.map(layer => {
    // Check if this is a custom material (not in the database)
    const isCustomMaterial = !ukMaterialDatabase.find(m => m.id === layer.material.id);
    
    let bridgingData = null;
    if (layer.bridging) {
      const isBridgingCustom = !ukMaterialDatabase.find(m => m.id === layer.bridging!.material.id);
      bridgingData = {
        materialId: layer.bridging.material.id,
        customMaterial: isBridgingCustom ? layer.bridging.material : null,
        percentage: layer.bridging.percentage,
      };
    }
    
    return {
      id: layer.id,
      materialId: layer.material.id,
      // Store full material data for custom materials
      customMaterial: isCustomMaterial ? layer.material : null,
      thickness: layer.thickness,
      bridging: bridgingData,
    };
  });
};

// Helper to deserialize layers from storage (convert IDs back to material objects, restore custom materials)
const deserializeLayers = (layersData: any[]): ConstructionLayer[] => {
  return layersData.map((layerData: any) => {
    // First try database, then use stored custom material
    let material = ukMaterialDatabase.find(m => m.id === layerData.materialId);
    if (!material && layerData.customMaterial) {
      material = layerData.customMaterial as Material;
    }
    if (!material) {
      console.warn(`Material not found: ${layerData.materialId}`);
      return null;
    }
    
    const layer: ConstructionLayer = {
      id: layerData.id,
      material,
      thickness: layerData.thickness,
    };
    
    if (layerData.bridging) {
      // First try database, then use stored custom bridging material
      let bridgingMaterial = ukMaterialDatabase.find(m => m.id === layerData.bridging.materialId);
      if (!bridgingMaterial && layerData.bridging.customMaterial) {
        bridgingMaterial = layerData.bridging.customMaterial as Material;
      }
      if (bridgingMaterial) {
        layer.bridging = {
          material: bridgingMaterial,
          percentage: layerData.bridging.percentage,
        };
      }
    }
    
    return layer;
  }).filter(Boolean) as ConstructionLayer[];
};

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (projectsError) throw projectsError;
      
      const projectsWithBuildups: ProjectData[] = [];
      
      for (const project of projectsData || []) {
        const { data: buildupsData, error: buildupsError } = await supabase
          .from('buildups')
          .select('*')
          .eq('project_id', project.id)
          .order('buildup_number', { ascending: true });
        
        if (buildupsError) throw buildupsError;
        
        const buildups: BuildupData[] = (buildupsData || []).map(b => ({
          id: b.id,
          project_id: b.project_id,
          name: b.name,
          buildup_number: b.buildup_number,
          construction_type: b.construction_type as 'wall' | 'floor',
          floor_type: b.floor_type as FloorType | null,
          perimeter: b.perimeter ? Number(b.perimeter) : null,
          area: b.area ? Number(b.area) : null,
          layers: deserializeLayers(b.layers as any[] || []),
          climate_location: b.climate_location,
          humidity_class: (b.humidity_class as HumidityClass) || 3,
          internal_temp: Number(b.internal_temp),
          internal_rh: Number(b.internal_rh),
          created_at: b.created_at,
          updated_at: b.updated_at,
        }));
        
        projectsWithBuildups.push({
          id: project.id,
          name: project.name,
          created_at: project.created_at,
          updated_at: project.updated_at,
          buildups,
        });
      }
      
      setProjects(projectsWithBuildups);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (name: string = 'Untitled Project'): Promise<ProjectData | null> => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({ user_id: user.id, name })
        .select()
        .single();
      
      if (error) throw error;
      
      const newProject: ProjectData = {
        id: data.id,
        name: data.name,
        created_at: data.created_at,
        updated_at: data.updated_at,
        buildups: [],
      };
      
      setProjects(prev => [newProject, ...prev]);
      setCurrentProject(newProject);
      return newProject;
    } catch (error) {
      console.error('Error creating project:', error);
      return null;
    }
  };

  const updateProject = async (projectId: string, updates: Partial<{ name: string }>) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId);
      
      if (error) throw error;
      
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));
      if (currentProject?.id === projectId) {
        setCurrentProject(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      
      if (error) throw error;
      
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const createBuildup = async (
    projectId: string,
    data: {
      name?: string;
      construction_type?: 'wall' | 'floor';
      floor_type?: FloorType | null;
      perimeter?: number;
      area?: number;
      layers?: ConstructionLayer[];
      climate_location?: string;
      humidity_class?: HumidityClass;
      internal_temp?: number;
      internal_rh?: number;
    } = {}
  ): Promise<BuildupData | null> => {
    if (!user) return null;
    
    try {
      // Get next buildup number
      const project = projects.find(p => p.id === projectId);
      const nextNumber = project ? Math.max(0, ...project.buildups.map(b => b.buildup_number)) + 1 : 1;
      
      const { data: result, error } = await supabase
        .from('buildups')
        .insert({
          project_id: projectId,
          user_id: user.id,
          name: data.name || `Build-up ${nextNumber}`,
          buildup_number: nextNumber,
          construction_type: data.construction_type || 'wall',
          floor_type: data.floor_type || null,
          perimeter: data.perimeter || null,
          area: data.area || null,
          layers: serializeLayers(data.layers || []),
          climate_location: data.climate_location || 'london',
          humidity_class: data.humidity_class || 3,
          internal_temp: data.internal_temp || 20,
          internal_rh: data.internal_rh || 50,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const newBuildup: BuildupData = {
        id: result.id,
        project_id: result.project_id,
        name: result.name,
        buildup_number: result.buildup_number,
        construction_type: result.construction_type as 'wall' | 'floor',
        floor_type: result.floor_type as FloorType | null,
        perimeter: result.perimeter ? Number(result.perimeter) : null,
        area: result.area ? Number(result.area) : null,
        layers: deserializeLayers(result.layers as any[] || []),
        climate_location: result.climate_location,
        humidity_class: (result.humidity_class as HumidityClass) || 3,
        internal_temp: Number(result.internal_temp),
        internal_rh: Number(result.internal_rh),
        created_at: result.created_at,
        updated_at: result.updated_at,
      };
      
      setProjects(prev => prev.map(p => 
        p.id === projectId 
          ? { ...p, buildups: [...p.buildups, newBuildup] }
          : p
      ));
      
      if (currentProject?.id === projectId) {
        setCurrentProject(prev => prev ? { ...prev, buildups: [...prev.buildups, newBuildup] } : null);
      }
      
      return newBuildup;
    } catch (error) {
      console.error('Error creating buildup:', error);
      return null;
    }
  };

  const updateBuildup = async (
    buildupId: string,
    updates: Partial<{
      name: string;
      construction_type: 'wall' | 'floor';
      floor_type: FloorType | null;
      perimeter: number | null;
      area: number | null;
      layers: ConstructionLayer[];
      climate_location: string;
      humidity_class: HumidityClass;
      internal_temp: number;
      internal_rh: number;
    }>
  ) => {
    try {
      const dbUpdates: any = { ...updates };
      if (updates.layers) {
        dbUpdates.layers = serializeLayers(updates.layers);
      }
      
      const { error } = await supabase
        .from('buildups')
        .update(dbUpdates)
        .eq('id', buildupId);
      
      if (error) throw error;
      
      // Update local state
      setProjects(prev => prev.map(p => ({
        ...p,
        buildups: p.buildups.map(b => 
          b.id === buildupId ? { ...b, ...updates } : b
        )
      })));
      
      if (currentProject) {
        setCurrentProject(prev => prev ? {
          ...prev,
          buildups: prev.buildups.map(b => 
            b.id === buildupId ? { ...b, ...updates } : b
          )
        } : null);
      }
    } catch (error) {
      console.error('Error updating buildup:', error);
    }
  };

  const deleteBuildup = async (buildupId: string) => {
    try {
      const { error } = await supabase
        .from('buildups')
        .delete()
        .eq('id', buildupId);
      
      if (error) throw error;
      
      setProjects(prev => prev.map(p => ({
        ...p,
        buildups: p.buildups.filter(b => b.id !== buildupId)
      })));
      
      if (currentProject) {
        setCurrentProject(prev => prev ? {
          ...prev,
          buildups: prev.buildups.filter(b => b.id !== buildupId)
        } : null);
      }
    } catch (error) {
      console.error('Error deleting buildup:', error);
    }
  };

  const duplicateBuildup = async (buildupId: string): Promise<BuildupData | null> => {
    if (!user) return null;
    
    // Find the buildup to duplicate
    let sourceBuildupData: BuildupData | null = null;
    let projectId: string | null = null;
    
    for (const project of projects) {
      const found = project.buildups.find(b => b.id === buildupId);
      if (found) {
        sourceBuildupData = found;
        projectId = project.id;
        break;
      }
    }
    
    if (!sourceBuildupData || !projectId) return null;
    
    try {
      // Get next buildup number
      const project = projects.find(p => p.id === projectId);
      const nextNumber = project ? Math.max(0, ...project.buildups.map(b => b.buildup_number)) + 1 : 1;
      
      const { data: result, error } = await supabase
        .from('buildups')
        .insert({
          project_id: projectId,
          user_id: user.id,
          name: `${sourceBuildupData.name} (Copy)`,
          buildup_number: nextNumber,
          construction_type: sourceBuildupData.construction_type,
          floor_type: sourceBuildupData.floor_type,
          perimeter: sourceBuildupData.perimeter,
          area: sourceBuildupData.area,
          layers: serializeLayers(sourceBuildupData.layers),
          climate_location: sourceBuildupData.climate_location,
          humidity_class: sourceBuildupData.humidity_class,
          internal_temp: sourceBuildupData.internal_temp,
          internal_rh: sourceBuildupData.internal_rh,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const newBuildup: BuildupData = {
        id: result.id,
        project_id: result.project_id,
        name: result.name,
        buildup_number: result.buildup_number,
        construction_type: result.construction_type as 'wall' | 'floor',
        floor_type: result.floor_type as FloorType | null,
        perimeter: result.perimeter ? Number(result.perimeter) : null,
        area: result.area ? Number(result.area) : null,
        layers: deserializeLayers(result.layers as any[] || []),
        climate_location: result.climate_location,
        humidity_class: (result.humidity_class as HumidityClass) || 3,
        internal_temp: Number(result.internal_temp),
        internal_rh: Number(result.internal_rh),
        created_at: result.created_at,
        updated_at: result.updated_at,
      };
      
      setProjects(prev => prev.map(p => 
        p.id === projectId 
          ? { ...p, buildups: [...p.buildups, newBuildup] }
          : p
      ));
      
      if (currentProject?.id === projectId) {
        setCurrentProject(prev => prev ? { ...prev, buildups: [...prev.buildups, newBuildup] } : null);
      }
      
      return newBuildup;
    } catch (error) {
      console.error('Error duplicating buildup:', error);
      return null;
    }
  };

  return {
    projects,
    currentProject,
    setCurrentProject,
    loading,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    createBuildup,
    updateBuildup,
    deleteBuildup,
    duplicateBuildup,
  };
}
