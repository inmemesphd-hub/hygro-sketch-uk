import { Construction, ConstructionLayer, ClimateData, AnalysisResult, MonthlyAnalysis, CondensationResult, SurfaceCondensationMonth } from '@/types/materials';

// Constants
const GAS_CONSTANT = 461.5; // J/(kg·K) for water vapour
const SOIL_THERMAL_CONDUCTIVITY = 1.5; // W/(m·K) for clay soil (BS EN ISO 13370)

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
 * Calculate thermal resistance of a layer
 * Accounts for bridging using methods per BS EN ISO 6946:2017
 * 
 * For linear thermal bridges (timber studs, non-metallic):
 * - Uses parallel path method Section 6.2.3: 1/R_combined = (f_a / R_a) + (f_b / R_b)
 * 
 * For point thermal bridges (metallic fixings, λ > 1 W/m·K):
 * - Returns base R-value; correction applied at U-value level per Annex F.3
 * - Point fixings require chi-value approach, not parallel path
 */
export function calculateLayerThermalResistance(layer: ConstructionLayer): number {
  const thickness = layer.thickness / 1000; // Convert mm to m
  
  // If material has fixed thermal resistance (like air gaps), use it
  if (layer.material.thermalResistance !== undefined) {
    return layer.material.thermalResistance;
  }
  
  const baseR = thickness / layer.material.thermalConductivity;

  if (!layer.bridging) {
    return baseR;
  }

  // For metallic point fixings (λ > 1 W/m·K), return base R-value
  // The point bridge correction is applied separately in calculateUValue
  if (layer.bridging.material.thermalConductivity > 1) {
    return baseR;
  }

  // Parallel path method for non-metallic linear bridges (timber, SFS studs)
  const bridgingR = thickness / layer.bridging.material.thermalConductivity;
  const bridgingFraction = layer.bridging.percentage / 100;
  const baseFraction = 1 - bridgingFraction;

  // Combined R-value (parallel heat flow)
  const combinedU = (baseFraction / baseR) + (bridgingFraction / bridgingR);
  return 1 / combinedU;
}

/**
 * Calculate vapour resistance of a layer
 */
