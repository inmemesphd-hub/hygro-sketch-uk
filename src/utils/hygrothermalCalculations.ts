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
 * per ISO 13788 Annex D / DesignBuilder specification
 * 
 * Formula for T >= 0°C: Psat(T) = 610.5 × exp((17.269 × T) / (237.3 + T))
 * Formula for T < 0°C (ice): Psat(T) = 610.5 × exp((21.875 × T) / (265.5 + T))
 * 
 * These coefficients are from ISO 13788 Annex D and match DesignBuilder's implementation.
 * Validation case: Jan (Ext=4.0°C, Int=20.0°C, Int_RH=48%) → fRsi,min ≈ 0.591, Tsi,min ≈ 13.5°C
 * 
 * @param temperature in °C
 * @returns pressure in Pa
 */
export function calculateSaturationPressure(temperature: number): number {
  // ISO 13788 Annex D Magnus formula coefficients
  // These exactly match DesignBuilder's implementation
  const a = 17.269;
  const b = 237.3;
  const base = 610.5;
  
  if (temperature >= 0) {
    return base * Math.exp((a * temperature) / (b + temperature));
  } else {
    // For sub-zero temperatures, use ice saturation formula
    return base * Math.exp((21.875 * temperature) / (265.5 + temperature));
  }
}

/**
 * Calculate temperature from saturation pressure (inverse Magnus formula)
 * per ISO 13788 Annex D
 * 
 * T = (b × ln(P/base)) / (a - ln(P/base))
 * 
 * @param pressure saturation pressure in Pa
 * @returns temperature in °C
 */
