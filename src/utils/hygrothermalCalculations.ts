import { Construction, ConstructionLayer, ClimateData, AnalysisResult, MonthlyAnalysis, CondensationResult, SurfaceCondensationMonth } from '@/types/materials';

// Constants
const GAS_CONSTANT = 461.5; // J/(kg·K) for water vapour

// BS EN ISO 13788 constants for vapour diffusion
const DELTA_0 = 2e-10; // Water vapour permeability of air (kg/(m·s·Pa))
const SECONDS_PER_MONTH = 30.4 * 24 * 3600; // Average seconds per month

// Default soil thermal conductivities per BS EN ISO 13370
export const SOIL_TYPES = {
  clay_silt: { name: 'Clay or Silt', lambda: 1.5 },
  sand_gravel: { name: 'Sand or Gravel', lambda: 2.0 },
  rock: { name: 'Homogeneous Rock', lambda: 3.5 },
  custom: { name: 'Custom', lambda: 2.0 },
} as const;

export type SoilType = keyof typeof SOIL_TYPES;

/**
 * Calculate saturation vapour pressure using Magnus formula
 * @param temperature in °C
 * @returns pressure in Pa
 */
export function calculateSaturationPressure(temperature: number): number {
  // Magnus formula (accurate for -40°C to +50°C)
  const a = 17.27;
  const b = 237.7;
  return 610.78 * Math.exp((a * temperature) / (b + temperature));
}

/**
 * Calculate actual vapour pressure from temperature and RH
 */
export function calculateVapourPressure(temperature: number, relativeHumidity: number): number {
  return calculateSaturationPressure(temperature) * (relativeHumidity / 100);
}

/**
 * Calculate thermal resistance of a layer (without bridging consideration)
 * Bridging is handled by the Combined Method in calculateUValue
 * per BS EN ISO 6946:2017 Section 6.7.2
 */
export function calculateLayerThermalResistance(layer: ConstructionLayer): number {
  const thickness = layer.thickness / 1000; // Convert mm to m
  
  // If material has fixed thermal resistance (like air gaps), use it
  if (layer.material.thermalResistance !== undefined) {
    return layer.material.thermalResistance;
  }
  
  return thickness / layer.material.thermalConductivity;
}

/**
 * Calculate S_d (equivalent air layer thickness) for a layer
 * per BS EN ISO 13788
 * S_d = μ × d (metres)
 * 
 * Note: In our material database, vapourResistivity is stored as the μ (mu) value
 * (water vapour resistance factor), not as MNs/gm. This is the dimensionless
 * ratio of the material's vapour resistance to that of still air.
 */
export function calculateSd(layer: ConstructionLayer): number {
  const thickness_m = layer.thickness / 1000;
  // vapourResistivity in our DB is effectively the μ (mu) value
  const mu = layer.material.vapourResistivity;
  return mu * thickness_m;
}

/**
 * Calculate vapour resistance of a layer using S_d method
 * per BS EN ISO 13788
 * 
 * Vapour resistance Z = S_d / δ₀
 * where δ₀ = 2 × 10⁻¹⁰ kg/(m·s·Pa) is the water vapour permeability of air
 */
export function calculateLayerVapourResistance(layer: ConstructionLayer): number {
  const Sd = calculateSd(layer);
  
  if (!layer.bridging) {
    return Sd / DELTA_0; // Return vapour resistance in s/kg (or equivalent)
  }
  
  // For bridged layers, calculate weighted Sd
  const thickness_m = layer.thickness / 1000;
  const muBridge = layer.bridging.material.vapourResistivity;
  const SdBridge = muBridge * thickness_m;
  
  const bridgingFraction = layer.bridging.percentage / 100;
  const baseFraction = 1 - bridgingFraction;
  
  // Parallel Sd calculation (harmonic mean for parallel paths)
  const effectiveSd = 1 / ((baseFraction / Sd) + (bridgingFraction / SdBridge));
  return effectiveSd / DELTA_0;
}

/**
 * Calculate layer thermal resistance without bridging
 */
export function calculateLayerThermalResistanceNoBridging(layer: ConstructionLayer): number {
  const thickness = layer.thickness / 1000;
  if (layer.material.thermalResistance !== undefined) {
    return layer.material.thermalResistance;
  }
  return thickness / layer.material.thermalConductivity;
}

