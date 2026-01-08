import { ClimateData } from '@/types/materials';
import { ukRegions, getRegionalClimateData } from '@/data/ukClimate';
import { DataCard } from '@/components/ui/DataDisplay';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cloud, Home, Thermometer, Droplets } from 'lucide-react';

interface ClimateInputProps {
  climateData: ClimateData[];
  onChange: (data: ClimateData[]) => void;
  selectedRegion: string;
  onRegionChange: (region: string) => void;
}

export function ClimateInput({ 
  climateData, 
  onChange, 
  selectedRegion, 
  onRegionChange 
}: ClimateInputProps) {

  const handleRegionChange = (region: string) => {
    onRegionChange(region);
    onChange(getRegionalClimateData(region));
  };

  const updateMonthData = (index: number, field: keyof ClimateData, value: number) => {
    const newData = [...climateData];
    newData[index] = { ...newData[index], [field]: value };
    onChange(newData);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-primary" />
          <span className="panel-title">Climate Data</span>
        </div>
        
        <Select value={selectedRegion} onValueChange={handleRegionChange}>
          <SelectTrigger className="w-48 bg-secondary border-border">
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent>
            {ukRegions.map(region => (
              <SelectItem key={region.id} value={region.id}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="table" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Month</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Thermometer className="w-3 h-3" />
                      Ext. °C
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Droplets className="w-3 h-3" />
                      Ext. RH%
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Home className="w-3 h-3" />
                      Int. °C
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Droplets className="w-3 h-3" />
                      Int. RH%
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {climateData.map((data, index) => (
                  <tr key={data.month} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium">{data.month.slice(0, 3)}</td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={data.externalTemp}
                        onChange={(e) => updateMonthData(index, 'externalTemp', parseFloat(e.target.value))}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                        step="0.1"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={data.externalRH}
                        onChange={(e) => updateMonthData(index, 'externalRH', parseFloat(e.target.value))}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                        min="0"
                        max="100"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={data.internalTemp}
                        onChange={(e) => updateMonthData(index, 'internalTemp', parseFloat(e.target.value))}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                        step="0.1"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={data.internalRH}
                        onChange={(e) => updateMonthData(index, 'internalRH', parseFloat(e.target.value))}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                        min="0"
                        max="100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Cloud className="w-4 h-4 text-chart-1" />
                <span className="text-sm font-medium">External Conditions</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min Temp</span>
                  <span className="font-mono">{Math.min(...climateData.map(d => d.externalTemp)).toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Temp</span>
                  <span className="font-mono">{Math.max(...climateData.map(d => d.externalTemp)).toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg RH</span>
                  <span className="font-mono">{(climateData.reduce((s, d) => s + d.externalRH, 0) / 12).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-4 h-4 text-chart-3" />
                <span className="text-sm font-medium">Internal Conditions</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min Temp</span>
                  <span className="font-mono">{Math.min(...climateData.map(d => d.internalTemp)).toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Temp</span>
                  <span className="font-mono">{Math.max(...climateData.map(d => d.internalTemp)).toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg RH</span>
                  <span className="font-mono">{(climateData.reduce((s, d) => s + d.internalRH, 0) / 12).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
