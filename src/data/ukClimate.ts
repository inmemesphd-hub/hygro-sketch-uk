import { ClimateData } from '@/types/materials';

// UK City-based weather data with ISO 13788 compliant internal conditions
// External data based on Met Office historical averages
// Internal conditions calculated per BS EN ISO 13788 Annex A

// Humidity Classes 1-5 per BS 5250 / ISO 13788 Table 1
// Monthly internal RH values for each class
export type HumidityClass = 1 | 2 | 3 | 4 | 5;

export const humidityClasses: Record<HumidityClass, { name: string; description: string; monthlyRH: number[] }> = {
  1: { 
    name: 'Class 1 - Storage', 
    description: 'Storage areas, warehouses',
    // Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
    monthlyRH: [28, 28, 32, 35, 43, 52, 59, 60, 54, 46, 35, 31] 
  },
  2: { 
    name: 'Class 2 - Offices', 
    description: 'Offices, shops, low occupancy',
    monthlyRH: [38, 38, 40, 42, 48, 55, 61, 62, 58, 51, 43, 40] 
  },
  3: { 
    name: 'Class 3 - Dwellings', 
    description: 'Dwellings with normal occupancy',
    monthlyRH: [48, 47, 48, 49, 53, 58, 63, 65, 61, 57, 51, 49] 
  },
  4: { 
    name: 'Class 4 - High Occupancy', 
    description: 'Sports halls, kitchens, canteens',
    monthlyRH: [57, 56, 56, 56, 58, 61, 65, 67, 65, 62, 59, 58] 
  },
  5: { 
    name: 'Class 5 - Special', 
    description: 'Swimming pools, laundries, breweries',
    monthlyRH: [67, 66, 64, 63, 63, 64, 67, 69, 68, 67, 67, 67] 
  },
};

// UK Cities with actual weather data
export interface CityClimateData {
  id: string;
  name: string;
  monthlyData: {
    month: string;
    externalTemp: number;
    externalRH: number;
  }[];
}