/**
 * Calculate the Upper Limit of Thermal Resistance (R_upper)
 * per BS EN ISO 6946:2017 Section 6.7.2
 * 
 * Treats the construction as two parallel heat flow paths:
 * Path A: Through main materials (unbridged portion)
 * Path B: Through bridging materials (bridged portion)
 * 
 * 1/R_upper = (AreaFraction_A / R_total,A) + (AreaFraction_B / R_total,B)
 */
function calculateUpperLimitResistance(construction: Construction): number {
  // Find layers with bridging to determine area fractions
  const bridgedLayers = construction.layers.filter(l => l.bridging);
  
  if (bridgedLayers.length === 0) {
    // No bridging - just sum all layer resistances
    let totalR = construction.internalSurfaceResistance + construction.externalSurfaceResistance;
    for (const layer of construction.layers) {
      totalR += calculateLayerThermalResistanceNoBridging(layer);
    }
    return totalR;
  }
  
  // For simplicity, use the bridging percentage from the first bridged layer
  // (assumes consistent bridging fraction across all bridged layers)
  const bridgingFraction = bridgedLayers[0].bridging!.percentage / 100;
  const mainFraction = 1 - bridgingFraction;
  
  // Calculate R_total,A (path through main materials only)
  let R_A = construction.internalSurfaceResistance + construction.externalSurfaceResistance;
  for (const layer of construction.layers) {
    const thickness_m = layer.thickness / 1000;
    if (layer.material.thermalResistance !== undefined) {
      R_A += layer.material.thermalResistance;
    } else {
      R_A += thickness_m / layer.material.thermalConductivity;
    }
  }
  
  // Calculate R_total,B (path through bridging materials where they exist)
  let R_B = construction.internalSurfaceResistance + construction.externalSurfaceResistance;
  for (const layer of construction.layers) {
    const thickness_m = layer.thickness / 1000;
    if (layer.material.thermalResistance !== undefined) {
      R_B += layer.material.thermalResistance;
    } else if (layer.bridging) {
      // Use bridging material conductivity for bridged path
      R_B += thickness_m / layer.bridging.material.thermalConductivity;
    } else {
      // Non-bridged layers use main material
      R_B += thickness_m / layer.material.thermalConductivity;
    }
  }
  
  // Upper limit: 1/R_upper = (f_A / R_A) + (f_B / R_B)
  const R_upper = 1 / ((mainFraction / R_A) + (bridgingFraction / R_B));
  
  return R_upper;
}

/**
 * Calculate the Lower Limit of Thermal Resistance (R_lower)
 * per BS EN ISO 6946:2017 Section 6.7.2
 * 
 * For each bridged layer, calculate equivalent resistance:
 * 1/R_j = (f_bridge / R_bridge) + (f_main / R_main)
 * 
 * Then sum all layer resistances in series: R_lower = Σ R_j
 */
function calculateLowerLimitResistance(construction: Construction): number {
  let R_lower = construction.internalSurfaceResistance + construction.externalSurfaceResistance;
  
  for (const layer of construction.layers) {
    const thickness_m = layer.thickness / 1000;
    
    // For air gaps with fixed resistance
    if (layer.material.thermalResistance !== undefined) {
      R_lower += layer.material.thermalResistance;
      continue;
    }
    
    if (layer.bridging) {
      // Bridged layer: calculate parallel equivalent resistance
      const R_main = thickness_m / layer.material.thermalConductivity;
      const R_bridge = thickness_m / layer.bridging.material.thermalConductivity;
      const f_bridge = layer.bridging.percentage / 100;
      const f_main = 1 - f_bridge;
      
      // 1/R_j = (f_bridge / R_bridge) + (f_main / R_main)
      const R_j = 1 / ((f_bridge / R_bridge) + (f_main / R_main));
      R_lower += R_j;
    } else {
      // Homogeneous layer: simple R = d / λ
      R_lower += thickness_m / layer.material.thermalConductivity;
    }
  }
  
  return R_lower;
}

