export * from './types';

export {
  VEHICLE_SPECS,
  getVehicleSpec,
  recommendVehicle,
  listAvailableVehicles,
  isVehicleSuitable,
} from './modules/vehicle';

export {
  calculateRoute,
  estimateDistance,
  estimateDuration,
  getWaypointCount,
  formatRouteSummary,
  isValidCoordinate,
  getRouteDataQualityLabel,
} from './modules/route';

export {
  calculateFuelCost,
  calculateFuelConsumption,
  estimateFuelPriceByRegion,
} from './modules/fuel';

export {
  calculateTollCost,
  calculateDriverCost,
  calculateWaitCost,
} from './modules/costs';

export {
  calculateReturnEmptyCost,
  calculateSurcharges,
} from './modules/surcharge';

export {
  DEFAULT_SEASONAL_RULES,
  getSeasonalMultiplier,
  getSeasonByType,
  applySeasonalPricing,
} from './modules/seasonal';

export {
  validateOverload,
  validateOverVolume,
  validateRouteRisk,
  runAllRiskChecks,
  getHighestRiskLevel,
} from './modules/risk';

export {
  DEFAULT_PRICE_CONFIG,
  generateQuote,
  formatQuoteDisplay,
  GenerateQuoteOptions,
} from './modules/quote';

export {
  validateQuoteInput,
  throwIfInvalid,
  DEFAULT_VALIDATION_LIMITS,
} from './modules/validation';

export {
  DEFAULT_REGION_FUEL_RULES,
  DEFAULT_LINE_TOLL_RULES,
  DEFAULT_SPECIAL_LINE_RULES,
  resolveRouteRules,
  RuleResolution,
} from './modules/rules';

export {
  runBatchQuote,
  formatBatchTable,
} from './modules/batch';

import { generateQuote, formatQuoteDisplay, DEFAULT_PRICE_CONFIG, GenerateQuoteOptions } from './modules/quote';
import { runBatchQuote, formatBatchTable } from './modules/batch';
import { validateQuoteInput } from './modules/validation';
import { QuoteInput, QuoteResult, PriceConfig, QuoteValidationError, BatchQuoteInput, BatchQuoteComparison } from './types';

export class RoadTransportPricer {
  private config: Partial<PriceConfig>;

  constructor(customConfig?: Partial<PriceConfig>) {
    this.config = customConfig || {};
  }

  quote(input: QuoteInput, options?: GenerateQuoteOptions): QuoteResult {
    return generateQuote(input, this.config, options);
  }

  quoteOrThrow(input: QuoteInput, options?: GenerateQuoteOptions): QuoteResult {
    return generateQuote(input, this.config, { ...options, throwOnInvalid: true });
  }

  validate(input: QuoteInput) {
    return validateQuoteInput(input);
  }

  batch(input: BatchQuoteInput): BatchQuoteComparison {
    return runBatchQuote(input, this.config);
  }

  formatQuote(quote: QuoteResult): string {
    return formatQuoteDisplay(quote);
  }

  formatBatch(comparison: BatchQuoteComparison): string {
    return formatBatchTable(comparison);
  }

  updateConfig(customConfig: Partial<PriceConfig>): void {
    this.config = { ...this.config, ...customConfig };
  }

  getConfig(): Partial<PriceConfig> {
    return { ...this.config };
  }
}

export { QuoteValidationError };
export default RoadTransportPricer;