export function calculateLayerVapourResistance(layer: ConstructionLayer): number {
  const thickness = layer.thickness / 1000; // Convert mm to m
  const baseGv = layer.material.vapourResistivity * thickness * 1e9; // MN·s/g to s/g

  if (!layer.bridging) {
    return baseGv;
  }

  // Weighted average for vapour resistance
  const bridgingGv = layer.bridging.material.vapourResistivity * thickness * 1e9;
  const bridgingFraction = layer.bridging.percentage / 100;
  const baseFraction = 1 - bridgingFraction;

  return (baseFraction * baseGv) + (bridgingFraction * bridgingGv);
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
 * Calculate point thermal bridge correction per BS EN ISO 6946:2017 Annex F.3
 * For mechanical fasteners penetrating insulation:
 * 
 * ΔUf = α × λf × Af × nf / d0²
 * 
 * For percentage-based input, we use a simplified chi-value approach.
 * The 0.1 correction factor accounts for 3D heat spreading in the insulation
 * which significantly reduces the effective thermal transmittance of point fixings
 * compared to the parallel path assumption.
 */
function calculatePointBridgeCorrection(
  layer: ConstructionLayer
): number {
  if (!layer.bridging || layer.bridging.material.thermalConductivity <= 1) {
    return 0;
  }

  const thickness_m = layer.thickness / 1000;
  const bridgingFraction = layer.bridging.percentage / 100;
  const lambdaF = layer.bridging.material.thermalConductivity;
  
  // Chi-value approach with correction for 3D heat spreading
  // For point fixings, apply 0.1 reduction factor to account for
  // localized heat flow vs continuous bridge assumption
  const correctionFactor = 0.1;
  
  // ΔU = (λf × Af_nf × correctionFactor) / d
  const deltaU = (lambdaF * bridgingFraction * correctionFactor) / thickness_m;
  
  return deltaU;
}

/**
 * Calculate total U-value of construction
 * Includes point thermal bridge corrections for metallic fixings
 */
export function calculateUValue(construction: Construction): number {
  let totalR = construction.internalSurfaceResistance + construction.externalSurfaceResistance;

  for (const layer of construction.layers) {
    totalR += calculateLayerThermalResistance(layer);
  }

  // Base U-value from layer resistances
  let uValue = 1 / totalR;
  
  // Add point thermal bridge corrections for metallic fixings
  for (const layer of construction.layers) {
    uValue += calculatePointBridgeCorrection(layer);
  }

  return uValue;
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
 * Calculate ground floor U-value using BS EN ISO 13370 methodology
 * @param construction - The floor construction
 * @param perimeter - Exposed perimeter in meters
 * @param area - Floor area in m²
 * @param floorType - Type of ground floor (solid, suspended)
 * @returns Adjusted U-value accounting for ground heat transfer
 */
export function calculateGroundFloorUValue(
  construction: Construction,
  perimeter: number,
  area: number,
  floorType: 'ground' | 'suspended' | 'solid' | 'intermediate' = 'ground'
): number {
  // For intermediate floors, just use standard calculation
  if (floorType === 'intermediate') {
    return calculateUValue(construction);
  }

  // P/A ratio
  const pARatio = perimeter / area;
  
  // Characteristic dimension B' = A / (0.5 × P) = 2A/P
  const bPrime = (2 * area) / perimeter;
  
  // Calculate total thermal resistance of floor construction (excluding surface resistances for ground calc)
  let Rf = 0;
  for (const layer of construction.layers) {
    Rf += calculateLayerThermalResistance(layer);
  }
  
  // Equivalent thickness d_t = w + λ(Rsi + Rf + Rse)
  // where w is wall thickness (assumed 0.3m) and λ is soil conductivity
  const w = 0.3; // Assumed perimeter wall thickness
  const dt = w + SOIL_THERMAL_CONDUCTIVITY * (construction.internalSurfaceResistance + Rf + construction.externalSurfaceResistance);
  
  let Ug: number;
  
  if (floorType === 'suspended') {
    // Suspended floor calculation per BS EN ISO 13370
    // U = 1 / (Rsi + Rf + Rse + 1/Ug + 1/Ux)
    // Simplified: Use base U-value with ground resistance adjustment
    const baseU = calculateUValue(construction);
    
    // Ground resistance approximation for suspended floors
    // Account for underfloor space ventilation
    const Rg = bPrime / (2 * SOIL_THERMAL_CONDUCTIVITY);
    
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
      // Well-insulated floor
      Ug = (2 * SOIL_THERMAL_CONDUCTIVITY) / (Math.PI * bPrime + dt) * Math.log((Math.PI * bPrime) / dt + 1);
    } else {
      // Poorly-insulated floor (dt >= B')
      Ug = SOIL_THERMAL_CONDUCTIVITY / (0.457 * bPrime + dt);
    }
  }
  
  return Math.max(0.01, Ug); // Ensure positive U-value
}

/**
 * Calculate surface condensation data per month
 */
export function calculateSurfaceCondensationData(
  construction: Construction,
  climateData: ClimateData[]
): SurfaceCondensationMonth[] {
  const uValue = calculateUValue(construction);
  return climateData.map(month => {
    const deltaT = month.internalTemp - month.externalTemp;
    const tsi = month.internalTemp - (uValue * deltaT * construction.internalSurfaceResistance);
    const a = 17.27, b = 237.7;
    const gamma = (a * month.internalTemp) / (b + month.internalTemp) + Math.log(month.internalRH / 100);
    const dewPoint = (b * gamma) / (a - gamma);
    const fRsiMin = deltaT !== 0 ? (dewPoint - month.externalTemp) / deltaT : 0.5;
    const minTsi = month.externalTemp + fRsiMin * deltaT;
    return {
      month: month.month,
      externalTemp: month.externalTemp,
      externalRH: month.externalRH,
      internalTemp: month.internalTemp,
      internalRH: month.internalRH,
      minTempFactor: Math.round(fRsiMin * 1000) / 1000,
      minTsi: Math.round(minTsi * 10) / 10,
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
 * Calculate monthly analysis over a year
 */
export function calculateMonthlyAnalysis(
  construction: Construction,
  climateData: ClimateData[]
): MonthlyAnalysis[] {
  const monthlyResults: MonthlyAnalysis[] = [];
  let cumulativeAccumulation = 0;

  for (const climate of climateData) {
    const gradient = calculateVapourPressureGradient(
      construction,
      climate.internalTemp,
      climate.internalRH,
      climate.externalTemp,
      climate.externalRH
    );

    const condensationPoints = detectCondensation(gradient);
    
    // Calculate condensation amount (simplified)
    const condensationAmount = condensationPoints.reduce(
      (sum, point) => sum + point.amount * 0.1, // Simplified factor
      0
    );

    // Evaporation potential (simplified - based on temperature difference)
    const evaporationPotential = Math.max(0, (climate.externalTemp - 5) * 2);
    const evaporationAmount = Math.min(cumulativeAccumulation, evaporationPotential);

    const netAccumulation = condensationAmount - evaporationAmount;
    cumulativeAccumulation = Math.max(0, cumulativeAccumulation + netAccumulation);

    monthlyResults.push({
      month: climate.month,
      condensationAmount: Math.round(condensationAmount * 100) / 100,
      evaporationAmount: Math.round(evaporationAmount * 100) / 100,
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
  groundFloorParams?: { perimeter: number; area: number; floorType: 'ground' | 'suspended' | 'solid' | 'intermediate' }
): AnalysisResult {
  // Calculate U-value - use ground floor method if params provided
  let uValue: number;
  if (groundFloorParams && construction.type === 'floor') {
    uValue = calculateGroundFloorUValue(
      construction,
      groundFloorParams.perimeter,
      groundFloorParams.area,
      groundFloorParams.floorType
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