/**
 * Calculate total U-value of construction using BS EN ISO 6946 Combined Method
 * 
 * For constructions with thermal bridging:
 * 1. Calculate Upper Limit (R_upper): Parallel heat flow paths for entire construction
 * 2. Calculate Lower Limit (R_lower): Series of equivalent layer resistances
 * 3. Combined: R_T = (R_upper + R_lower) / 2
 * 4. U = 1 / R_T
 */
export function calculateUValue(construction: Construction): number {
  // Check if any layers have bridging
  const hasBridging = construction.layers.some(l => l.bridging);
  
  if (!hasBridging) {
    // No bridging: simple series resistance calculation
    let totalR = construction.internalSurfaceResistance + construction.externalSurfaceResistance;
    for (const layer of construction.layers) {
      totalR += calculateLayerThermalResistanceNoBridging(layer);
    }
    return 1 / totalR;
  }
  
  // Combined Method for bridged constructions
  const R_upper = calculateUpperLimitResistance(construction);
  const R_lower = calculateLowerLimitResistance(construction);
  
  // Final total resistance: arithmetic mean of upper and lower limits
  const R_T = (R_upper + R_lower) / 2;
  
  // U-value
  return 1 / R_T;
}

/**
 * Calculate U-value without bridging
 */
export function calculateUValueWithoutBridging(construction: Construction): number {
  let totalR = construction.internalSurfaceResistance + construction.externalSurfaceResistance;

  for (const layer of construction.layers) {
    totalR += calculateLayerThermalResistanceNoBridging(layer);
  }

  return 1 / totalR;
}

/**
 * Calculate floor thermal resistance Rf (excluding surface resistances)
 * Uses the Combined Method for bridged layers
 */
function calculateFloorRf(construction: Construction): number {
  // Get total R using the Combined Method (includes surface resistances)
  const totalR = 1 / calculateUValue(construction);
  // Subtract surface resistances to get floor construction R only
  const Rf = totalR - construction.internalSurfaceResistance - construction.externalSurfaceResistance;
  return Math.max(0, Rf);
}

/**
 * Calculate ground floor U-value using BS EN ISO 13370 methodology
 * Updated to use Combined Method R_f and correct formula per BR443
 * 
 * @param construction - The floor construction
 * @param perimeter - Exposed perimeter in meters
 * @param area - Floor area in m²
 * @param floorType - Type of ground floor (solid, suspended)
 * @param wallThickness - Wall thickness in meters (default 0.3m)
 * @param soilConductivity - Soil thermal conductivity W/(m·K) (default 2.0 for sand/gravel)
 * @returns Adjusted U-value accounting for ground heat transfer
 */
export function calculateGroundFloorUValue(
  construction: Construction,
  perimeter: number,
  area: number,
  floorType: 'ground' | 'suspended' | 'solid' | 'intermediate' = 'ground',
  wallThickness: number = 0.3,
  soilConductivity: number = 2.0
): number {
  // For intermediate floors, just use standard calculation
  if (floorType === 'intermediate') {
    return calculateUValue(construction);
  }

  // Ensure valid inputs
  const P = Math.max(perimeter, 0.001);
  const A = Math.max(area, 0.001);
  const w = Math.max(wallThickness, 0.001);
  const lambda_g = Math.max(soilConductivity, 0.1);
  
  // Characteristic dimension B' = 2 × A / P (per BS EN ISO 13370)
  const bPrime = (2 * A) / P;
  
  // Calculate floor thermal resistance Rf using Combined Method (excludes surface resistances)
  const Rf = calculateFloorRf(construction);
  
  // Equivalent thickness d_t = w + λ_g × Rf
  // Per BS EN ISO 13370, surface resistances are NOT included in d_t for ground floors
  // since the ground thermal resistance replaces Rse
  const dt = w + lambda_g * Rf;
  
  let Ug: number;
  
  if (floorType === 'suspended') {
    // Suspended floor calculation per BS EN ISO 13370
    // U = 1 / (Rsi + Rf + 1/Ug + 1/Ux)
    // Simplified: Use base U-value with ground resistance adjustment
    const baseU = calculateUValue(construction);
    
    // Ground resistance approximation for suspended floors
    // Account for underfloor space ventilation
    const Rg = bPrime / (2 * lambda_g);
    
    // Effective U-value considering ground and ventilation
    const ventilationFactor = 0.0015; // m²/m standard ventilation
    const h = 0.3; // Height of underfloor space
    const Ux = 2 * ventilationFactor * (1450 / (bPrime * h)); // Approximate ventilation heat loss
    
    Ug = 1 / (1/baseU + Rg);
    // Add ventilation loss
    if (Ux > 0) {
      Ug = Ug + Ux;
    }
  } else {
    // Solid/Ground floor - BS EN ISO 13370 formula
    if (dt < bPrime) {
      // Well-insulated floor: U_g = (2λ_g / πB' + d_t) × ln(πB'/d_t + 1)
      Ug = (2 * lambda_g) / (Math.PI * bPrime + dt) * Math.log((Math.PI * bPrime) / dt + 1);
    } else {
      // Poorly-insulated floor (dt >= B'): U_g = λ_g / (0.457 × B' + d_t)
      Ug = lambda_g / (0.457 * bPrime + dt);
    }
  }
  
  return Math.max(0.01, Ug); // Ensure positive U-value
}

