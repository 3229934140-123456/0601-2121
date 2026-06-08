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

export enum ValidationErrorCode {
  NEGATIVE_VALUE = 'NEGATIVE_VALUE',
  ZERO_DISTANCE = 'ZERO_DISTANCE',
  EMPTY_CITY = 'EMPTY_CITY',
  EXCEED_LIMIT = 'EXCEED_LIMIT',
  INVALID_COORDINATE = 'INVALID_COORDINATE',
  MISSING_REQUIRED = 'MISSING_REQUIRED',
}

export enum RouteDataQuality {
  FULL_COORDINATES = 'full_coordinates',
  PARTIAL_COORDINATES = 'partial_coordinates',
  CITY_ONLY = 'city_only',
  CUSTOM_DISTANCE = 'custom_distance',
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

export interface RouteSegment {
  index: number;
  from: RoutePoint;
  to: RoutePoint;
  distance: number;
  estimatedDuration: number;
  distanceSource: 'coordinate' | 'city_estimate' | 'fallback';
  remark?: string;
  subtotal?: {
    baseKmCost: number;
    fuelCost: number;
    tollCost: number;
    driverCost: number;
    total: number;
  };
}

export interface RouteInfo {
  origin: RoutePoint;
  destination: RoutePoint;
  waypoints?: RoutePoint[];
  distance: number;
  estimatedDuration: number;
  waypointCount: number;
  segments: RouteSegment[];
  dataQuality: RouteDataQuality;
  degradationNotes: string[];
}

export interface AdditionalServices {
  loadingAssistance?: boolean;
  unloadingAssistance?: boolean;
  loadingWaitHours?: number;
  unloadingWaitHours?: number;
  returnEmpty?: boolean;
  insurance?: boolean;
  nightOperation?: boolean;
  coldChain?: boolean;
  dangerousCargo?: boolean;
  mountainRoute?: boolean;
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

export interface RegionFuelRule {
  province: string;
  fuelPrice: number;
  remark?: string;
}

export interface LineTollRule {
  key: string;
  fromCity: string;
  toCity: string;
  tollCoefficient: number;
  remark?: string;
}

export interface SpecialLineRule {
  key: string;
  type: 'mountain' | 'cold_chain' | 'dangerous_cargo' | 'custom';
  name: string;
  rateMultiplier: number;
  appliesTo?: {
    provinces?: string[];
    cities?: string[];
  };
  remark?: string;
}

export interface RouteRules {
  regionFuelRules?: RegionFuelRule[];
  lineTollRules?: LineTollRule[];
  specialLineRules?: SpecialLineRule[];
}

export interface AppliedRuleRecord {
  key: string;
  name: string;
  type: 'seasonal' | 'region_fuel' | 'line_toll' | 'special_line' | 'urgency' | 'custom';
  effect: string;
  amount?: number;
  multiplier?: number;
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
  rules?: RouteRules;
}

export interface ValidationError {
  code: ValidationErrorCode;
  field: string;
  message: string;
  value?: unknown;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class QuoteValidationError extends Error {
  readonly errors: ValidationError[];
  readonly warnings: ValidationError[];
  constructor(result: ValidationResult) {
    super(`报价参数校验失败，共 ${result.errors.length} 个错误`);
    this.name = 'QuoteValidationError';
    this.errors = result.errors;
    this.warnings = result.warnings;
  }
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

export interface DetailedConfirmation {
  totalPrice: number;
  includedServices: string[];
  excludedCosts: string[];
  validUntil: string;
  validHours: number;
  overloadWarnings: string[];
  priceAdjustmentConditions: string[];
  remarks: string[];
  plainText: string;
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
  appliedRules: AppliedRuleRecord[];
  summary: string;
  confirmationBrief: string;
  detailedConfirmation: DetailedConfirmation;
  validUntil: string;
}

export interface SeasonalRule {
  name: string;
  months: number[];
  type: SeasonType;
  rateMultiplier: number;
}

export interface BatchQuoteVariant {
  id?: string;
  vehicleType?: VehicleType;
  season?: SeasonType;
  urgency?: UrgencyLevel;
  additionalServices?: AdditionalServices;
  rules?: RouteRules;
}

export interface BatchQuoteInput {
  base: Omit<QuoteInput, 'vehicleType' | 'season' | 'urgency' | 'additionalServices' | 'rules'> & {
    vehicleType?: VehicleType;
    season?: SeasonType;
    urgency?: UrgencyLevel;
    additionalServices?: AdditionalServices;
    rules?: RouteRules;
  };
  variants: BatchQuoteVariant[];
  globalConfig?: Partial<PriceConfig>;
  failFast?: boolean;
}

export interface BatchQuoteResultItem {
  variantId: string;
  variant: BatchQuoteVariant;
  success: boolean;
  quote?: QuoteResult;
  errors?: ValidationError[];
  rank?: {
    byPrice: number;
    byRisk: number;
  };
}

export interface BatchQuoteComparison {
  cheapestId: string;
  lowestRiskId: string;
  items: BatchQuoteResultItem[];
  summary: string;
}