export const ukCityClimateData: CityClimateData[] = [
  {
    id: 'london',
    name: 'London',
    monthlyData: [
      { month: 'January', externalTemp: 5.2, externalRH: 86 },
      { month: 'February', externalTemp: 5.3, externalRH: 83 },
      { month: 'March', externalTemp: 7.6, externalRH: 79 },
      { month: 'April', externalTemp: 10.0, externalRH: 73 },
      { month: 'May', externalTemp: 13.3, externalRH: 71 },
      { month: 'June', externalTemp: 16.4, externalRH: 70 },
      { month: 'July', externalTemp: 18.7, externalRH: 69 },
      { month: 'August', externalTemp: 18.4, externalRH: 71 },
      { month: 'September', externalTemp: 15.5, externalRH: 76 },
      { month: 'October', externalTemp: 11.9, externalRH: 81 },
      { month: 'November', externalTemp: 8.0, externalRH: 85 },
      { month: 'December', externalTemp: 5.7, externalRH: 87 },
    ],
  },
  {
    id: 'manchester',
    name: 'Manchester',
    monthlyData: [
      { month: 'January', externalTemp: 4.4, externalRH: 88 },
      { month: 'February', externalTemp: 4.6, externalRH: 85 },
      { month: 'March', externalTemp: 6.5, externalRH: 82 },
      { month: 'April', externalTemp: 8.8, externalRH: 76 },
      { month: 'May', externalTemp: 11.9, externalRH: 73 },
      { month: 'June', externalTemp: 14.7, externalRH: 73 },
      { month: 'July', externalTemp: 16.8, externalRH: 74 },
      { month: 'August', externalTemp: 16.5, externalRH: 76 },
      { month: 'September', externalTemp: 14.0, externalRH: 80 },
      { month: 'October', externalTemp: 10.5, externalRH: 84 },
      { month: 'November', externalTemp: 7.0, externalRH: 87 },
      { month: 'December', externalTemp: 4.9, externalRH: 89 },
    ],
  },
  {
    id: 'birmingham',
    name: 'Birmingham',
    monthlyData: [
      { month: 'January', externalTemp: 4.2, externalRH: 87 },
      { month: 'February', externalTemp: 4.4, externalRH: 84 },
      { month: 'March', externalTemp: 6.6, externalRH: 80 },
      { month: 'April', externalTemp: 9.0, externalRH: 74 },
      { month: 'May', externalTemp: 12.2, externalRH: 72 },
      { month: 'June', externalTemp: 15.1, externalRH: 71 },
      { month: 'July', externalTemp: 17.2, externalRH: 72 },
      { month: 'August', externalTemp: 16.9, externalRH: 74 },
      { month: 'September', externalTemp: 14.2, externalRH: 78 },
      { month: 'October', externalTemp: 10.7, externalRH: 82 },
      { month: 'November', externalTemp: 7.0, externalRH: 86 },
      { month: 'December', externalTemp: 4.6, externalRH: 88 },
    ],
  },
  {
    id: 'leeds',
    name: 'Leeds',
    monthlyData: [
      { month: 'January', externalTemp: 4.0, externalRH: 87 },
      { month: 'February', externalTemp: 4.2, externalRH: 84 },
      { month: 'March', externalTemp: 6.2, externalRH: 81 },
      { month: 'April', externalTemp: 8.5, externalRH: 75 },
      { month: 'May', externalTemp: 11.6, externalRH: 72 },
      { month: 'June', externalTemp: 14.4, externalRH: 72 },
      { month: 'July', externalTemp: 16.5, externalRH: 73 },
      { month: 'August', externalTemp: 16.2, externalRH: 75 },
      { month: 'September', externalTemp: 13.6, externalRH: 79 },
      { month: 'October', externalTemp: 10.2, externalRH: 83 },
      { month: 'November', externalTemp: 6.6, externalRH: 86 },
      { month: 'December', externalTemp: 4.4, externalRH: 88 },
    ],
  },
  {
    id: 'glasgow',
    name: 'Glasgow',
    monthlyData: [
      { month: 'January', externalTemp: 3.9, externalRH: 89 },
      { month: 'February', externalTemp: 4.1, externalRH: 86 },
      { month: 'March', externalTemp: 5.7, externalRH: 83 },
      { month: 'April', externalTemp: 7.9, externalRH: 77 },
      { month: 'May', externalTemp: 10.8, externalRH: 74 },
      { month: 'June', externalTemp: 13.4, externalRH: 74 },
      { month: 'July', externalTemp: 15.2, externalRH: 76 },
      { month: 'August', externalTemp: 14.9, externalRH: 78 },
      { month: 'September', externalTemp: 12.6, externalRH: 81 },
      { month: 'October', externalTemp: 9.5, externalRH: 85 },
      { month: 'November', externalTemp: 6.2, externalRH: 88 },
      { month: 'December', externalTemp: 4.3, externalRH: 89 },
    ],
  },
  {
    id: 'edinburgh',
    name: 'Edinburgh',
    monthlyData: [
      { month: 'January', externalTemp: 3.8, externalRH: 87 },
      { month: 'February', externalTemp: 4.0, externalRH: 84 },
      { month: 'March', externalTemp: 5.6, externalRH: 81 },
      { month: 'April', externalTemp: 7.7, externalRH: 75 },
      { month: 'May', externalTemp: 10.4, externalRH: 72 },
      { month: 'June', externalTemp: 13.1, externalRH: 73 },
      { month: 'July', externalTemp: 14.9, externalRH: 75 },
      { month: 'August', externalTemp: 14.7, externalRH: 77 },
      { month: 'September', externalTemp: 12.5, externalRH: 80 },
      { month: 'October', externalTemp: 9.4, externalRH: 84 },
      { month: 'November', externalTemp: 6.1, externalRH: 86 },
      { month: 'December', externalTemp: 4.2, externalRH: 87 },
    ],
  },
  {
    id: 'bristol',
    name: 'Bristol',
    monthlyData: [
      { month: 'January', externalTemp: 5.1, externalRH: 87 },
      { month: 'February', externalTemp: 5.2, externalRH: 84 },
      { month: 'March', externalTemp: 7.3, externalRH: 80 },
      { month: 'April', externalTemp: 9.6, externalRH: 74 },
      { month: 'May', externalTemp: 12.7, externalRH: 72 },
      { month: 'June', externalTemp: 15.5, externalRH: 71 },
      { month: 'July', externalTemp: 17.6, externalRH: 71 },
      { month: 'August', externalTemp: 17.3, externalRH: 73 },
      { month: 'September', externalTemp: 14.8, externalRH: 77 },
      { month: 'October', externalTemp: 11.5, externalRH: 82 },
      { month: 'November', externalTemp: 7.8, externalRH: 86 },
      { month: 'December', externalTemp: 5.6, externalRH: 88 },
    ],
  },
  {
    id: 'plymouth',
    name: 'Plymouth',
    monthlyData: [
      { month: 'January', externalTemp: 6.3, externalRH: 88 },
      { month: 'February', externalTemp: 6.2, externalRH: 85 },
      { month: 'March', externalTemp: 7.8, externalRH: 82 },
      { month: 'April', externalTemp: 9.6, externalRH: 77 },
      { month: 'May', externalTemp: 12.3, externalRH: 75 },
      { month: 'June', externalTemp: 14.8, externalRH: 75 },
      { month: 'July', externalTemp: 16.6, externalRH: 76 },
      { month: 'August', externalTemp: 16.5, externalRH: 77 },
      { month: 'September', externalTemp: 14.6, externalRH: 80 },
      { month: 'October', externalTemp: 11.8, externalRH: 84 },
      { month: 'November', externalTemp: 8.7, externalRH: 87 },
      { month: 'December', externalTemp: 6.8, externalRH: 88 },
    ],
  },
  {
    id: 'newcastle',
    name: 'Newcastle',
    monthlyData: [
      { month: 'January', externalTemp: 3.8, externalRH: 86 },
      { month: 'February', externalTemp: 4.0, externalRH: 83 },
      { month: 'March', externalTemp: 5.8, externalRH: 80 },
      { month: 'April', externalTemp: 7.9, externalRH: 74 },
      { month: 'May', externalTemp: 10.7, externalRH: 71 },
      { month: 'June', externalTemp: 13.5, externalRH: 72 },
      { month: 'July', externalTemp: 15.5, externalRH: 73 },
      { month: 'August', externalTemp: 15.3, externalRH: 75 },
      { month: 'September', externalTemp: 13.0, externalRH: 79 },
      { month: 'October', externalTemp: 9.8, externalRH: 83 },
      { month: 'November', externalTemp: 6.4, externalRH: 85 },
      { month: 'December', externalTemp: 4.2, externalRH: 87 },
    ],
  },
  {
    id: 'cardiff',
    name: 'Cardiff',
    monthlyData: [
      { month: 'January', externalTemp: 5.0, externalRH: 88 },
      { month: 'February', externalTemp: 5.1, externalRH: 85 },
      { month: 'March', externalTemp: 7.1, externalRH: 81 },
      { month: 'April', externalTemp: 9.3, externalRH: 75 },
      { month: 'May', externalTemp: 12.4, externalRH: 73 },
      { month: 'June', externalTemp: 15.2, externalRH: 73 },
      { month: 'July', externalTemp: 17.2, externalRH: 74 },
      { month: 'August', externalTemp: 16.9, externalRH: 76 },
      { month: 'September', externalTemp: 14.5, externalRH: 79 },
      { month: 'October', externalTemp: 11.2, externalRH: 83 },
      { month: 'November', externalTemp: 7.6, externalRH: 87 },
      { month: 'December', externalTemp: 5.5, externalRH: 89 },
    ],
  },
  {
    id: 'belfast',
    name: 'Belfast',
    monthlyData: [
      { month: 'January', externalTemp: 4.5, externalRH: 89 },
      { month: 'February', externalTemp: 4.6, externalRH: 86 },
      { month: 'March', externalTemp: 6.1, externalRH: 83 },
      { month: 'April', externalTemp: 8.0, externalRH: 77 },
      { month: 'May', externalTemp: 10.8, externalRH: 74 },
      { month: 'June', externalTemp: 13.3, externalRH: 75 },
      { month: 'July', externalTemp: 15.0, externalRH: 77 },
      { month: 'August', externalTemp: 14.8, externalRH: 79 },
      { month: 'September', externalTemp: 12.8, externalRH: 82 },
      { month: 'October', externalTemp: 9.9, externalRH: 85 },
      { month: 'November', externalTemp: 6.7, externalRH: 88 },
      { month: 'December', externalTemp: 4.9, externalRH: 89 },
    ],
  },
  {
    id: 'aberdeen',
    name: 'Aberdeen',
    monthlyData: [
      { month: 'January', externalTemp: 3.4, externalRH: 87 },
      { month: 'February', externalTemp: 3.6, externalRH: 84 },
      { month: 'March', externalTemp: 5.1, externalRH: 81 },
      { month: 'April', externalTemp: 7.1, externalRH: 76 },
      { month: 'May', externalTemp: 9.8, externalRH: 73 },
      { month: 'June', externalTemp: 12.3, externalRH: 74 },
      { month: 'July', externalTemp: 14.2, externalRH: 76 },
      { month: 'August', externalTemp: 14.0, externalRH: 78 },
      { month: 'September', externalTemp: 11.8, externalRH: 81 },
      { month: 'October', externalTemp: 8.8, externalRH: 84 },
      { month: 'November', externalTemp: 5.7, externalRH: 86 },
      { month: 'December', externalTemp: 3.8, externalRH: 87 },
    ],
  },
  {
    id: 'liverpool',
    name: 'Liverpool',
    monthlyData: [
      { month: 'January', externalTemp: 4.8, externalRH: 88 },
      { month: 'February', externalTemp: 4.9, externalRH: 85 },
      { month: 'March', externalTemp: 6.7, externalRH: 82 },
      { month: 'April', externalTemp: 9.0, externalRH: 76 },
      { month: 'May', externalTemp: 12.0, externalRH: 73 },
      { month: 'June', externalTemp: 14.7, externalRH: 73 },
      { month: 'July', externalTemp: 16.7, externalRH: 75 },
      { month: 'August', externalTemp: 16.4, externalRH: 77 },
      { month: 'September', externalTemp: 14.1, externalRH: 80 },
      { month: 'October', externalTemp: 10.8, externalRH: 84 },
      { month: 'November', externalTemp: 7.3, externalRH: 87 },
      { month: 'December', externalTemp: 5.2, externalRH: 89 },
    ],
  },
  {
    id: 'sheffield',
    name: 'Sheffield',
    monthlyData: [
      { month: 'January', externalTemp: 3.9, externalRH: 87 },
      { month: 'February', externalTemp: 4.1, externalRH: 84 },
      { month: 'March', externalTemp: 6.1, externalRH: 81 },
      { month: 'April', externalTemp: 8.4, externalRH: 75 },
      { month: 'May', externalTemp: 11.5, externalRH: 72 },
      { month: 'June', externalTemp: 14.2, externalRH: 72 },
      { month: 'July', externalTemp: 16.3, externalRH: 74 },
      { month: 'August', externalTemp: 16.0, externalRH: 76 },
      { month: 'September', externalTemp: 13.5, externalRH: 79 },
      { month: 'October', externalTemp: 10.1, externalRH: 83 },
      { month: 'November', externalTemp: 6.5, externalRH: 86 },
      { month: 'December', externalTemp: 4.3, externalRH: 88 },
    ],
  },
  {
    id: 'nottingham',
    name: 'Nottingham',
    monthlyData: [
      { month: 'January', externalTemp: 4.0, externalRH: 87 },
      { month: 'February', externalTemp: 4.2, externalRH: 84 },
      { month: 'March', externalTemp: 6.4, externalRH: 80 },
      { month: 'April', externalTemp: 8.8, externalRH: 74 },
      { month: 'May', externalTemp: 11.9, externalRH: 71 },
      { month: 'June', externalTemp: 14.8, externalRH: 71 },
      { month: 'July', externalTemp: 16.9, externalRH: 72 },
      { month: 'August', externalTemp: 16.6, externalRH: 74 },
      { month: 'September', externalTemp: 13.9, externalRH: 78 },
      { month: 'October', externalTemp: 10.5, externalRH: 82 },
      { month: 'November', externalTemp: 6.8, externalRH: 86 },
      { month: 'December', externalTemp: 4.5, externalRH: 88 },
    ],
  },
  {
    id: 'cambridge',
    name: 'Cambridge',
    monthlyData: [
      { month: 'January', externalTemp: 4.3, externalRH: 86 },
      { month: 'February', externalTemp: 4.5, externalRH: 83 },
      { month: 'March', externalTemp: 7.0, externalRH: 79 },
      { month: 'April', externalTemp: 9.5, externalRH: 72 },
      { month: 'May', externalTemp: 12.8, externalRH: 69 },
      { month: 'June', externalTemp: 15.9, externalRH: 68 },
      { month: 'July', externalTemp: 18.2, externalRH: 68 },
      { month: 'August', externalTemp: 17.9, externalRH: 70 },
      { month: 'September', externalTemp: 15.0, externalRH: 75 },
      { month: 'October', externalTemp: 11.4, externalRH: 80 },
      { month: 'November', externalTemp: 7.4, externalRH: 84 },
      { month: 'December', externalTemp: 4.8, externalRH: 86 },
    ],
  },
  {
    id: 'inverness',
    name: 'Inverness',
    monthlyData: [
      { month: 'January', externalTemp: 2.8, externalRH: 88 },
      { month: 'February', externalTemp: 3.1, externalRH: 85 },
      { month: 'March', externalTemp: 4.8, externalRH: 82 },
      { month: 'April', externalTemp: 7.0, externalRH: 77 },
      { month: 'May', externalTemp: 9.9, externalRH: 73 },
      { month: 'June', externalTemp: 12.4, externalRH: 74 },
      { month: 'July', externalTemp: 14.1, externalRH: 77 },
      { month: 'August', externalTemp: 13.8, externalRH: 79 },
      { month: 'September', externalTemp: 11.5, externalRH: 82 },
      { month: 'October', externalTemp: 8.3, externalRH: 85 },
      { month: 'November', externalTemp: 5.1, externalRH: 87 },
      { month: 'December', externalTemp: 3.2, externalRH: 88 },
    ],
  },
];