/**
 * Calculate surface condensation data per month using Mould Risk Limit (80% RH)
 * per BS EN ISO 13788
 * 
 * The mould risk limit uses 80% RH instead of dew point (100% RH)
 * to provide adequate safety margin against mould growth
 */
export function calculateSurfaceCondensationData(
  construction: Construction,
  climateData: ClimateData[]
): SurfaceCondensationMonth[] {
  const uValue = calculateUValue(construction);
  const a = 17.27, b = 237.7;
  
  return climateData.map(month => {
    const deltaT = month.internalTemp - month.externalTemp;
    const tsi = month.internalTemp - (uValue * deltaT * construction.internalSurfaceResistance);
    
    // Calculate internal partial vapour pressure (P_v)
    const pInternal = calculateVapourPressure(month.internalTemp, month.internalRH);
    
    // Mould Risk Limit: 80% RH
    // Find P_sat where RH would be 80%: P_sat = P_v / 0.8
    const pSatRequired = pInternal / 0.8;
    
    // Find T_si,min using inverse Magnus formula
    // P_sat = 610.78 * exp((a * T) / (b + T))
    // Solving for T: T = (b * ln(P_sat/610.78)) / (a - ln(P_sat/610.78))
    const lnRatio = Math.log(pSatRequired / 610.78);
    const tSiMin = (b * lnRatio) / (a - lnRatio);
    
    // Calculate Temperature Factor using mould risk T_si,min
    // f_Rsi = (T_si,min - T_ext) / (T_int - T_ext)
    const fRsiMin = deltaT !== 0 ? (tSiMin - month.externalTemp) / deltaT : 0.5;
    
    return {
      month: month.month,
      externalTemp: month.externalTemp,
      externalRH: month.externalRH,
      internalTemp: month.internalTemp,
      internalRH: month.internalRH,
      minTempFactor: Math.round(fRsiMin * 1000) / 1000,
      minTsi: Math.round(tSiMin * 10) / 10,
      tsi: Math.round(tsi * 10) / 10,
    };
  });
}

/**
 * Calculate temperature at each interface
 */
export function calculateTemperatureGradient(
  construction: Construction,
  internalTemp: number,
  externalTemp: number
): { position: number; temperature: number }[] {
  const totalR = 1 / calculateUValue(construction);
  const deltaT = internalTemp - externalTemp;
  const heatFlux = deltaT / totalR;

  const gradient: { position: number; temperature: number }[] = [];
  let position = 0;
  let cumulativeR = 0;

  // Internal surface
  gradient.push({ position: 0, temperature: internalTemp - heatFlux * construction.internalSurfaceResistance });
  cumulativeR = construction.internalSurfaceResistance;

  // Through each layer
  for (const layer of construction.layers) {
    const layerR = calculateLayerThermalResistance(layer);
    position += layer.thickness;
    cumulativeR += layerR;
    const temp = internalTemp - heatFlux * cumulativeR;
    gradient.push({ position, temperature: temp });
  }

  return gradient;
}

/**
 * Calculate vapour pressure at each interface (Glaser method)
 */