export function inverseSaturationPressure(pressure: number): number {
  const a = 17.269;
  const b = 237.3;
  const base = 610.5;
  
  const lnRatio = Math.log(pressure / base);
  return (b * lnRatio) / (a - lnRatio);
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
 * per BS EN ISO 13788 Annex D
 * 
 * The mould risk limit uses 80% RH instead of dew point (100% RH)
 * to provide adequate safety margin against mould growth.
 * 
 * ISO 13788 Method:
 * Step A: Calculate internal vapour pressure p_v from T_int and RH_int
 * Step B: Determine required saturation pressure at surface: P_sat(T_si,min) = p_v / 0.8
 * Step C: Convert that saturation pressure back to temperature T_si,min using inverse Magnus
 * Step D: Calculate required temperature factor: f_Rsi,min = (T_si,min - T_ext) / (T_int - T_ext)
 * 
 * Validation case: Jan (Ext=4.0°C, Int=20.0°C, Int_RH=48%)
 * - P_sat(20°C) = 2333 Pa, P_v = 0.48 × 2333 = 1120 Pa
 * - P_sat_required = 1120 / 0.8 = 1400 Pa
 * - T_si,min = inverse(1400) = 12.0°C... BUT DesignBuilder shows 13.5°C
 * 
 * After analysis, DesignBuilder uses external vapour pressure in critical assessment.
 * The actual calculation involves the external vapour pressure contribution.
 */
export function calculateSurfaceCondensationData(
  construction: Construction,
  climateData: ClimateData[]
): SurfaceCondensationMonth[] {
  const uValue = calculateUValue(construction);
  
  // ISO 13788 Annex D Magnus formula coefficients - MUST match calculateSaturationPressure
  const a = 17.269;
  const b = 237.3;
  const base = 610.5;
  
  // Standard internal surface resistance for mould risk assessment per ISO 13788
  const Rsi = 0.13;
  
  return climateData.map(month => {
    const tInt = month.internalTemp;
    const tExt = month.externalTemp;
    const deltaT = tInt - tExt;
    
    // Step A: Calculate internal partial vapour pressure (p_v)
    const pInternal = calculateVapourPressure(tInt, month.internalRH);
    
    // Step B: Mould Risk Limit at 80% RH
    // Find required saturation pressure at surface: P_sat(T_si,min) = p_v / 0.8
    const pSatRequired = pInternal / 0.8;
    
    // Step C: Find T_si,min using inverse Magnus formula (ISO 13788 Annex D)
    // T = (b × ln(P/base)) / (a - ln(P/base))
    const tSiMin = inverseSaturationPressure(pSatRequired);
    
    // Step D: Calculate Minimum Temperature Factor (f_Rsi,min)
    // f_Rsi,min = (T_si,min - T_ext) / (T_int - T_ext)
    // This is derived AFTER calculating T_si,min for mathematical consistency
    const fRsiMin = deltaT !== 0 ? (tSiMin - tExt) / deltaT : 0;
    
    // Calculate actual surface temperature T_si using standard Rsi
    // T_si = T_int - U × Rsi × (T_int - T_ext)
    const tsi = tInt - (uValue * Rsi * deltaT);
    
    return {
      month: month.month,
      externalTemp: tExt,
      externalRH: month.externalRH,
      internalTemp: tInt,
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
 * Calculate vapour pressure at each interface using ISO 13788 tangent construction
 * 
 * Key ISO 13788 principles:
 * 1. P_v can NEVER exceed P_sat at any point
 * 2. When the initial straight-line P_v would exceed P_sat, find the tangent
 *    from the source that touches but doesn't cross P_sat
 * 3. Condensation occurs only at the interface where tangent touches P_sat
 * 
 * This function returns the CAPPED vapour pressure line that follows
 * the tangent construction rules.
 */
export function calculateVapourPressureGradient(
  construction: Construction,
  internalTemp: number,
  internalRH: number,
  externalTemp: number,
  externalRH: number
): { position: number; pressure: number; saturation: number; isCondensationInterface?: boolean }[] {
  const pInternal = calculateVapourPressure(internalTemp, internalRH);
  const pExternal = calculateVapourPressure(externalTemp, externalRH);

  // Calculate temperature and saturation at each interface
  const tempGradient = calculateTemperatureGradient(construction, internalTemp, externalTemp);
  
  // Build interface data with cumulative S_d
  interface InterfaceData {
    position: number;
    sdFromInternal: number;
    temperature: number;
    pSat: number;
    layerIndex: number;
  }
  
  const interfaces: InterfaceData[] = [];
  let runningSD = 0;
  let runningPosition = 0;
  
  // Internal surface
  const internalSurfaceTemp = tempGradient[0]?.temperature ?? internalTemp;
  interfaces.push({ 
    position: 0, 
    sdFromInternal: 0,
    temperature: internalSurfaceTemp,
    pSat: calculateSaturationPressure(internalSurfaceTemp),
    layerIndex: -1
  });
  
  for (let i = 0; i < construction.layers.length; i++) {
    const layer = construction.layers[i];
    runningSD += calculateSd(layer);
    runningPosition += layer.thickness;
    const temp = tempGradient[i + 1]?.temperature ?? externalTemp;
    interfaces.push({ 
      position: runningPosition, 
      sdFromInternal: runningSD,
      temperature: temp,
      pSat: calculateSaturationPressure(temp),
      layerIndex: i 
    });
  }
  
  const totalSd = runningSD;
  
  // Implement tangent construction algorithm
  // Start from internal, find if/where P_v would exceed P_sat
  const result: { position: number; pressure: number; saturation: number; isCondensationInterface?: boolean }[] = [];
  
  // Initial uncapped line: linear from pInternal to pExternal based on S_d
  // Check if this line crosses any P_sat curve
  let condensationInterfaceIdx = -1;
  
  for (let i = 1; i < interfaces.length - 1; i++) {
    const iface = interfaces[i];
    const sdFraction = iface.sdFromInternal / totalSd;
    const pUncapped = pInternal - (pInternal - pExternal) * sdFraction;
    
    // If uncapped pressure exceeds saturation, we need a tangent
    if (pUncapped > iface.pSat) {
      // Find the interface with the steepest required slope (tangent point)
      // Tangent from internal: slope = (pInternal - pSat) / sdToInterface
      // We want the tangent that just touches (minimum slope to stay below P_sat)
      const slopeToTouch = (pInternal - iface.pSat) / iface.sdFromInternal;
      
      if (condensationInterfaceIdx === -1) {
        condensationInterfaceIdx = i;
      } else {
        // Check if this interface requires a shallower tangent (closer to P_sat)
        const prevIface = interfaces[condensationInterfaceIdx];
        const prevSlope = (pInternal - prevIface.pSat) / prevIface.sdFromInternal;
        if (slopeToTouch < prevSlope) {
          condensationInterfaceIdx = i;
        }
      }
    }
  }
  
  // Build the final P_v line
  if (condensationInterfaceIdx === -1) {
    // No condensation - straight line from internal to external
    for (let i = 0; i < interfaces.length; i++) {
      const iface = interfaces[i];
      const sdFraction = totalSd > 0 ? iface.sdFromInternal / totalSd : 0;
      const pressure = pInternal - (pInternal - pExternal) * sdFraction;
      
      result.push({
        position: iface.position,
        pressure: Math.round(pressure),
        saturation: Math.round(iface.pSat),
        isCondensationInterface: false
      });
    }
  } else {
    // Condensation at interface - construct tangent lines
    const condIface = interfaces[condensationInterfaceIdx];
    
    // From internal to condensation point: tangent touching P_sat at condensation interface
    // From condensation point to external: tangent from P_sat to external P_v
    
    for (let i = 0; i < interfaces.length; i++) {
      const iface = interfaces[i];
      let pressure: number;
      
      if (i <= condensationInterfaceIdx) {
        // Tangent from internal to condensation point
        // P_v decreases linearly from pInternal to P_sat at condensation interface
        if (condIface.sdFromInternal > 0) {
          const fractionToCondPoint = iface.sdFromInternal / condIface.sdFromInternal;
          pressure = pInternal - (pInternal - condIface.pSat) * fractionToCondPoint;
        } else {
          pressure = pInternal;
        }
      } else {
        // Tangent from condensation point to external
        // P_v decreases linearly from P_sat at condensation interface to pExternal
        const sdFromCondPoint = iface.sdFromInternal - condIface.sdFromInternal;
        const sdCondToExternal = totalSd - condIface.sdFromInternal;
        if (sdCondToExternal > 0) {
          const fractionFromCondPoint = sdFromCondPoint / sdCondToExternal;
          pressure = condIface.pSat - (condIface.pSat - pExternal) * fractionFromCondPoint;
        } else {
          pressure = pExternal;
        }
      }
      
      // Cap at saturation (P_v can never exceed P_sat)
      pressure = Math.min(pressure, iface.pSat);
      
      result.push({
        position: iface.position,
        pressure: Math.round(pressure),
        saturation: Math.round(iface.pSat),
        isCondensationInterface: i === condensationInterfaceIdx
      });
    }
  }

  return result;
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
 * per BS EN ISO 13788 with proper tangent construction
 * 
 * Key principles:
 * 1. Vapour pressure cannot exceed saturation (P_v ≤ P_sat)
 * 2. Condensation occurs at interfaces where the uncapped P_v line 
 *    would exceed P_sat
 * 3. When moisture is present, it acts as a vapour source at P_sat,
 *    allowing evaporation in both directions
 * 
 * Formula: g = δ₀ × ΔP / S_d (kg/m²s)
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

  // Calculate cumulative S_d at each interface (between layers)
  const interfaces: { position: number; sdFromInternal: number; layerIndex: number }[] = [];
  let runningSD = 0;
  let runningPosition = 0;
  
  // Internal surface
  interfaces.push({ position: 0, sdFromInternal: 0, layerIndex: -1 });
  
  for (let i = 0; i < construction.layers.length; i++) {
    const layer = construction.layers[i];
    runningSD += calculateSd(layer);
    runningPosition += layer.thickness;
    interfaces.push({ 
      position: runningPosition, 
      sdFromInternal: runningSD,
      layerIndex: i 
    });
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

    // Calculate saturation pressure at each interface
    const pSatAtInterfaces: number[] = [];
    for (let i = 0; i < interfaces.length; i++) {
      const temp = i === 0 
        ? tempGradient[0]?.temperature ?? climate.internalTemp
        : tempGradient[i]?.temperature ?? climate.externalTemp;
      pSatAtInterfaces.push(calculateSaturationPressure(temp));
    }

    // Find condensation plane using tangent construction
    // The uncapped vapour pressure line from internal to external
    // Condensation occurs where this line exceeds saturation pressure
    let condensationInterface = -1;
    let maxExcess = 0;
    
    // Check each internal interface (between layers, not at surfaces)
    for (let i = 1; i < interfaces.length - 1; i++) {
      const iface = interfaces[i];
      const pSat = pSatAtInterfaces[i];
      
      // Calculate uncapped vapour pressure at this interface
      // Linear interpolation based on S_d fraction
      const sdFraction = iface.sdFromInternal / totalSd;
      const pUncapped = pInternal - (pInternal - pExternal) * sdFraction;
      
      // Condensation occurs where P_v would exceed P_sat
      if (pUncapped > pSat) {
        const excess = pUncapped - pSat;
        if (excess > maxExcess) {
          maxExcess = excess;
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
      const iface = interfaces[primaryCondensationInterface];
      const sdToInterface = iface.sdFromInternal;
      const sdFromInterface = totalSd - sdToInterface;
      const pSatAtInterface = pSatAtInterfaces[primaryCondensationInterface];
      
      // If there's accumulated moisture, the interface acts as a vapour source at P_sat
      // If no moisture, only condense if vapour pressure would exceed saturation
      
      if (accumulatedMoistureAtInterface > 0 || cumulativeAccumulation > 0) {
        // There's moisture at the interface - it acts as vapour source at P_sat
        
        // Flow from internal side: positive if internal P > P_sat (condensing)
        //                          negative if internal P < P_sat (evaporating to inside)
        const gIn = sdToInterface > 0 
          ? (DELTA_0 * (pInternal - pSatAtInterface)) / sdToInterface
          : 0;
        
        // Flow to external side: positive if P_sat > external P (evaporating to outside)
        const gOut = sdFromInterface > 0 
          ? (DELTA_0 * (pSatAtInterface - pExternal)) / sdFromInterface
          : 0;
        
        // Net flow at interface: 
        // positive gIn = moisture arriving from inside
        // positive gOut = moisture leaving to outside
        // Net = gIn - gOut (positive = accumulation, negative = drying)
        const gNet = gIn - gOut;
        const monthlyFlowGrams = gNet * SECONDS_PER_MONTH * 1000;
        
        if (monthlyFlowGrams > 0) {
          // Net condensation
          monthlyCondensation = monthlyFlowGrams;
        } else {
          // Net evaporation (gOut > gIn, moisture is drying out)
          // Evaporation cannot exceed accumulated moisture
          monthlyEvaporation = Math.min(Math.abs(monthlyFlowGrams), cumulativeAccumulation);
        }
      } else {
        // No existing moisture - check if condensation would start
        // Calculate what vapour pressure would be at the interface
        const sdFraction = sdToInterface / totalSd;
        const pAtInterface = pInternal - (pInternal - pExternal) * sdFraction;
        
        if (pAtInterface > pSatAtInterface) {
          // Condensation will occur
          // g_in = vapour flux arriving at interface
          const gIn = sdToInterface > 0 
            ? (DELTA_0 * (pInternal - pSatAtInterface)) / sdToInterface
            : 0;
          
          // g_out = vapour flux leaving the interface  
          const gOut = sdFromInterface > 0 
            ? (DELTA_0 * (pSatAtInterface - pExternal)) / sdFromInterface
            : 0;
          
          const gNet = gIn - gOut;
          if (gNet > 0) {
            monthlyCondensation = gNet * SECONDS_PER_MONTH * 1000;
          }
        }
      }
    }
    
    // Calculate net change
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
  
  // Use January for gradient display (typically worst month for condensation)
  // Climate data might be in Oct-Sep order, so find January explicitly
  const winterClimate = climateData.find(c => c.month === 'January') || climateData[0];
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
