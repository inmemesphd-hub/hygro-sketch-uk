import { AnalysisResult, ClimateData, ConstructionLayer } from '@/types/materials';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, AlertTriangle, Thermometer, Droplets, Layers, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reorderToOctSep } from '@/data/ukClimate';

interface DetailedResultsPanelProps {
  result: AnalysisResult;
  climateData: ClimateData[];
  layers: ConstructionLayer[];
  className?: string;
}

export function DetailedResultsPanel({ result, climateData, layers, className }: DetailedResultsPanelProps) {
  // Ensure climate data is in Oct-Sep order for display
  const orderedClimateData = reorderToOctSep(climateData);
  
  const maxAccumulation = Math.max(...result.monthlyData.map(d => d.cumulativeAccumulation));
  const endYearAccumulation = result.monthlyData[11]?.cumulativeAccumulation || 0;
  const totalCondensation = result.monthlyData.reduce((s, d) => s + d.condensationAmount, 0);
  const totalEvaporation = result.monthlyData.reduce((s, d) => s + d.evaporationAmount, 0);
  const hasSurfaceCondensation = (result.surfaceCondensationData || []).some(s => s.tsi < s.minTsi);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Overall Status */}
      <div className={cn(
        "p-4 rounded-lg text-center mb-4",
        result.overallResult === 'pass'
          ? "bg-success/10 border border-success/30"
          : "bg-destructive/10 border border-destructive/30"
      )}>
        <div className="flex items-center justify-center gap-2 mb-2">
          {result.overallResult === 'pass' ? (
            <CheckCircle className="w-6 h-6 text-success" />
          ) : (
            <XCircle className="w-6 h-6 text-destructive" />
          )}
          <span className={cn(
            "text-2xl font-bold",
            result.overallResult === 'pass' ? "text-success" : "text-destructive"
          )}>
            {result.overallResult === 'pass' ? 'COMPLIANT' : 'NON-COMPLIANT'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {result.overallResult === 'pass' 
            ? 'Construction passes BS EN ISO 13788 requirements'
            : result.failureReason || 'Construction fails condensation risk criteria'
          }
        </p>
      </div>

      {/* Tabs for different data views */}
      <Tabs defaultValue="summary" className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-4 mb-4">
          <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs">Monthly</TabsTrigger>
          <TabsTrigger value="surface" className="text-xs">Surface</TabsTrigger>
          <TabsTrigger value="layers" className="text-xs">Layers</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 h-[350px]">
          <TabsContent value="summary" className="mt-0 space-y-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard 
                label="U-Value (with bridging)" 
                value={result.uValue.toFixed(3)} 
                unit="W/m²K"
                icon={<Thermometer className="w-4 h-4" />}
              />
              {result.uValueWithoutBridging && result.uValueWithoutBridging !== result.uValue && (
                <MetricCard 
                  label="U-Value (no bridging)" 
                  value={result.uValueWithoutBridging.toFixed(3)} 
                  unit="W/m²K"
                  icon={<Thermometer className="w-4 h-4" />}
                />
              )}
              <MetricCard 
                label="Peak Accumulation" 
                value={maxAccumulation.toFixed(0)} 
                unit="g/m²"
                status={maxAccumulation < 500 ? 'pass' : 'fail'}
                icon={<Droplets className="w-4 h-4" />}
              />
              <MetricCard 
                label="Year-End Retained" 
                value={endYearAccumulation.toFixed(0)} 
                unit="g/m²"
                status={endYearAccumulation < 50 ? 'pass' : 'fail'}
                icon={<Droplets className="w-4 h-4" />}
              />
              <MetricCard 
                label="Total Condensation" 
                value={totalCondensation.toFixed(0)} 
                unit="g/m²"
                icon={<Droplets className="w-4 h-4" />}
              />
              <MetricCard 
                label="Total Evaporation" 
                value={totalEvaporation.toFixed(0)} 
                unit="g/m²"
                icon={<Droplets className="w-4 h-4" />}
              />
            </div>

            {/* Compliance Checks */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Compliance Checks
              </h4>
              <ComplianceCheck 
                passed={maxAccumulation < 500}
                label="Max accumulation < 500 g/m²"
                value={`${maxAccumulation.toFixed(0)} g/m²`}
              />
              <ComplianceCheck 
                passed={endYearAccumulation < 50}
                label="Moisture evaporates by year end"
                value={`${endYearAccumulation.toFixed(0)} g/m² retained`}
              />
              <ComplianceCheck 
                passed={!hasSurfaceCondensation}
                label="No surface condensation risk"
                value={hasSurfaceCondensation ? 'Risk identified' : 'Mould growth unlikely'}
              />
              <ComplianceCheck 
                passed={result.uValue < 0.3}
                label="U-Value < 0.30 (Part L)"
                value={`${result.uValue.toFixed(3)} W/m²K`}
              />
            </div>

            {/* Surface condensation statement */}
            {!hasSurfaceCondensation && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-medium text-success">No Surface Condensation Risk</p>
                    <p className="text-muted-foreground mt-1">
                      In accordance with BS EN ISO 13788, the internal surface temperature (Tsi) remains 
                      above the minimum required value (Tsi,min) throughout the year. Mould growth is unlikely.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Reference Standards */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium">Reference Standards</p>
                  <p className="text-muted-foreground mt-1">
                    BS EN ISO 13788, BS EN 15026, Approved Document C, BR 497
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-0">
            <ScrollArea className="h-[280px]">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Month</TableHead>
                    <TableHead className="text-xs text-right">Cond.</TableHead>
                    <TableHead className="text-xs text-right">Evap.</TableHead>
                    <TableHead className="text-xs text-right">Net</TableHead>
                    <TableHead className="text-xs text-right">Cumul.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.monthlyData.map((data, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-medium">{data.month.slice(0, 3)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{data.condensationAmount.toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{data.evaporationAmount.toFixed(1)}</TableCell>
                      <TableCell className={cn(
                        "text-xs text-right font-mono",
                        data.netAccumulation > 0 ? "text-destructive" : "text-success"
                      )}>
                        {data.netAccumulation.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{data.cumulativeAccumulation.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">All values in g/m²</p>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="surface" className="mt-0">
            <ScrollArea className="h-[280px]">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Month</TableHead>
                    <TableHead className="text-xs text-right">Ext °C</TableHead>
                    <TableHead className="text-xs text-right">Int °C</TableHead>
                    <TableHead className="text-xs text-right">fRsi,min</TableHead>
                    <TableHead className="text-xs text-right">Tsi,min</TableHead>
                    <TableHead className="text-xs text-right">Tsi</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderedClimateData.map((month, idx) => {
                    const sd = result.surfaceCondensationData?.find(s => s.month === month.month);
                    const passes = sd ? sd.tsi >= sd.minTsi : true;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium">{month.month.slice(0, 3)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{month.externalTemp.toFixed(1)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{month.internalTemp.toFixed(1)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{sd?.minTempFactor?.toFixed(3) || '-'}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{sd?.minTsi?.toFixed(1) || '-'}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{sd?.tsi?.toFixed(1) || '-'}</TableCell>
                        <TableCell className="text-xs text-center">
                          {passes ? (
                            <CheckCircle className="w-3 h-3 text-success inline" />
                          ) : (
                            <XCircle className="w-3 h-3 text-destructive inline" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="layers" className="mt-0">
            <ScrollArea className="h-[280px]">
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Material</TableHead>
                    <TableHead className="text-xs text-right">Thick.</TableHead>
                    <TableHead className="text-xs text-right">λ</TableHead>
                    <TableHead className="text-xs text-right">μ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {layers.map((layer, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-medium">{idx + 1}</TableCell>
                      <TableCell className="text-xs">
                        {layer.material.name.length > 20 
                          ? layer.material.name.slice(0, 20) + '...' 
                          : layer.material.name}
                        {layer.bridging && (
                          <span className="text-muted-foreground">
                            {' '}({layer.bridging.percentage}% bridge)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{layer.thickness}mm</TableCell>
                      <TableCell className="text-xs text-right font-mono">{layer.material.thermalConductivity}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{layer.material.vapourResistivity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">λ = Thermal conductivity (W/mK), μ = Vapour resistance factor</p>
            </ScrollArea>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  unit, 
  status, 
  icon 
}: { 
  label: string; 
  value: string; 
  unit: string; 
  status?: 'pass' | 'fail';
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "p-3 rounded-lg border",
      status === 'pass' && "bg-success/5 border-success/30",
      status === 'fail' && "bg-destructive/5 border-destructive/30",
      !status && "bg-secondary/50 border-border"
    )}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="font-mono text-lg">
        {value}
        <span className="text-xs text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  );
}

function ComplianceCheck({ passed, label, value }: { passed: boolean; label: string; value: string }) {
  return (
    <div className={cn(
      "flex items-center justify-between p-2 rounded-lg text-sm",
      passed ? "bg-success/5" : "bg-destructive/5"
    )}>
      <div className="flex items-center gap-2">
        {passed ? (
          <CheckCircle className="w-4 h-4 text-success" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-destructive" />
        )}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-mono text-muted-foreground">{value}</span>
    </div>
  );
}