export function calculateVapourPressureGradient(
  construction: Construction,
  internalTemp: number,
  internalRH: number,
  externalTemp: number,
  externalRH: number
): { position: number; pressure: number; saturation: number }[] {
  const pInternal = calculateVapourPressure(internalTemp, internalRH);
  const pExternal = calculateVapourPressure(externalTemp, externalRH);
  const deltaP = pInternal - pExternal;

  // Calculate total vapour resistance
  let totalGv = 0;
  for (const layer of construction.layers) {
    totalGv += calculateLayerVapourResistance(layer);
  }

  const vapourFlux = deltaP / totalGv;
  const tempGradient = calculateTemperatureGradient(construction, internalTemp, externalTemp);

  const gradient: { position: number; pressure: number; saturation: number }[] = [];
  let cumulativeGv = 0;
  let position = 0;

  // Internal surface (position 0)
  const internalSurfaceTemp = tempGradient[0]?.temperature ?? internalTemp;
  gradient.push({
    position: 0,
    pressure: pInternal,
    saturation: calculateSaturationPressure(internalSurfaceTemp),
  });

  // Through each layer
  for (let i = 0; i < construction.layers.length; i++) {
    const layer = construction.layers[i];
    cumulativeGv += calculateLayerVapourResistance(layer);
    position += layer.thickness;

    const pressure = pInternal - vapourFlux * cumulativeGv;
    const temp = tempGradient[i + 1]?.temperature ?? externalTemp;

    gradient.push({
      position,
      pressure,
      saturation: calculateSaturationPressure(temp),
    });
  }

  return gradient;
}

/**
 * Detect condensation points using Glaser method
 */
export function detectCondensation(
  gradient: { position: number; pressure: number; saturation: number }[]
): { position: number; amount: number }[] {
  const condensationPoints: { position: number; amount: number }[] = [];

  for (const point of gradient) {
    if (point.pressure > point.saturation) {
      // Condensation occurs when actual pressure exceeds saturation
      condensationPoints.push({
        position: point.position,
        amount: point.pressure - point.saturation,
      });
    }
  }

  return condensationPoints;
}

/**
 * Calculate monthly analysis over a year using Glaser method
 * per BS EN ISO 13788
 * 
 * This implementation correctly calculates condensation and evaporation
 * at interfaces where vapour pressure conditions allow moisture accumulation
 * or drying.
 * 
 * Key formula: g = δ₀ × ΔP / S_d (kg/m²s)
 * where δ₀ = 2 × 10⁻¹⁰ kg/(m·s·Pa) is water vapour permeability of air
 */
