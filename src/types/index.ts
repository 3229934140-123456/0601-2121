export enum VehicleType {
  VAN_4_2 = 'van_4_2',
  TRUCK_6_8 = 'truck_6_8',
  TRUCK_9_6 = 'truck_9_6',
  TRUCK_13_5 = 'truck_13_5',
  TRUCK_17_5 = 'truck_17_5',
}

export enum SeasonType {
  PEAK = 'peak',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum UrgencyLevel {
  NORMAL = 'normal',
  URGENT = 'urgent',
  EXPRESS = 'express',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface VehicleSpec {
  type: VehicleType;
  name: string;
  maxLoad: number;
  maxVolume: number;
  length: number;
  width: number;
  height: number;
  fuelConsumption: number;
  baseRatePerKm: number;
  tollCoefficient: number;
  driverDailyWage: number;
}

export interface RoutePoint {
  city: string;
  address?: string;
  lng?: number;
  lat?: number;
}

export interface RouteInfo {
  origin: RoutePoint;
  destination: RoutePoint;
  waypoints?: RoutePoint[];
  distance: number;
  estimatedDuration: number;
  waypointCount: number;
}

export interface AdditionalServices {
  loadingAssistance?: boolean;
  unloadingAssistance?: boolean;
  loadingWaitHours?: number;
  unloadingWaitHours?: number;
  returnEmpty?: boolean;
  insurance?: boolean;
  nightOperation?: boolean;
}

export interface PriceConfig {
  fuelPrice: number;
  tollRatePerKm: number;
  waitHourlyRate: number;
  loadingFee: number;
  unloadingFee: number;
  insuranceRate: number;
  nightSurchargeRate: number;
  returnEmptyRate: number;
  grossProfitMargin: number;
}

export interface QuoteInput {
  origin: RoutePoint;
  destination: RoutePoint;
  waypoints?: RoutePoint[];
  vehicleType: VehicleType;
  actualLoad: number;
  actualVolume?: number;
  urgency?: UrgencyLevel;
  distance?: number;
  season?: SeasonType;
  additionalServices?: AdditionalServices;
  customTollFee?: number;
  transportDate?: string;
}

export interface CostBreakdownItem {
  key: string;
  name: string;
  amount: number;
  unit?: string;
  quantity?: number;
  remark?: string;
}

export interface RiskWarning {
  level: RiskLevel;
  code: string;
  message: string;
  suggestion?: string;
}

export interface PriceRange {
  min: number;
  max: number;
  recommended: number;
}

export interface QuoteResult {
  vehicleSpec: VehicleSpec;
  route: RouteInfo;
  costBreakdown: CostBreakdownItem[];
  totalCost: number;
  priceRange: PriceRange;
  grossProfit: number;
  grossProfitRate: number;
  risks: RiskWarning[];
  summary: string;
  confirmationBrief: string;
  validUntil: string;
}

export interface SeasonalRule {
  name: string;
  months: number[];
  type: SeasonType;
  rateMultiplier: number;
}
