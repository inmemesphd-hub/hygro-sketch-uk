import { useState, useEffect } from 'react';
import { ClimateData } from '@/types/materials';
import { ukCities, getCityClimateData, humidityClasses, HumidityClass } from '@/data/ukClimate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cloud, Home, Thermometer, Droplets } from 'lucide-react';

interface ClimateInputProps {
  climateData: ClimateData[];
  onChange: (data: ClimateData[]) => void;
  selectedRegion: string;
  onRegionChange: (region: string) => void;
  humidityClass?: HumidityClass;
  onHumidityClassChange?: (humidityClass: HumidityClass) => void;
}

export function ClimateInput({ 
  climateData, 
  onChange, 
  selectedRegion, 
  onRegionChange,
  humidityClass = 3,
  onHumidityClassChange 
}: ClimateInputProps) {
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [localHumidityClass, setLocalHumidityClass] = useState<HumidityClass>(humidityClass);

  // Sync local humidity class with prop
  useEffect(() => {
    setLocalHumidityClass(humidityClass);
  }, [humidityClass]);

  const handleRegionChange = (region: string) => {
    onRegionChange(region);
    const newData = getCityClimateData(region, localHumidityClass);
    onChange(newData);
    setIsManuallyEdited(false);
  };

  const handleHumidityClassChange = (classValue: string) => {
    const newClass = parseInt(classValue) as HumidityClass;
    setLocalHumidityClass(newClass);
    onHumidityClassChange?.(newClass);
    const newData = getCityClimateData(selectedRegion, newClass);
    onChange(newData);
    setIsManuallyEdited(false);
  };

  const updateMonthData = (index: number, field: keyof ClimateData, value: string) => {
    // Allow empty string during editing - only validate and commit on blur
    if (value === '' || value === '-') return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    const newData = [...climateData];
    newData[index] = { ...newData[index], [field]: numValue };
    onChange(newData);
    setIsManuallyEdited(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-primary" />
          <span className="panel-title">Climate Data</span>
        </div>
      </div>
      
      {/* City and Humidity Class selectors */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Weather Location</label>
          <Select value={selectedRegion} onValueChange={handleRegionChange}>
            <SelectTrigger className="w-full bg-secondary border-border">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {ukCities.map(city => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Humidity Class (BS 5250)</label>
          <Select value={localHumidityClass.toString()} onValueChange={handleHumidityClassChange}>
            <SelectTrigger className="w-full bg-secondary border-border">
              <SelectValue placeholder="Select humidity class" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(humidityClasses).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Humidity class description */}
      <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
        {humidityClasses[localHumidityClass].description}
      </div>

      {isManuallyEdited && (
        <div className="text-xs text-warning bg-warning/10 p-2 rounded border border-warning/20">
          ⚠️ Climate data manually edited. Select a city or humidity class to reset.
        </div>
      )}

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
                      <Thermometer className="w-3 h-3" />Ext. °C
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Droplets className="w-3 h-3" />Ext. RH%
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Home className="w-3 h-3" />Int. °C
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <Droplets className="w-3 h-3" />Int. RH%
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
                        step="0.1"
                        defaultValue={data.externalTemp}
                        onBlur={(e) => updateMonthData(index, 'externalTemp', e.target.value)}
                        key={`ext-temp-${data.month}-${selectedRegion}-${localHumidityClass}`}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={data.externalRH}
                        onBlur={(e) => updateMonthData(index, 'externalRH', e.target.value)}
                        key={`ext-rh-${data.month}-${selectedRegion}-${localHumidityClass}`}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        step="0.1"
                        defaultValue={data.internalTemp}
                        onBlur={(e) => updateMonthData(index, 'internalTemp', e.target.value)}
                        key={`int-temp-${data.month}-${selectedRegion}-${localHumidityClass}`}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={data.internalRH}
                        onBlur={(e) => updateMonthData(index, 'internalRH', e.target.value)}
                        key={`int-rh-${data.month}-${selectedRegion}-${localHumidityClass}`}
                        className="h-7 w-16 text-center font-mono text-xs bg-secondary/50 border-border mx-auto"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Internal conditions per BS 5250 / ISO 13788 humidity classes. Click values to edit.
          </p>
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
                  <span className="text-muted-foreground">Min RH</span>
                  <span className="font-mono">{Math.min(...climateData.map(d => d.internalRH)).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max RH</span>
                  <span className="font-mono">{Math.max(...climateData.map(d => d.internalRH)).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