export function calculateMonthlyAnalysis(
  construction: Construction,
  climateData: ClimateData[]
): MonthlyAnalysis[] {
  const monthlyResults: MonthlyAnalysis[] = [];
  let cumulativeAccumulation = 0;
  
  // Track the primary condensation interface index
  let primaryCondensationInterface = -1;
  let accumulatedMoistureAtInterface = 0;

  // Calculate cumulative S_d at each interface
  const sdValues: number[] = [0]; // Start at internal surface
  let runningSD = 0;
  for (const layer of construction.layers) {
    runningSD += calculateSd(layer);
    sdValues.push(runningSD);
  }
  const totalSd = runningSD;

  for (const climate of climateData) {
    const pInternal = calculateVapourPressure(climate.internalTemp, climate.internalRH);
    const pExternal = calculateVapourPressure(climate.externalTemp, climate.externalRH);
    
    // Calculate temperature at each interface for saturation pressure
    const tempGradient = calculateTemperatureGradient(
      construction,
      climate.internalTemp,
      climate.externalTemp
    );

    // Find the condensation plane (interface where vapour pressure would exceed saturation)
    // This is where the modified vapour pressure line touches the saturation curve
    let condensationInterface = -1;
    let maxCondensationPotential = 0;
    
    for (let i = 1; i < sdValues.length; i++) {
      const sdToInterface = sdValues[i];
      const tempAtInterface = tempGradient[i]?.temperature ?? climate.externalTemp;
      const pSatAtInterface = calculateSaturationPressure(tempAtInterface);
      
      // Linear interpolation of vapour pressure at this interface
      const pAtInterface = pInternal - (pInternal - pExternal) * (sdToInterface / totalSd);
      
      // Check if vapour pressure exceeds saturation (condensation would occur)
      if (pAtInterface > pSatAtInterface) {
        const excess = pAtInterface - pSatAtInterface;
        if (excess > maxCondensationPotential) {
          maxCondensationPotential = excess;
          condensationInterface = i;
        }
      }
    }
    
    // If we found a new condensation interface, update tracking
    if (condensationInterface > 0) {
      primaryCondensationInterface = condensationInterface;
    }
    
    // Calculate condensation or evaporation
    let monthlyCondensation = 0;
    let monthlyEvaporation = 0;
    
    if (primaryCondensationInterface > 0) {
      const i = primaryCondensationInterface;
      const sdToInterface = sdValues[i];
      const sdFromInterface = totalSd - sdToInterface;
      const tempAtInterface = tempGradient[i]?.temperature ?? climate.externalTemp;
      const pSatAtInterface = calculateSaturationPressure(tempAtInterface);
      
      // Calculate vapour flow INTO the interface from inside (g_in)
      // g_in = δ₀ × (P_internal - P_sat) / S_d_to_interface
      // Only positive if internal pressure > saturation (vapour moving towards colder side)
      const gIn = sdToInterface > 0 
        ? (DELTA_0 * Math.max(0, pInternal - pSatAtInterface)) / sdToInterface
        : 0;
      
      // Calculate vapour flow OUT of the interface to outside (g_out)
      // g_out = δ₀ × (P_sat - P_external) / S_d_from_interface
      // Only positive if saturation > external (vapour can leave to outside)
      const gOut = sdFromInterface > 0 
        ? (DELTA_0 * Math.max(0, pSatAtInterface - pExternal)) / sdFromInterface
        : 0;
      
      // Net flow: positive = condensation, negative = evaporation potential
      const gNet = gIn - gOut;
      const monthlyFlowGrams = gNet * SECONDS_PER_MONTH * 1000; // Convert to g/m²
      
      if (monthlyFlowGrams > 0) {
        // Condensation occurring
        monthlyCondensation = monthlyFlowGrams;
        accumulatedMoistureAtInterface += monthlyCondensation;
      } else if (accumulatedMoistureAtInterface > 0 || cumulativeAccumulation > 0) {
        // Evaporation can occur when there's accumulated moisture
        // The moisture at the interface acts as a vapour source at saturation pressure
        // Vapour can flow both inward and outward
        
        // Flow to inside (evaporating towards room)
        const gEvapIn = sdToInterface > 0 
          ? (DELTA_0 * Math.max(0, pSatAtInterface - pInternal)) / sdToInterface
          : 0;
        
        // Flow to outside (evaporating to exterior)
        const gEvapOut = sdFromInterface > 0 
          ? (DELTA_0 * Math.max(0, pSatAtInterface - pExternal)) / sdFromInterface
          : 0;
        
        const totalEvapRate = gEvapIn + gEvapOut;
        monthlyEvaporation = totalEvapRate * SECONDS_PER_MONTH * 1000;
        
        // Cannot evaporate more than what's accumulated
        monthlyEvaporation = Math.min(monthlyEvaporation, cumulativeAccumulation + monthlyCondensation);
      }
    }
    
    // Calculate net change (can be positive or negative)
    const netAccumulation = monthlyCondensation - monthlyEvaporation;
    cumulativeAccumulation = Math.max(0, cumulativeAccumulation + netAccumulation);
    accumulatedMoistureAtInterface = Math.max(0, accumulatedMoistureAtInterface + netAccumulation);
    
    // Reset condensation interface if all moisture has evaporated
    if (cumulativeAccumulation <= 0.01) {
      primaryCondensationInterface = -1;
      accumulatedMoistureAtInterface = 0;
    }

    monthlyResults.push({
      month: climate.month,
      condensationAmount: Math.round(monthlyCondensation * 100) / 100,
      evaporationAmount: Math.round(monthlyEvaporation * 100) / 100,
      netAccumulation: Math.round(netAccumulation * 100) / 100,
      cumulativeAccumulation: Math.round(cumulativeAccumulation * 100) / 100,
    });
  }

  return monthlyResults;
}

/**
 * Full condensation risk analysis
 */
