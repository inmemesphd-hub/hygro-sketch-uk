import { useMemo } from 'react';
import { MonthlyAnalysis } from '@/types/materials';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart, Area, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';

interface MonthlyAccumulationChartProps {
  monthlyData: MonthlyAnalysis[];
  className?: string;
}

export function MonthlyAccumulationChart({ monthlyData, className }: MonthlyAccumulationChartProps) {
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
      
      <div className="p-4" style={{ minHeight: 310 }}>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
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
          </ResponsiveContainer>
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
