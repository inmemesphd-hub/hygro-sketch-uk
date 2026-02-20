import { useMemo, useState, useRef, useEffect } from 'react';
import { AnalysisResult, ClimateData } from '@/types/materials';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  calculateSaturationPressure,
  calculateVapourPressure,
  calculateTemperatureGradient,
  calculateSd,
} from '@/utils/hygrothermalCalculations';

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ChartPoint {
  position: number;   // mm from internal surface
  sd: number;         // cumulative Sd (m)
  pv: number;         // partial vapour pressure (Pa) — raw linear, may exceed psat
  psat: number;       // saturation vapour pressure (Pa)
  temperature: number;
  isCondensationInterface: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'October', 'November', 'December', 'January', 'February', 'March',
  'April', 'May', 'June', 'July', 'August', 'September'
];

const CHART_HEIGHT = 380;

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Build Glaser diagram data for a specific month.
 *
 * Strategy (ISO 13788 Glaser method visual):
 *  • Compute the STRAIGHT-LINE Pv gradient from pInternal → pExternal
 *    proportional to cumulative Sd at each interface.
 *  • Compute Psat at each interface from the temperature gradient.
 *  • Plot BOTH lines as-is — the red Pv line will naturally cross/exceed the
 *    blue Psat curve at interfaces where condensation occurs.
 *  • Mark those crossing interfaces with a condensation indicator.
 *
 * This approach guarantees visual intersection whenever condensation is predicted.
 */
function buildGlaserChartData(
  result: AnalysisResult,
  climateData: ClimateData[],
  displayMonth: string
): ChartPoint[] {
  const layers = result.construction.layers;

  // Find climate for this month
  const climate = climateData.find(c => c.month === displayMonth) ?? {
    internalTemp: 20,
    externalTemp: 5,
    internalRH: 60,
    externalRH: 85,
  };

  const pInternal = calculateVapourPressure(climate.internalTemp, climate.internalRH);
  const pExternal = calculateVapourPressure(climate.externalTemp, climate.externalRH);

  // Build interface list: position (mm) and cumulative Sd (m)
  const interfaces: { position: number; sd: number }[] = [{ position: 0, sd: 0 }];
  let cumPos = 0;
  let cumSd = 0;
  for (const layer of layers) {
    cumPos += layer.thickness;
    cumSd += calculateSd(layer);
    interfaces.push({ position: cumPos, sd: cumSd });
  }
  const totalSd = cumSd;

  // Temperature at each interface
  const tempGrad = calculateTemperatureGradient(
    result.construction,
    climate.internalTemp,
    climate.externalTemp
  );

  const points: ChartPoint[] = [];

  for (let i = 0; i < interfaces.length; i++) {
    const iface = interfaces[i];
    const temp = tempGrad[i]?.temperature ?? climate.externalTemp;
    const psat = calculateSaturationPressure(temp);

    // Linear Pv gradient based on Sd fraction — NOT capped
    const sdFraction = totalSd > 0 ? iface.sd / totalSd : i / (interfaces.length - 1);
    const pv = pInternal - (pInternal - pExternal) * sdFraction;

    points.push({
      position: iface.position,
      sd: Math.round(iface.sd * 1000) / 1000,
      pv: Math.round(pv),
      psat: Math.round(psat),
      temperature: Math.round(temp * 10) / 10,
      // Condensation interface: Pv exceeds Psat at an internal interface (not surfaces)
      isCondensationInterface: i > 0 && i < interfaces.length - 1 && pv > psat,
    });
  }

  return points;
}

