import { VehicleSpec, UrgencyLevel, AdditionalServices, PriceConfig } from '../types';

export interface TollCostOptions {
  distance: number;
  vehicleSpec: VehicleSpec;
  tollRatePerKm: number;
  customTollFee?: number;
}

export function calculateTollCost(options: TollCostOptions): number {
  if (options.customTollFee !== undefined) {
    return options.customTollFee;
  }
  const { distance, vehicleSpec, tollRatePerKm } = options;
  return Math.round(distance * tollRatePerKm * vehicleSpec.tollCoefficient * 100) / 100;
}

export interface DriverCostOptions {
  durationHours: number;
  vehicleSpec: VehicleSpec;
  urgency: UrgencyLevel;
  waypointCount: number;
}

export function calculateDriverCost(options: DriverCostOptions): number {
  const { durationHours, vehicleSpec, urgency, waypointCount } = options;
  const dailyWage = vehicleSpec.driverDailyWage;
  const days = Math.ceil(durationHours / 8);
  let cost = days * dailyWage;
  cost += waypointCount * 50;

  if (urgency === UrgencyLevel.URGENT) {
    cost *= 1.2;
  } else if (urgency === UrgencyLevel.EXPRESS) {
    cost *= 1.5;
  }

  return Math.round(cost * 100) / 100;
}

export interface WaitCostOptions {
  additionalServices: AdditionalServices;
  priceConfig: PriceConfig;
}

export function calculateWaitCost(options: WaitCostOptions): {
  loadingWaitCost: number;
  unloadingWaitCost: number;
  loadingAssistanceCost: number;
  unloadingAssistanceCost: number;
} {
  const { additionalServices, priceConfig } = options;
  const { waitHourlyRate, loadingFee, unloadingFee } = priceConfig;

  return {
    loadingWaitCost: Math.round((additionalServices.loadingWaitHours || 0) * waitHourlyRate * 100) / 100,
    unloadingWaitCost: Math.round((additionalServices.unloadingWaitHours || 0) * waitHourlyRate * 100) / 100,
    loadingAssistanceCost: additionalServices.loadingAssistance ? loadingFee : 0,
    unloadingAssistanceCost: additionalServices.unloadingAssistance ? unloadingFee : 0,
  };
}
