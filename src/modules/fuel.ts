import { VehicleSpec } from '../types';

export interface FuelCostOptions {
  distance: number;
  vehicleSpec: VehicleSpec;
  fuelPrice: number;
  loadFactor?: number;
}

export function calculateFuelCost(options: FuelCostOptions): number {
  const { distance, vehicleSpec, fuelPrice, loadFactor = 1 } = options;
  const adjustedConsumption = vehicleSpec.fuelConsumption * adjustForLoad(loadFactor);
  const fuelLiters = (distance / 100) * adjustedConsumption;
  return Math.round(fuelLiters * fuelPrice * 100) / 100;
}

function adjustForLoad(loadFactor: number): number {
  if (loadFactor <= 0.5) return 0.9;
  if (loadFactor <= 0.7) return 1;
  if (loadFactor <= 0.85) return 1.08;
  if (loadFactor <= 1) return 1.15;
  return 1.25;
}

export function calculateFuelConsumption(
  vehicleSpec: VehicleSpec,
  loadFactor: number = 1
): number {
  return vehicleSpec.fuelConsumption * adjustForLoad(loadFactor);
}

export function estimateFuelPriceByRegion(region?: string): number {
  const basePrices: Record<string, number> = {
    'default': 7.5,
    '北京': 7.7,
    '上海': 7.8,
    '广东': 7.9,
    '四川': 7.6,
    '新疆': 7.4,
    '西藏': 8.2,
  };
  return basePrices[region || 'default'] || basePrices.default;
}
