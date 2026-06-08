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
} from './modules/quote';

import { generateQuote, formatQuoteDisplay } from './modules/quote';
import { QuoteInput, QuoteResult, PriceConfig } from './types';

export class RoadTransportPricer {
  private config: Partial<PriceConfig>;

  constructor(customConfig?: Partial<PriceConfig>) {
    this.config = customConfig || {};
  }

  quote(input: QuoteInput): QuoteResult {
    return generateQuote(input, this.config);
  }

  formatQuote(quote: QuoteResult): string {
    return formatQuoteDisplay(quote);
  }

  updateConfig(customConfig: Partial<PriceConfig>): void {
    this.config = { ...this.config, ...customConfig };
  }

  getConfig(): Partial<PriceConfig> {
    return { ...this.config };
  }
}

export default RoadTransportPricer;
