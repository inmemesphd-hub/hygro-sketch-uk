import { useMemo, useState } from 'react';
import { AnalysisResult, ClimateData, Construction } from '@/types/materials';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, ComposedChart, ReferenceLine, ReferenceArea } from 'recharts';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { performCondensationAnalysis } from '@/utils/hygrothermalCalculations';

interface GlastaDiagramProps {
  result: AnalysisResult;
  climateData?: ClimateData[];
  className?: string;
  showMonthSelector?: boolean;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function GlastaDiagram({ 
  result, 
  climateData,
  className, 
  showMonthSelector = true,
  selectedMonth,
  onMonthChange
}: GlastaDiagramProps) {
  const [internalSelectedMonth, setInternalSelectedMonth] = useState<string>('worst');
  const currentMonth = selectedMonth ?? internalSelectedMonth;
  const handleMonthChange = onMonthChange ?? setInternalSelectedMonth;

  // Find the worst month (closest to or at condensation)
  const worstMonth = useMemo(() => {
    let worstIdx = 0;
    let worstRatio = 0;
    
    result.vapourPressureGradient.forEach((_, idx) => {
      const monthlyData = result.monthlyData;
      monthlyData.forEach((data, mIdx) => {
        if (data.condensationAmount > 0 || data.cumulativeAccumulation > worstRatio) {
          worstRatio = data.cumulativeAccumulation;
          worstIdx = mIdx;
        }
      });
    });
    
    return months[worstIdx] || 'January';
  }, [result]);

  const displayMonth = currentMonth === 'worst' ? worstMonth : currentMonth;

  // Build chart data with temperature line
  const chartData = useMemo(() => {
    const data: any[] = [];
    const totalThickness = result.construction.layers.reduce((sum, l) => sum + l.thickness, 0);
    
    // Get the climate data for the selected month
    const monthIndex = months.indexOf(displayMonth);
    const monthClimate = climateData?.[monthIndex] || {
      internalTemp: 20,
      externalTemp: 5,
      internalRH: 60,
      externalRH: 85
    };

    // Calculate cumulative vapour resistance for x-axis (sd values)
    let cumulativeSd = 0;
    const layerBoundaries: { position: number; name: string; sd: number }[] = [];
    
    result.construction.layers.forEach((layer, idx) => {
      const sd = (layer.thickness / 1000) * layer.material.vapourResistivity;
      layerBoundaries.push({
        position: cumulativeSd,
        name: layer.material.name,
        sd: cumulativeSd
      });
      cumulativeSd += sd;
    });

    for (const point of result.vapourPressureGradient) {
      // Calculate sd value for this position
      let positionSd = 0;
      let accumulated = 0;
      for (const layer of result.construction.layers) {
        const layerThickness = layer.thickness;
        if (accumulated + layerThickness >= point.position) {
          const fraction = (point.position - accumulated) / layerThickness;
          const layerSd = (layer.thickness / 1000) * layer.material.vapourResistivity;
          positionSd += layerSd * fraction;
          break;
        } else {
          positionSd += (layer.thickness / 1000) * layer.material.vapourResistivity;
          accumulated += layerThickness;
        }
      }

      // Get temperature at this position
      const tempPoint = result.temperatureGradient.find(t => t.position === point.position);
      const temperature = tempPoint?.temperature ?? 0;

      data.push({
        position: point.position,
        sd: Math.round(positionSd * 100) / 100,
        vapourPressure: Math.round(point.pressure),
        saturationPressure: Math.round(point.saturation),
        temperature: Math.round(temperature * 10) / 10,
        condensation: point.pressure > point.saturation ? Math.round(point.pressure - point.saturation) : 0,
      });
    }

    return data;
  }, [result, displayMonth, climateData]);

  // Find condensation zones
  const condensationZones = useMemo(() => {
    const zones: { start: number; end: number }[] = [];
    let inZone = false;
    let zoneStart = 0;

    for (const point of result.vapourPressureGradient) {
      if (point.pressure > point.saturation && !inZone) {
        inZone = true;
        zoneStart = point.position;
      } else if (point.pressure <= point.saturation && inZone) {
        inZone = false;
        zones.push({ start: zoneStart, end: point.position });
      }
    }

    if (inZone) {
      zones.push({ start: zoneStart, end: result.vapourPressureGradient[result.vapourPressureGradient.length - 1]?.position || 0 });
    }

    return zones;
  }, [result]);

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
          {condensationZones.length > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive">
              {condensationZones.length} condensation zone{condensationZones.length > 1 ? 's' : ''}
            </span>
          )}
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
      
      <div className="p-4" style={{ minHeight: 380 }}>
        <div style={{ width: '100%', height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              
              {/* Layer boundary reference lines */}
              {layerBoundaries.map((boundary, idx) => (
                <ReferenceLine 
                  key={idx}
                  x={boundary.position}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  strokeWidth={1}
                />
              ))}

              <XAxis 
                dataKey="position" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: 'Position (mm)', position: 'bottom', offset: 10, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
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
              
              {/* Temperature line (green) */}
              <Line
                yAxisId="temperature"
                type="monotone"
                dataKey="temperature"
                name="Temperature (°C)"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3 }}
              />
              
              {/* Saturation pressure line (blue) */}
              <Line
                yAxisId="pressure"
                type="monotone"
                dataKey="saturationPressure"
                name="Saturated VP (Pa)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
              />
              
              {/* Actual vapour pressure line (red) */}
              <Line
                yAxisId="pressure"
                type="monotone"
                dataKey="vapourPressure"
                name="Partial VP (Pa)"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
              />

              {/* Condensation area */}
              <Area
                yAxisId="pressure"
                type="monotone"
                dataKey="condensation"
                name="Condensation"
                fill="hsl(var(--destructive) / 0.3)"
                stroke="transparent"
                strokeWidth={0}
              />
            </ComposedChart>
          </ResponsiveContainer>
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
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive/30" />
            <span className="text-muted-foreground">Condensation zone</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TemperatureProfileProps {
  result: AnalysisResult;
  className?: string;
}

export function TemperatureProfile({ result, className }: TemperatureProfileProps) {
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
      
      <div className="p-4" style={{ minHeight: 230 }}>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
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
                type="monotone"
                dataKey="temperature"
                stroke="url(#tempGradient)"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-4))', r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}