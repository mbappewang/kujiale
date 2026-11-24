export interface AustralianCityInfo {
  name: string;
  state: 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'ACT' | 'TAS' | 'NT';
  latitude: number;
  longitude: number;
  utcOffsetHours: number;
}

export const AUSTRALIAN_CITIES: Record<string, AustralianCityInfo> = {
  Sydney: { name: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, utcOffsetHours: 10 },
  Melbourne: { name: 'Melbourne', state: 'VIC', latitude: -37.8136, longitude: 144.9631, utcOffsetHours: 10 },
  Brisbane: { name: 'Brisbane', state: 'QLD', latitude: -27.4705, longitude: 153.026, utcOffsetHours: 10 },
  Perth: { name: 'Perth', state: 'WA', latitude: -31.9505, longitude: 115.8605, utcOffsetHours: 8 },
  Adelaide: { name: 'Adelaide', state: 'SA', latitude: -34.9285, longitude: 138.6007, utcOffsetHours: 9.5 },
  Canberra: { name: 'Canberra', state: 'ACT', latitude: -35.2809, longitude: 149.13, utcOffsetHours: 10 },
  Hobart: { name: 'Hobart', state: 'TAS', latitude: -42.8821, longitude: 147.3272, utcOffsetHours: 10 },
};

export type LengthDisplayUnit = 'm' | 'mm';

export function formatMetres(metres: number, unit: LengthDisplayUnit = 'm'): string {
  if (!Number.isFinite(metres)) return unit === 'mm' ? '0 mm' : '0.00 m';
  if (unit === 'mm') {
    const mm = Math.round(metres * 1000);
    return `${mm.toLocaleString('en-AU')} mm`;
  }
  return `${metres.toFixed(2)} m`;
}

export function formatAreaSqm(areaSqm: number): string {
  if (!Number.isFinite(areaSqm)) return '0.0 m²';
  const rounded = Math.round((areaSqm + Number.EPSILON) * 10) / 10;
  return `${rounded.toFixed(1)} m²`;
}

export function formatCurrencyAUD(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateAU(dateInput: Date | string | number): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  }).format(date);
}
