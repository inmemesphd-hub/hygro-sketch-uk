import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { AnalysisResult, ClimateData, ConstructionLayer } from '@/types/materials';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Area, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateSd, calculateVapourPressureGradient, calculateTemperatureGradient } from '@/utils/hygrothermalCalculations';

interface GlastaDiagramProps {
  result: AnalysisResult;
  climateData?: ClimateData[];
  className?: string;
  showMonthSelector?: boolean;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  xAxisMode?: 'thickness' | 'sd';
  onXAxisModeChange?: (mode: 'thickness' | 'sd') => void;
}

// October to September order for UK heating season
const months = [
  'October', 'November', 'December', 'January', 'February', 'March',
  'April', 'May', 'June', 'July', 'August', 'September'
];

const CHART_HEIGHT = 350;

export function GlastaDiagram({ 
  result, 
  climateData,
  className, 
  showMonthSelector = true,
  selectedMonth,
  onMonthChange,
  xAxisMode: externalXAxisMode,
  onXAxisModeChange
}: GlastaDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [internalSelectedMonth, setInternalSelectedMonth] = useState<string>('worst');
  const [internalXAxisMode, setInternalXAxisMode] = useState<'thickness' | 'sd'>('thickness');
  
  const currentMonth = selectedMonth ?? internalSelectedMonth;
  const handleMonthChange = onMonthChange ?? setInternalSelectedMonth;
  const xAxisMode = externalXAxisMode ?? internalXAxisMode;
  const handleXAxisModeChange = onXAxisModeChange ?? setInternalXAxisMode;

  // Robust dimension measurement with requestAnimationFrame
  useEffect(() => {
    let rafId: number;
    let resizeObserver: ResizeObserver | null = null;
    
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      if (rect.width > 50) {
        setChartWidth(Math.floor(rect.width));
        setIsReady(true);
      }
    };

    // Initial measurement after paint
    rafId = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });

    // ResizeObserver for subsequent changes
    const container = containerRef.current;
    if (container) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (width > 50) {
            setChartWidth(Math.floor(width));
          }
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
    };
  }, []);

  // Find the worst month based on HIGHEST MONTHLY CONDENSATION (per ISO 13788)
  // This should be the month where the most condensation occurs (g/m²)
  const worstMonth = useMemo(() => {
    let worstMonthName = 'January';
    let maxCondensation = 0;
    
    // Find the month with highest condensation by matching month names
    result.monthlyData.forEach((data) => {
      // Only consider months with actual condensation (not evaporation)
      if (data.condensationAmount > maxCondensation) {
        maxCondensation = data.condensationAmount;
        worstMonthName = data.month;
      }
    });
    
    // If no condensation in any month, default to January (coldest typical UK month)
    if (maxCondensation === 0) {
      return 'January';
    }
    
    return worstMonthName;
  }, [result.monthlyData]);

  const displayMonth = currentMonth === 'worst' ? worstMonth : currentMonth;

  // Calculate layer boundary positions (for condensation markers)
  const layerBoundaryPositions = useMemo(() => {
    const boundaries: number[] = [0]; // Internal surface at position 0
    let pos = 0;
    for (const layer of result.construction.layers) {
      pos += layer.thickness;
      boundaries.push(pos); // Each layer boundary
    }
    return boundaries;
  }, [result.construction.layers]);

  // CRITICAL: Recalculate vapour pressure gradient for the SELECTED month
  // This ensures the Glaser diagram updates based on the month's climate data
  const monthSpecificGradient = useMemo(() => {
    // Find the climate data for this month by matching the month NAME, not index
    // because climateData might be in Oct-Sep order (reordered) or Jan-Dec order
    const monthClimate = climateData?.find(c => c.month === displayMonth);
    
    if (!monthClimate) {
      // Fallback to result's pre-calculated gradient if no climate data
      console.warn(`[Glaser] No climate data found for ${displayMonth}, using pre-calculated gradient`);
      return result.vapourPressureGradient;
    }
    
    console.log(`[Glaser ${displayMonth}] Climate: Int=${monthClimate.internalTemp}°C/${monthClimate.internalRH}%, Ext=${monthClimate.externalTemp}°C/${monthClimate.externalRH}%`);
    
    // Recalculate the vapour pressure gradient for this specific month
    return calculateVapourPressureGradient(
      result.construction,
      monthClimate.internalTemp,
      monthClimate.internalRH,
      monthClimate.externalTemp,
      monthClimate.externalRH
    );
  }, [result.construction, displayMonth, climateData, result.vapourPressureGradient]);

  // Check if condensation occurs this month (any uncapped Pv > Psat)
  const hasCondensationThisMonth = useMemo(() => {
    return monthSpecificGradient.some(point => (point as any).isCondensationInterface === true);
  }, [monthSpecificGradient]);

  // Build chart data with temperature line and S_d values
  // ISO 13788: Show UNCAPPED Pv line to visually display where it crosses Psat
  // The condensation point is where uncapped line exceeds saturation
  // ISO 13788 Glaser Diagram: The chart MUST show the theoretical linear Pv gradient
  // crossing ABOVE Psat when condensation occurs. This is the visual proof of condensation risk.
  const chartData = useMemo(() => {
    const data: any[] = [];
    
    // Find the climate data for this month by matching the month NAME
    const monthClimate = climateData?.find(c => c.month === displayMonth) || {
      internalTemp: 20,
      externalTemp: 5,
      internalRH: 60,
      externalRH: 85
    };

    // Recalculate temperature gradient for the selected month
    const tempGradient = calculateTemperatureGradient(
      result.construction,
      monthClimate.internalTemp,
      monthClimate.externalTemp
    );

    let cumulativeSd = 0;
    
    // DEBUG: Log the pressure values to verify intersection
    console.log(`[Glaser ${displayMonth}] Checking pressure intersections:`);
    
    for (let i = 0; i < monthSpecificGradient.length; i++) {
      const point = monthSpecificGradient[i];
      
      // Calculate S_d for x-axis (cumulative through layers)
      if (i > 0 && i - 1 < result.construction.layers.length) {
        const layer = result.construction.layers[i - 1];
        cumulativeSd += calculateSd(layer);
      }
      
      // Get temperature at this position from recalculated gradient
      const temperature = tempGradient[i]?.temperature ?? 0;

      // Check if this is a condensation interface
      const isCondensationInterface = (point as any).isCondensationInterface || false;
      
      // Ensure condensation is only marked at exact layer boundaries
      const isAtBoundary = layerBoundaryPositions.some(bp => Math.abs(bp - point.position) < 0.1);
      
      // CRITICAL: Use the TRUE uncapped linear gradient pressure
      // This is the theoretical Pv line that must cross Psat when condensation occurs
      const uncappedPressure = (point as any).uncappedPressure ?? point.pressure;
      const saturationPressure = point.saturation;
      
      // Log where condensation should occur
      if (uncappedPressure > saturationPressure) {
        console.log(`  [Interface ${i}] Pv=${uncappedPressure}Pa > Psat=${saturationPressure}Pa at ${point.position}mm - CONDENSATION`);
      }
      
      data.push({
        position: point.position,
        sd: Math.round(cumulativeSd * 100) / 100, // S_d in metres
        // CRITICAL: Plot the UNCAPPED theoretical linear gradient
        // This MUST exceed Psat at condensation interfaces
        vapourPressure: Math.round(uncappedPressure),
        saturationPressure: Math.round(saturationPressure),
        temperature: Math.round(temperature * 10) / 10,
        // Mark condensation interface ONLY at layer boundaries where P_v exceeds P_sat
        isCondensationInterface: isCondensationInterface && isAtBoundary,
        // Flag for condensation zone styling
        hasCondensation: uncappedPressure > saturationPressure,
      });
    }
    
    // Verify that if condensation is marked, Pv > Psat at that point
    const condensationPoints = data.filter(d => d.isCondensationInterface);
    if (condensationPoints.length > 0) {
      console.log(`[Glaser ${displayMonth}] Condensation interfaces:`, condensationPoints.map(p => 
        `pos=${p.position}mm, Pv=${p.vapourPressure}Pa, Psat=${p.saturationPressure}Pa, exceeds=${p.vapourPressure > p.saturationPressure}`
      ));
    }

    return data;
  }, [monthSpecificGradient, displayMonth, climateData, result.construction, layerBoundaryPositions]);

  // Find condensation interfaces (where P_v touches P_sat per tangent construction)
  // ISO 13788: Condensation only occurs at specific material interfaces (layer boundaries)
  const condensationInterfaces = useMemo(() => {
    const interfaces: { position: number; layerIndex: number }[] = [];

    for (let i = 0; i < monthSpecificGradient.length; i++) {
      const point = monthSpecificGradient[i];
      // Check if this is marked as a condensation interface AND is at a layer boundary
      const isAtBoundary = layerBoundaryPositions.some(bp => Math.abs(bp - point.position) < 0.1);
      if ((point as any).isCondensationInterface && isAtBoundary) {
        interfaces.push({ 
          position: point.position,
          layerIndex: i 
        });
      }
    }

    return interfaces;
  }, [monthSpecificGradient, layerBoundaryPositions]);

  // Layer boundaries for reference lines
  const layerBoundaries = useMemo(() => {
    const boundaries: { position: number; name: string }[] = [];
    let pos = 0;
    
    result.construction.layers.forEach((layer, idx) => {
      if (idx > 0) {
        boundaries.push({ position: pos, name: layer.material.name });
      }
      pos += layer.thickness;
    });
    
    return boundaries;
  }, [result.construction.layers]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs text-muted-foreground mb-2">Position: {label}mm</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-mono">
              {entry.value} {entry.dataKey === 'temperature' ? '°C' : 'Pa'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <span className="panel-title">Glaser Diagram - {displayMonth}</span>
        <div className="flex items-center gap-2">
          {condensationInterfaces.length > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive">
              {condensationInterfaces.length} condensation interface{condensationInterfaces.length > 1 ? 's' : ''}
            </span>
          )}
          {/* X-axis mode toggle */}
          <Select value={xAxisMode} onValueChange={(v) => handleXAxisModeChange(v as 'thickness' | 'sd')}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thickness">mm</SelectItem>
              <SelectItem value="sd">Sd (m)</SelectItem>
            </SelectContent>
          </Select>
          {showMonthSelector && (
            <Select value={currentMonth} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worst">Worst Month</SelectItem>
                {months.map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      
      <div className="p-4">
        <div 
          ref={containerRef} 
          style={{ 
            width: '100%', 
            height: CHART_HEIGHT,
            minWidth: 300,
            display: 'block',
            position: 'relative'
          }}
        >
          {isReady && chartWidth > 50 ? (
            <ComposedChart 
              data={chartData} 
              width={chartWidth} 
              height={CHART_HEIGHT}
              margin={{ top: 20, right: 60, left: 20, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              
              {/* Layer boundary reference lines */}
              {layerBoundaries.map((boundary, idx) => (
                <ReferenceLine 
                  key={idx}
                  x={boundary.position}
                  yAxisId="pressure"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  strokeWidth={1}
                />
              ))}

              <XAxis 
                dataKey={xAxisMode === 'sd' ? 'sd' : 'position'} 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ 
                  value: xAxisMode === 'sd' ? 'Equivalent Air Layer Thickness Sd (m)' : 'Position (mm)', 
                  position: 'bottom', 
                  offset: 10, 
                  fill: 'hsl(var(--muted-foreground))', 
                  fontSize: 11 
                }}
              />
              
              {/* Left Y-axis for Pressure */}
              <YAxis 
                yAxisId="pressure"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: 'Pressure (Pa)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              
              {/* Right Y-axis for Temperature */}
              <YAxis 
                yAxisId="temperature"
                orientation="right"
                stroke="#22c55e"
                tick={{ fontSize: 11, fill: '#22c55e' }}
                label={{ value: 'Temperature (°C)', angle: 90, position: 'insideRight', fill: '#22c55e', fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              
              {/* Temperature line (green) - linear for gradient visualization */}
              <Line
                yAxisId="temperature"
                type="linear"
                dataKey="temperature"
                name="Temperature (°C)"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3 }}
              />
              
              {/* Saturation pressure line (blue) - linear for smooth curve */}
              <Line
                yAxisId="pressure"
                type="linear"
                dataKey="saturationPressure"
                name="Saturated VP (Pa)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
              />
              
              {/* Actual vapour pressure line (red) - linear to show intersection with Psat */}
              <Line
                yAxisId="pressure"
                type="linear"
                dataKey="vapourPressure"
                name="Partial VP (Pa)"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
              />

              {/* ISO 13788: Condensation interface markers at specific layer boundaries */}
              {/* P_v never exceeds P_sat with tangent construction - mark where they touch */}
              {chartData.map((point, idx) => 
                point.isCondensationInterface ? (
                  <ReferenceLine
                    key={`cond-marker-${idx}`}
                    x={xAxisMode === 'sd' ? point.sd : point.position}
                    yAxisId="pressure"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="none"
                    label={{
                      value: '●',
                      position: 'center',
                      fill: '#ef4444',
                      fontSize: 18,
                    }}
                  />
                ) : null
              )}
            </ComposedChart>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground text-sm">Loading chart...</span>
            </div>
          )}
        </div>

        {/* Layer labels below chart */}
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
          {result.construction.layers.map((layer, idx) => (
            <div key={idx} className="flex items-center">
              {idx > 0 && <span className="mx-1">|</span>}
              <span className="whitespace-nowrap">{layer.material.name.split(' ').slice(0, 2).join(' ')}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-6 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#22c55e]" />
            <span className="text-muted-foreground">Temperature (°C)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#ef4444]" />
            <span className="text-muted-foreground">Partial Vapour Pressure (Pa)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#3b82f6]" />
            <span className="text-muted-foreground">Saturated Vapour Pressure (Pa)</span>
          </div>
          {condensationInterfaces.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive border-2 border-black" />
              <span className="text-muted-foreground">Condensation interface</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TemperatureProfileProps {
  result: AnalysisResult;
  className?: string;
}

const TEMP_CHART_HEIGHT = 200;

export function TemperatureProfile({ result, className }: TemperatureProfileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let rafId: number;
    let resizeObserver: ResizeObserver | null = null;
    
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      if (rect.width > 50) {
        setChartWidth(Math.floor(rect.width));
        setIsReady(true);
      }
    };

    rafId = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });

    const container = containerRef.current;
    if (container) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (width > 50) {
            setChartWidth(Math.floor(width));
          }
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
    };
  }, []);

  const chartData = result.temperatureGradient.map(point => ({
    position: point.position,
    temperature: Math.round(point.temperature * 10) / 10,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs text-muted-foreground mb-2">Position: {label}mm</p>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-chart-4" />
          <span className="text-muted-foreground">Temperature:</span>
          <span className="font-mono">{payload[0]?.value}°C</span>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <span className="panel-title">Temperature Profile</span>
      </div>
      
      <div className="p-4">
        <div 
          ref={containerRef} 
          style={{ 
            width: '100%', 
            height: TEMP_CHART_HEIGHT,
            minWidth: 300,
            display: 'block',
            position: 'relative'
          }}
        >
          {isReady && chartWidth > 50 ? (
            <LineChart 
              data={chartData} 
              width={chartWidth} 
              height={TEMP_CHART_HEIGHT}
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="position" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
                label={{ value: '°C', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Temperature gradient with color gradient effect */}
              <defs>
                <linearGradient id="tempGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--chart-5))" />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" />
                </linearGradient>
              </defs>
              
              <Line
                type="stepAfter"
                dataKey="temperature"
                stroke="url(#tempGradient)"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-4))', r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </LineChart>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground text-sm">Loading chart...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
