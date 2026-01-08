import { useMemo } from 'react';
import { AnalysisResult } from '@/types/materials';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { cn } from '@/lib/utils';

interface GlastaDiagramProps {
  result: AnalysisResult;
  className?: string;
}

export function GlastaDiagram({ result, className }: GlastaDiagramProps) {
  const chartData = useMemo(() => {
    const data = [];
    const maxPosition = result.vapourPressureGradient[result.vapourPressureGradient.length - 1]?.position || 0;

    for (const point of result.vapourPressureGradient) {
      data.push({
        position: point.position,
        vapourPressure: Math.round(point.pressure),
        saturationPressure: Math.round(point.saturation),
        condensation: point.pressure > point.saturation ? Math.round(point.pressure - point.saturation) : 0,
      });
    }

    return data;
  }, [result]);

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
            <span className="font-mono">{entry.value} Pa</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <span className="panel-title">Glasta Diagram - Vapour Pressure Profile</span>
        {condensationZones.length > 0 && (
          <span className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive">
            {condensationZones.length} condensation zone{condensationZones.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="position" 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              label={{ value: 'Position (mm)', position: 'bottom', offset: -5, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              label={{ value: 'Pressure (Pa)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
            />
            
            {/* Saturation pressure line (dew point) */}
            <Line
              type="monotone"
              dataKey="saturationPressure"
              name="Saturation Pressure"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-2))', r: 4 }}
            />
            
            {/* Actual vapour pressure line */}
            <Line
              type="monotone"
              dataKey="vapourPressure"
              name="Vapour Pressure"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-1))', r: 4 }}
            />

            {/* Condensation area */}
            <Area
              type="monotone"
              dataKey="condensation"
              name="Condensation"
              fill="hsl(var(--destructive) / 0.3)"
              stroke="hsl(var(--destructive))"
              strokeWidth={0}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="mt-4 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-chart-1" />
            <span className="text-muted-foreground">Vapour Pressure (actual moisture in air)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-chart-2" />
            <span className="text-muted-foreground">Saturation Pressure (dew point)</span>
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
      
      <div className="p-4">
        <ResponsiveContainer width="100%" height={200}>
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
  );
}
