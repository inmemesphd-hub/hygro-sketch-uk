import { useMemo, useRef, useState, useEffect } from 'react';
import { MonthlyAnalysis } from '@/types/materials';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line, ComposedChart, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';

interface MonthlyAccumulationChartProps {
  monthlyData: MonthlyAnalysis[];
  className?: string;
}

const CHART_HEIGHT = 280;

export function MonthlyAccumulationChart({ monthlyData, className }: MonthlyAccumulationChartProps) {
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

  // Guard against empty data
  if (!monthlyData || monthlyData.length === 0) {
    return (
      <div className={cn("panel", className)}>
        <div className="panel-header">
          <span className="panel-title">Annual Moisture Accumulation</span>
        </div>
        <div className="p-4 flex items-center justify-center h-64">
          <span className="text-muted-foreground">No data available</span>
        </div>
      </div>
    );
  }

  const chartData = monthlyData.map(d => ({
    month: d.month.slice(0, 3),
    condensation: d.condensationAmount,
    evaporation: d.evaporationAmount,
    net: d.netAccumulation,
    cumulative: d.cumulativeAccumulation,
  }));

  const maxAccumulation = Math.max(...monthlyData.map(d => d.cumulativeAccumulation));
  const passesCriteria = maxAccumulation < 500;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg min-w-[180px]">
        <p className="text-sm font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-mono">{entry.value.toFixed(1)} g/m²</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <span className="panel-title">Annual Moisture Accumulation</span>
        <div className={cn(
          "text-xs px-2 py-1 rounded",
          passesCriteria ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
        )}>
          Max: {maxAccumulation.toFixed(0)} g/m² {passesCriteria ? '✓' : '✗'}
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
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="month" 
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                yAxisId="left"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: 'g/m² per month', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                label={{ value: 'Cumulative g/m²', angle: 90, position: 'insideRight', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              
              {/* Warning threshold line */}
              <ReferenceLine yAxisId="right" y={500} stroke="hsl(var(--warning))" strokeDasharray="5 5" label={{ value: 'Limit', fill: 'hsl(var(--warning))', fontSize: 10 }} />
              
              {/* Condensation bars */}
              <Bar 
                yAxisId="left"
                dataKey="condensation" 
                name="Condensation" 
                fill="hsl(var(--chart-1))"
                radius={[2, 2, 0, 0]}
              />
              
              {/* Evaporation bars */}
              <Bar 
                yAxisId="left"
                dataKey="evaporation" 
                name="Evaporation" 
                fill="hsl(var(--chart-3))"
                radius={[2, 2, 0, 0]}
              />
              
              {/* Cumulative line */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                name="Cumulative"
                stroke="hsl(var(--chart-5))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-5))', r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </ComposedChart>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground text-sm">Loading chart...</span>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-4 text-center">
          <div className="p-2 rounded-lg bg-secondary/50">
            <div className="text-xs text-muted-foreground">Total Condensation</div>
            <div className="font-mono text-lg text-chart-1">
              {monthlyData.reduce((s, d) => s + d.condensationAmount, 0).toFixed(0)}
              <span className="text-xs text-muted-foreground ml-1">g/m²</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50">
            <div className="text-xs text-muted-foreground">Total Evaporation</div>
            <div className="font-mono text-lg text-chart-3">
              {monthlyData.reduce((s, d) => s + d.evaporationAmount, 0).toFixed(0)}
              <span className="text-xs text-muted-foreground ml-1">g/m²</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50">
            <div className="text-xs text-muted-foreground">Peak Accumulation</div>
            <div className="font-mono text-lg text-chart-5">
              {maxAccumulation.toFixed(0)}
              <span className="text-xs text-muted-foreground ml-1">g/m²</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-secondary/50">
            <div className="text-xs text-muted-foreground">End of Year</div>
            <div className="font-mono text-lg">
              {monthlyData[11]?.cumulativeAccumulation.toFixed(0) || 0}
              <span className="text-xs text-muted-foreground ml-1">g/m²</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