export function performCondensationAnalysis(
  construction: Construction,
  climateData: ClimateData[],
  groundFloorParams?: { 
    perimeter: number; 
    area: number; 
    floorType: 'ground' | 'suspended' | 'solid' | 'intermediate';
    wallThickness?: number;
    soilConductivity?: number;
  }
): AnalysisResult {
  // Calculate U-value - use ground floor method if params provided
  let uValue: number;
  if (groundFloorParams && construction.type === 'floor') {
    uValue = calculateGroundFloorUValue(
      construction,
      groundFloorParams.perimeter,
      groundFloorParams.area,
      groundFloorParams.floorType,
      groundFloorParams.wallThickness ?? 0.3,
      groundFloorParams.soilConductivity ?? 2.0
    );
  } else {
    uValue = calculateUValue(construction);
  }
  
  // Use January (worst case) for gradient display
  const winterClimate = climateData[0];
  const tempGradient = calculateTemperatureGradient(
    construction,
    winterClimate.internalTemp,
    winterClimate.externalTemp
  );

  const vapourGradient = calculateVapourPressureGradient(
    construction,
    winterClimate.internalTemp,
    winterClimate.internalRH,
    winterClimate.externalTemp,
    winterClimate.externalRH
  );

  const saturationGradient = vapourGradient.map(p => ({
    position: p.position,
    pressure: p.saturation,
  }));

  const monthlyData = calculateMonthlyAnalysis(construction, climateData);

  // Determine condensation results per layer
  const condensationResults: CondensationResult[] = [];
  let position = 0;

  for (let i = 0; i < construction.layers.length; i++) {
    const layer = construction.layers[i];
    position += layer.thickness;

    const point = vapourGradient.find(p => p.position === position);
    const hasCondensation = point ? point.pressure > point.saturation : false;
    const monthlyAccumulation = monthlyData.map(m => m.condensationAmount);
    const totalAccumulation = monthlyData[monthlyData.length - 1]?.cumulativeAccumulation ?? 0;

    condensationResults.push({
      layer: i,
      position,
      monthlyAccumulation,
      totalAccumulation,
      evaporationRate: monthlyData.reduce((sum, m) => sum + m.evaporationAmount, 0) / 12,
      risk: hasCondensation ? 'interstitial' : 'none',
      passes: totalAccumulation < 500, // Simplified pass/fail criteria
    });
  }

  // Overall result based on accumulated moisture
  // Per BS EN ISO 13788 Glaser method: moisture must fully evaporate by year-end
  const maxAccumulation = Math.max(...monthlyData.map(m => m.cumulativeAccumulation));
  const yearEndAccumulation = monthlyData[monthlyData.length - 1].cumulativeAccumulation;
  
  // Pass criteria: year-end accumulation must be effectively zero (<= 0.01 g/m²)
  // This ensures moisture does not accumulate year over year
  const yearEndPasses = yearEndAccumulation <= 0.01;
  const overallResult = yearEndPasses ? 'pass' : 'fail';

  const uValueWithoutBridging = calculateUValueWithoutBridging(construction);
  const surfaceCondensationData = calculateSurfaceCondensationData(construction, climateData);

  // Detailed failure reason explaining the year-end criteria
  let failureReason: string | undefined;
  if (overallResult === 'fail') {
    failureReason = `Condensation of ${yearEndAccumulation.toFixed(2)} g/m² remains at year-end. ` +
      `Moisture has not fully evaporated during the annual cycle, indicating moisture accumulation ` +
      `will increase year over year. This fails the Glaser method assessment criteria per BS EN ISO 13788. ` +
      `Peak accumulation during the year was ${maxAccumulation.toFixed(2)} g/m².`;
  }

  return {
    construction,
    uValue: Math.round(uValue * 1000) / 1000,
    uValueWithoutBridging: Math.round(uValueWithoutBridging * 1000) / 1000,
    temperatureGradient: tempGradient,
    vapourPressureGradient: vapourGradient.map(p => ({
      position: p.position,
      pressure: p.pressure,
      saturation: p.saturation,
    })),
    saturationPressureGradient: saturationGradient,
    condensationResults,
    monthlyData,
    overallResult,
    failureReason,
    surfaceCondensationData,
  };
}
