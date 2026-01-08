export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  thermalConductivity: number; // W/(m·K)
  vapourResistivity: number; // MN·s/(g·m)
  density: number; // kg/m³
  specificHeat: number; // J/(kg·K)
  description?: string;
  thermalResistance?: number; // For air gaps with fixed R-value
  isCustom?: boolean;
}

export type MaterialCategory = 
  | 'insulation'
  | 'masonry'
  | 'timber'
  | 'metal'
  | 'membrane'
  | 'plasterboard'
  | 'render'
  | 'cladding'
  | 'concrete'
  | 'airgap'
  | 'flooring'
  | 'glazing'
  | 'custom';

export interface ConstructionLayer {
  id: string;
  material: Material;
  thickness: number; // mm
  bridging?: BridgingElement;
}

export interface BridgingElement {
  material: Material;
  percentage: number; // % of layer area
  spacing?: number; // mm center-to-center
  width?: number; // mm
}

export interface Construction {
  id: string;
  name: string;
  type: ConstructionType;
  layers: ConstructionLayer[];
  internalSurfaceResistance: number; // m²·K/W
  externalSurfaceResistance: number; // m²·K/W
}

export type ConstructionType = 
  | 'wall'
  | 'roof'
  | 'floor'
  | 'junction';

export interface JunctionModel {
  id: string;
  name: string;
  type: JunctionType;
  constructions: Construction[];
  psiValue?: number; // W/(m·K)
  fRsi?: number; // Temperature factor
}

export type JunctionType =
  | 'wall-roof'
  | 'wall-floor'
  | 'wall-wall'
  | 'window-wall'
  | 'door-wall'
  | 'custom';

export interface ClimateData {
  month: string;
  externalTemp: number; // °C
  externalRH: number; // %
  internalTemp: number; // °C
  internalRH: number; // %
}

export interface CondensationResult {
  layer: number;
  position: number; // mm from internal surface
  monthlyAccumulation: number[]; // g/m² for each month
  totalAccumulation: number; // g/m²
  evaporationRate: number; // g/m² per month
  risk: 'none' | 'surface' | 'interstitial';
  passes: boolean;
}

export interface AnalysisResult {
  construction: Construction;
  uValue: number; // W/(m²·K)
  uValueWithoutBridging?: number; // W/(m²·K) - U-value ignoring thermal bridges
  psiValue?: number;
  temperatureGradient: { position: number; temperature: number }[];
  vapourPressureGradient: { position: number; pressure: number; saturation: number }[];
  saturationPressureGradient: { position: number; pressure: number }[];
  condensationResults: CondensationResult[];
  monthlyData: MonthlyAnalysis[];
  overallResult: 'pass' | 'fail';
  failureReason?: string;
  // Surface condensation data per month
  surfaceCondensationData?: SurfaceCondensationMonth[];
}

export interface MonthlyAnalysis {
  month: string;
  condensationAmount: number; // g/m²
  evaporationAmount: number; // g/m²
  netAccumulation: number; // g/m²
  cumulativeAccumulation: number; // g/m²
}

export interface SurfaceCondensationMonth {
  month: string;
  externalTemp: number;
  externalRH: number;
  internalTemp: number;
  internalRH: number;
  minTempFactor: number;
  minTsi: number;
  tsi: number;
}