function findWorstMonth(result: AnalysisResult): string {
  let worst = 'January';
  let maxCond = 0;
  for (const d of result.monthlyData) {
    if (d.condensationAmount > maxCond) {
      maxCond = d.condensationAmount;
      worst = d.month;
    }
  }
  return maxCond === 0 ? 'January' : worst;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function GlaserTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
      <p className="text-xs text-muted-foreground mb-1">Position: {label} mm</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono">
            {entry.value}{entry.dataKey === 'temperature' ? ' °C' : ' Pa'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GlastaDiagram({
  result,
  climateData = [],
  className,
  showMonthSelector = true,
  selectedMonth,
  onMonthChange,
  xAxisMode: externalXAxisMode,
  onXAxisModeChange,
}: GlastaDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [internalMonth, setInternalMonth] = useState<string>('worst');
  const [internalXAxisMode, setInternalXAxisMode] = useState<'thickness' | 'sd'>('thickness');

  const currentMonth = selectedMonth ?? internalMonth;
  const handleMonthChange = onMonthChange ?? setInternalMonth;
  const xAxisMode = externalXAxisMode ?? internalXAxisMode;
  const handleXAxisModeChange = onXAxisModeChange ?? setInternalXAxisMode;

  // Measure container width
  useEffect(() => {
    let rafId: number;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (w > 100) { setChartWidth(Math.floor(w)); setIsReady(true); }
    };
    rafId = requestAnimationFrame(() => requestAnimationFrame(measure));

    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 100) setChartWidth(Math.floor(w));
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  const worstMonth = useMemo(() => findWorstMonth(result), [result]);
  const displayMonth = currentMonth === 'worst' ? worstMonth : currentMonth;

  const chartData = useMemo(
    () => buildGlaserChartData(result, climateData, displayMonth),
    [result, climateData, displayMonth]
  );

  const condensationCount = chartData.filter(p => p.isCondensationInterface).length;

  // Layer boundaries for vertical reference lines (position in mm or Sd)
  const layerBoundaries = useMemo(() => {
    const out: { pos: number; sd: number; name: string }[] = [];
    let pos = 0; let sd = 0;
    result.construction.layers.forEach((layer, idx) => {
      if (idx > 0) out.push({ pos, sd: Math.round(sd * 1000) / 1000, name: layer.material.name });
      pos += layer.thickness;
      sd += calculateSd(layer);
    });
    return out;
  }, [result.construction.layers]);

  const xKey = xAxisMode === 'sd' ? 'sd' : 'position';
  const xLabel = xAxisMode === 'sd' ? 'Equivalent Air Layer Thickness Sd (m)' : 'Position (mm)';

  return (
    <div className={cn('panel', className)}>
      <div className="panel-header">
        <span className="panel-title">Glaser Diagram — {displayMonth}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {condensationCount > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive">
              {condensationCount} condensation interface{condensationCount > 1 ? 's' : ''}
            </span>
          )}
          <Select value={xAxisMode} onValueChange={v => handleXAxisModeChange(v as 'thickness' | 'sd')}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="thickness">mm</SelectItem>
              <SelectItem value="sd">Sd (m)</SelectItem>
            </SelectContent>
          </Select>
          {showMonthSelector && (
            <Select value={currentMonth} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="worst">Worst Month</SelectItem>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="p-4">
        <div
          ref={containerRef}
          style={{ width: '100%', height: CHART_HEIGHT, minWidth: 300, position: 'relative' }}
        >
          {isReady && chartWidth > 100 ? (
            <ComposedChart
              data={chartData}
              width={chartWidth}
              height={CHART_HEIGHT}
              margin={{ top: 20, right: 70, left: 20, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />

              {/* Layer boundary vertical lines */}
              {layerBoundaries.map((b, i) => (
                <ReferenceLine
                  key={i}
                  x={xAxisMode === 'sd' ? b.sd : b.pos}
                  yAxisId="pressure"
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              ))}

              {/* Condensation interface vertical lines (red solid) */}
              {chartData.filter(p => p.isCondensationInterface).map((p, i) => (
                <ReferenceLine
                  key={`cond-${i}`}
                  x={xAxisMode === 'sd' ? p.sd : p.position}
                  yAxisId="pressure"
                  stroke="#ef4444"
                  strokeWidth={2}
                  label={{
                    value: '▼ condensation',
                    position: 'top',
                    fill: '#ef4444',
                    fontSize: 10,
                  }}
                />
              ))}

              <XAxis
                dataKey={xKey}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                type="number"
                domain={['dataMin', 'dataMax']}
                label={{ value: xLabel, position: 'bottom', offset: 20, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />

              {/* Left Y-axis: Pressure */}
              <YAxis
                yAxisId="pressure"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: 'Pressure (Pa)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />

              {/* Right Y-axis: Temperature */}
              <YAxis
                yAxisId="temperature"
                orientation="right"
                stroke="#22c55e"
                tick={{ fontSize: 11, fill: '#22c55e' }}
                label={{ value: 'Temperature (°C)', angle: 90, position: 'insideRight', fill: '#22c55e', fontSize: 11 }}
                domain={['auto', 'auto']}
              />

              <Tooltip content={<GlaserTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

              {/* Temperature — green */}
              <Line
                yAxisId="temperature"
                type="linear"
                dataKey="temperature"
                name="Temperature (°C)"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3 }}
                activeDot={{ r: 5 }}
              />

              {/* Saturation pressure — blue */}
              <Line
                yAxisId="pressure"
                type="linear"
                dataKey="psat"
                name="Psat — Saturated VP (Pa)"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ fill: '#3b82f6', r: 3 }}
                activeDot={{ r: 5 }}
              />

              {/* Partial vapour pressure — red (UNCAPPED, will cross Psat when condensation) */}
              <Line
                yAxisId="pressure"
                type="linear"
                dataKey="pv"
                name="Pv — Partial VP (Pa)"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload?.isCondensationInterface) {
                    // Filled red circle with black ring at condensation interface
                    return (
                      <circle key={`dot-cond-${cx}`} cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#000" strokeWidth={2} />
                    );
                  }
                  return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill="#ef4444" />;
                }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground text-sm">Loading chart…</span>
            </div>
          )}
        </div>

        {/* Layer labels */}
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
          {result.construction.layers.map((layer, idx) => (
            <div key={idx} className="flex items-center">
              {idx > 0 && <span className="mx-1 text-muted-foreground/40">|</span>}
              <span className="whitespace-nowrap">{layer.material.name.split(' ').slice(0, 3).join(' ')}</span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-6 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#22c55e]" />
            <span className="text-muted-foreground">Temperature (°C)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#ef4444]" />
            <span className="text-muted-foreground">Partial VP Pv (Pa)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#3b82f6]" />
            <span className="text-muted-foreground">Saturated VP Psat (Pa)</span>
          </div>
          {condensationCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive border-2 border-black" />
              <span className="text-muted-foreground">Condensation interface (Pv &gt; Psat)</span>
            </div>
          )}
        </div>

        {/* Condensation info */}
        {condensationCount > 0 && (
          <div className="mt-3 p-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            ⚠ Interstitial condensation predicted for <strong>{displayMonth}</strong>:
            the red Pv line exceeds the blue Psat curve at {condensationCount} interface{condensationCount > 1 ? 's' : ''}.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Temperature Profile (unchanged) ─────────────────────────────────────────

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
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (w > 50) { setChartWidth(Math.floor(w)); setIsReady(true); }
    };
    rafId = requestAnimationFrame(() => requestAnimationFrame(measure));
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 50) setChartWidth(Math.floor(w));
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  const chartData = result.temperatureGradient.map(p => ({
    position: p.position,
    temperature: Math.round(p.temperature * 10) / 10,
  }));

  return (
    <div className={cn('panel', className)}>
      <div className="panel-header">
        <span className="panel-title">Temperature Profile</span>
      </div>
      <div className="p-4">
        <div ref={containerRef} style={{ width: '100%', height: TEMP_CHART_HEIGHT, minWidth: 300, position: 'relative' }}>
          {isReady && chartWidth > 50 ? (
            <ComposedChart data={chartData} width={chartWidth} height={TEMP_CHART_HEIGHT}
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="position" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
                label={{ value: '°C', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
                      <p className="text-xs text-muted-foreground mb-1">Position: {label} mm</p>
                      <span className="font-mono">{payload[0]?.value} °C</span>
                    </div>
                  ) : null
                }
              />
              <Line type="linear" dataKey="temperature" stroke="#22c55e" strokeWidth={3}
                dot={{ fill: '#22c55e', r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </ComposedChart>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground text-sm">Loading chart…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
