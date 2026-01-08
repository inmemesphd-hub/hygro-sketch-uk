import { ClimateData } from '@/types/materials';

// UK Average Climate Data (Based on London/South East - can be adjusted for regions)
export const ukMonthlyClimateData: ClimateData[] = [
  { month: 'January', externalTemp: 4.4, externalRH: 86, internalTemp: 20, internalRH: 60 },
  { month: 'February', externalTemp: 4.6, externalRH: 83, internalTemp: 20, internalRH: 60 },
  { month: 'March', externalTemp: 6.8, externalRH: 79, internalTemp: 20, internalRH: 55 },
  { month: 'April', externalTemp: 9.0, externalRH: 73, internalTemp: 20, internalRH: 55 },
  { month: 'May', externalTemp: 12.2, externalRH: 71, internalTemp: 20, internalRH: 50 },
  { month: 'June', externalTemp: 15.3, externalRH: 70, internalTemp: 22, internalRH: 50 },
  { month: 'July', externalTemp: 17.5, externalRH: 70, internalTemp: 22, internalRH: 50 },
  { month: 'August', externalTemp: 17.2, externalRH: 72, internalTemp: 22, internalRH: 50 },
  { month: 'September', externalTemp: 14.5, externalRH: 76, internalTemp: 21, internalRH: 55 },
  { month: 'October', externalTemp: 11.0, externalRH: 81, internalTemp: 20, internalRH: 55 },
  { month: 'November', externalTemp: 7.2, externalRH: 85, internalTemp: 20, internalRH: 60 },
  { month: 'December', externalTemp: 5.0, externalRH: 87, internalTemp: 20, internalRH: 60 },
];

// UK Regional Climate Adjustments
export const ukRegions = [
  { id: 'london', name: 'London & South East', tempOffset: 0, rhOffset: 0 },
  { id: 'south-west', name: 'South West', tempOffset: 0.5, rhOffset: 3 },
  { id: 'midlands', name: 'Midlands', tempOffset: -0.5, rhOffset: 2 },
  { id: 'north-west', name: 'North West', tempOffset: -1.0, rhOffset: 5 },
  { id: 'north-east', name: 'North East', tempOffset: -1.5, rhOffset: 3 },
  { id: 'scotland-lowland', name: 'Scotland (Lowlands)', tempOffset: -2.0, rhOffset: 4 },
  { id: 'scotland-highland', name: 'Scotland (Highlands)', tempOffset: -3.5, rhOffset: 5 },
  { id: 'wales', name: 'Wales', tempOffset: -0.5, rhOffset: 5 },
  { id: 'northern-ireland', name: 'Northern Ireland', tempOffset: -0.8, rhOffset: 4 },
];

export const getRegionalClimateData = (regionId: string): ClimateData[] => {
  const region = ukRegions.find(r => r.id === regionId);
  if (!region) return ukMonthlyClimateData;

  return ukMonthlyClimateData.map(data => ({
    ...data,
    externalTemp: Math.round((data.externalTemp + region.tempOffset) * 10) / 10,
    externalRH: Math.min(100, Math.max(0, data.externalRH + region.rhOffset)),
  }));
};

// Surface resistances as per BS EN ISO 6946
export const surfaceResistances = {
  internal: {
    horizontal: 0.13, // m²·K/W
    upward: 0.10,
    downward: 0.17,
  },
  external: {
    sheltered: 0.06,
    normal: 0.04,
    exposed: 0.02,
  },
};
