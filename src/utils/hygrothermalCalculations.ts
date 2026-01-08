import { Construction, ConstructionLayer, ClimateData, AnalysisResult, MonthlyAnalysis, CondensationResult } from '@/types/materials';

// Constants
const GAS_CONSTANT = 461.5; // J/(kg·K) for water vapour

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
 * Accounts for bridging using parallel path method
 */
export function calculateLayerThermalResistance(layer: ConstructionLayer): number {
  const thickness = layer.thickness / 1000; // Convert mm to m
  const baseR = thickness / layer.material.thermalConductivity;

  if (!layer.bridging) {
    return baseR;
  }

  // Parallel path method for bridging
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
 * Calculate total U-value of construction
 */
export function calculateUValue(construction: Construction): number {
  let totalR = construction.internalSurfaceResistance + construction.externalSurfaceResistance;

  for (const layer of construction.layers) {
    totalR += calculateLayerThermalResistance(layer);
  }

  return 1 / totalR;
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
  climateData: ClimateData[]
): AnalysisResult {
  const uValue = calculateUValue(construction);
  
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
  const maxAccumulation = Math.max(...monthlyData.map(m => m.cumulativeAccumulation));
  const endsNearZero = monthlyData[monthlyData.length - 1].cumulativeAccumulation < 50;
  const overallResult = maxAccumulation < 500 && endsNearZero ? 'pass' : 'fail';

  return {
    construction,
    uValue: Math.round(uValue * 1000) / 1000,
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
    failureReason: overallResult === 'fail' 
      ? `Maximum accumulation of ${maxAccumulation.toFixed(0)} g/m² exceeds limit. Annual evaporation insufficient.`
      : undefined,
  };
}
