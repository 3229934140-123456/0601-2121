import { VehicleType, VehicleSpec } from '../types';

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  [VehicleType.VAN_4_2]: {
    type: VehicleType.VAN_4_2,
    name: '4.2米厢式货车',
    maxLoad: 5,
    maxVolume: 18,
    length: 4.2,
    width: 2.1,
    height: 2.1,
    fuelConsumption: 14,
    baseRatePerKm: 3.5,
    tollCoefficient: 1,
    driverDailyWage: 350,
  },
  [VehicleType.TRUCK_6_8]: {
    type: VehicleType.TRUCK_6_8,
    name: '6.8米厢式货车',
    maxLoad: 10,
    maxVolume: 40,
    length: 6.8,
    width: 2.3,
    height: 2.4,
    fuelConsumption: 20,
    baseRatePerKm: 5.5,
    tollCoefficient: 1.5,
    driverDailyWage: 450,
  },
  [VehicleType.TRUCK_9_6]: {
    type: VehicleType.TRUCK_9_6,
    name: '9.6米厢式货车',
    maxLoad: 18,
    maxVolume: 65,
    length: 9.6,
    width: 2.4,
    height: 2.6,
    fuelConsumption: 28,
    baseRatePerKm: 8,
    tollCoefficient: 2,
    driverDailyWage: 550,
  },
  [VehicleType.TRUCK_13_5]: {
    type: VehicleType.TRUCK_13_5,
    name: '13.5米半挂货车',
    maxLoad: 32,
    maxVolume: 95,
    length: 13.5,
    width: 2.4,
    height: 2.8,
    fuelConsumption: 36,
    baseRatePerKm: 11,
    tollCoefficient: 2.8,
    driverDailyWage: 650,
  },
  [VehicleType.TRUCK_17_5]: {
    type: VehicleType.TRUCK_17_5,
    name: '17.5米高低板',
    maxLoad: 35,
    maxVolume: 130,
    length: 17.5,
    width: 2.8,
    height: 3.0,
    fuelConsumption: 42,
    baseRatePerKm: 14,
    tollCoefficient: 3.5,
    driverDailyWage: 750,
  },
};

export function getVehicleSpec(type: VehicleType): VehicleSpec {
  const spec = VEHICLE_SPECS[type];
  if (!spec) {
    throw new Error(`不支持的车型类型: ${type}`);
  }
  return spec;
}

export interface VehicleRecommendationOptions {
  actualLoad: number;
  actualVolume?: number;
}

export function recommendVehicle(options: VehicleRecommendationOptions): VehicleType {
  const { actualLoad, actualVolume } = options;
  const vehicles = Object.values(VEHICLE_SPECS);

  for (const vehicle of vehicles) {
    const loadSatisfied = actualLoad <= vehicle.maxLoad;
    const volumeSatisfied = actualVolume === undefined || actualVolume <= vehicle.maxVolume;
    if (loadSatisfied && volumeSatisfied) {
      return vehicle.type;
    }
  }

  return VehicleType.TRUCK_17_5;
}

export function listAvailableVehicles(): VehicleSpec[] {
  return Object.values(VEHICLE_SPECS);
}

export function isVehicleSuitable(
  type: VehicleType,
  actualLoad: number,
  actualVolume?: number
): boolean {
  const spec = getVehicleSpec(type);
  if (actualLoad > spec.maxLoad) {
    return false;
  }
  if (actualVolume !== undefined && actualVolume > spec.maxVolume) {
    return false;
  }
  return true;
}