// List of UK cities for dropdown
export const ukCities = ukCityClimateData.map(city => ({
  id: city.id,
  name: city.name,
}));

// For backwards compatibility - keep the old names but map to city data
export const ukRegions = ukCities;

// Get climate data for a specific city with humidity class-based internal conditions
export const getCityClimateData = (cityId: string, humidityClass: HumidityClass = 3): ClimateData[] => {
  const city = ukCityClimateData.find(c => c.id === cityId);
  if (!city) {
    // Default to London if city not found
    const londonCity = ukCityClimateData.find(c => c.id === 'london')!;
    return generateFullClimateData(londonCity, humidityClass);
  }
  return generateFullClimateData(city, humidityClass);
};

// Generate full climate data with humidity class-based internal conditions
const generateFullClimateData = (city: CityClimateData, humidityClass: HumidityClass): ClimateData[] => {
  const rhValues = humidityClasses[humidityClass].monthlyRH;
  
  return city.monthlyData.map((monthData, index) => {
    // Internal temperature: 20°C in heating season, 22-23°C in summer
    const summerMonths = ['June', 'July', 'August'];
    const transitionMonths = ['May', 'September'];
    let internalTemp: number;
    
    if (summerMonths.includes(monthData.month)) {
      internalTemp = 22;
    } else if (transitionMonths.includes(monthData.month)) {
      internalTemp = 21;
    } else {
      internalTemp = 20;
    }
    
    // Use humidity class-based RH values from the table
    const internalRH = rhValues[index];
    
    return {
      month: monthData.month,
      externalTemp: monthData.externalTemp,
      externalRH: monthData.externalRH,
      internalTemp,
      internalRH,
    };
  });
};

// Backwards compatibility alias
export const getRegionalClimateData = getCityClimateData;

// Default UK climate data (London with Class 3)
export const ukMonthlyClimateData: ClimateData[] = getCityClimateData('london', 3);

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
