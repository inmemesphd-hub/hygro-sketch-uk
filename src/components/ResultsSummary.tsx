import { AnalysisResult } from '@/types/materials';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataDisplay } from '@/components/ui/DataDisplay';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, AlertTriangle, FileDown, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResultsSummaryProps {
  result: AnalysisResult;
  onExportPDF?: () => void;
  className?: string;
}

export function ResultsSummary({ result, onExportPDF, className }: ResultsSummaryProps) {
  const maxAccumulation = Math.max(...result.monthlyData.map(d => d.cumulativeAccumulation));
  const endYearAccumulation = result.monthlyData[11]?.cumulativeAccumulation || 0;
  const totalCondensation = result.monthlyData.reduce((s, d) => s + d.condensationAmount, 0);
  const totalEvaporation = result.monthlyData.reduce((s, d) => s + d.evaporationAmount, 0);

  const condensationLocations = result.condensationResults
    .filter(r => r.risk !== 'none')
    .map(r => `Layer ${r.layer + 1} (${r.position}mm)`);

  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <span className="panel-title">Analysis Summary</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportPDF}>
            <FileDown className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <div className="p-4">
        {/* Main Status */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg mb-4",
          result.overallResult === 'pass' 
            ? "bg-success/10 border border-success/30" 
            : "bg-destructive/10 border border-destructive/30"
        )}>
          <div className="flex items-center gap-3">
            {result.overallResult === 'pass' ? (
              <CheckCircle className="w-6 h-6 text-success" />
            ) : (
              <XCircle className="w-6 h-6 text-destructive" />
            )}
            <div>
              <h3 className={cn(
                "text-base font-semibold",
                result.overallResult === 'pass' ? "text-success" : "text-destructive"
              )}>
                {result.overallResult === 'pass' ? 'COMPLIANT' : 'NON-COMPLIANT'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {result.overallResult === 'pass' 
                  ? 'Passes BS EN ISO 13788'
                  : result.failureReason || 'Fails condensation risk criteria'
                }
              </p>
            </div>
          </div>

          <StatusBadge 
            status={result.overallResult === 'pass' ? 'pass' : 'fail'}
            label={result.overallResult === 'pass' ? 'Pass' : 'Fail'}
          />
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <DataDisplay 
              label="U-Value"
              value={result.uValue}
              unit="W/m²K"
              size="md"
            />
            {result.uValueWithoutBridging && result.uValueWithoutBridging !== result.uValue && (
              <div className="text-xs text-muted-foreground mt-1">
                No bridging: {result.uValueWithoutBridging} W/m²K
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <DataDisplay 
              label="Peak Accumulation"
              value={maxAccumulation.toFixed(0)}
              unit="g/m²"
              size="md"
            />
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <DataDisplay 
              label="Annual Net"
              value={(totalCondensation - totalEvaporation).toFixed(0)}
              unit="g/m²"
              size="md"
            />
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <DataDisplay 
              label="Year-End Retained"
              value={endYearAccumulation.toFixed(0)}
              unit="g/m²"
              size="md"
            />
          </div>
        </div>

        {/* Compliance Checklist */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Compliance Checks
          </h4>
          
          <div className="space-y-1.5">
            <ComplianceItem
              passed={maxAccumulation < 500}
              label="Max accumulation < 500 g/m²"
              value={`${maxAccumulation.toFixed(0)} g/m²`}
            />
            <ComplianceItem
              passed={endYearAccumulation < 50}
              label="Moisture evaporates by year end"
              value={`${endYearAccumulation.toFixed(0)} g/m² retained`}
            />
            <ComplianceItem
              passed={condensationLocations.length === 0}
              label="No interstitial condensation"
              value={condensationLocations.length > 0 
                ? `Found at: ${condensationLocations.slice(0, 2).join(', ')}` 
                : 'None detected'
              }
            />
            <ComplianceItem
              passed={result.uValue < 0.3}
              label="U-Value < 0.30 (Part L)"
              value={`${result.uValue} W/m²K`}
            />
          </div>
        </div>

        {/* Standards Reference */}
        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
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
      </div>
    </div>
  );
}

function ComplianceItem({ passed, label, value }: { passed: boolean; label: string; value: string }) {
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
