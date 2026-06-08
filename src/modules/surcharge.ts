import { VehicleSpec, UrgencyLevel, AdditionalServices, PriceConfig } from '../types';

export interface ReturnEmptyCostOptions {
  returnEmpty: boolean;
  distance: number;
  vehicleSpec: VehicleSpec;
  fuelPrice: number;
  tollRatePerKm: number;
  returnEmptyRate: number;
}

export function calculateReturnEmptyCost(options: ReturnEmptyCostOptions): number {
  if (!options.returnEmpty) return 0;

  const { distance, vehicleSpec, fuelPrice, tollRatePerKm, returnEmptyRate } = options;
  const baseReturnCost = (distance / 100) * vehicleSpec.fuelConsumption * fuelPrice * 0.6
    + distance * tollRatePerKm * vehicleSpec.tollCoefficient * 0.5
    + distance * vehicleSpec.baseRatePerKm * 0.3;

  return Math.round(baseReturnCost * returnEmptyRate * 100) / 100;
}

export interface SurchargeOptions {
  urgency: UrgencyLevel;
  additionalServices: AdditionalServices;
  totalBaseCost: number;
  priceConfig: PriceConfig;
}

export function calculateSurcharges(options: SurchargeOptions): {
  urgencySurcharge: number;
  insuranceCost: number;
  nightSurcharge: number;
  totalSurcharge: number;
} {
  const { urgency, additionalServices, totalBaseCost, priceConfig } = options;
  let urgencySurcharge = 0;

  if (urgency === UrgencyLevel.URGENT) {
    urgencySurcharge = Math.round(totalBaseCost * 0.15 * 100) / 100;
  } else if (urgency === UrgencyLevel.EXPRESS) {
    urgencySurcharge = Math.round(totalBaseCost * 0.3 * 100) / 100;
  }

  const insuranceCost = additionalServices.insurance
    ? Math.round(totalBaseCost * priceConfig.insuranceRate * 100) / 100
    : 0;

  const nightSurcharge = additionalServices.nightOperation
    ? Math.round(totalBaseCost * priceConfig.nightSurchargeRate * 100) / 100
    : 0;

  const totalSurcharge = Math.round(
    (urgencySurcharge + insuranceCost + nightSurcharge) * 100
  ) / 100;

  return {
    urgencySurcharge,
    insuranceCost,
    nightSurcharge,
    totalSurcharge,
  };
}
