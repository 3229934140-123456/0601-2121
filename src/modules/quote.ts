import {
  QuoteInput,
  QuoteResult,
  CostBreakdownItem,
  PriceConfig,
  PriceRange,
  UrgencyLevel,
  SeasonType,
  RiskWarning,
  VehicleSpec,
  RouteInfo,
  AdditionalServices,
} from '../types';

import { getVehicleSpec } from './vehicle';
import { calculateRoute, formatRouteSummary } from './route';
import { calculateFuelCost } from './fuel';
import { calculateTollCost, calculateDriverCost, calculateWaitCost } from './costs';
import { calculateReturnEmptyCost, calculateSurcharges } from './surcharge';
import { applySeasonalPricing, getSeasonalMultiplier, getSeasonByType } from './seasonal';
import { runAllRiskChecks } from './risk';

export const DEFAULT_PRICE_CONFIG: PriceConfig = {
  fuelPrice: 7.5,
  tollRatePerKm: 1.2,
  waitHourlyRate: 80,
  loadingFee: 200,
  unloadingFee: 200,
  insuranceRate: 0.005,
  nightSurchargeRate: 0.1,
  returnEmptyRate: 0.7,
  grossProfitMargin: 0.15,
};

export function generateQuote(
  input: QuoteInput,
  customConfig?: Partial<PriceConfig>
): QuoteResult {
  const config: PriceConfig = { ...DEFAULT_PRICE_CONFIG, ...customConfig };
  const vehicleSpec: VehicleSpec = getVehicleSpec(input.vehicleType);
  const additionalServices: AdditionalServices = input.additionalServices || {};
  const urgency: UrgencyLevel = input.urgency || UrgencyLevel.NORMAL;

  const route: RouteInfo = calculateRoute(
    input.origin,
    input.destination,
    input.waypoints,
    input.distance
  );

  const loadFactor = Math.min(input.actualLoad / vehicleSpec.maxLoad, 1.5);

  const fuelCost = calculateFuelCost({
    distance: route.distance,
    vehicleSpec,
    fuelPrice: config.fuelPrice,
    loadFactor,
  });

  const tollCost = calculateTollCost({
    distance: route.distance,
    vehicleSpec,
    tollRatePerKm: config.tollRatePerKm,
    customTollFee: input.customTollFee,
  });

  const driverCost = calculateDriverCost({
    durationHours: route.estimatedDuration,
    vehicleSpec,
    urgency,
    waypointCount: route.waypointCount,
  });

  const waitCosts = calculateWaitCost({
    additionalServices,
    priceConfig: config,
  });

  const returnEmptyCost = calculateReturnEmptyCost({
    returnEmpty: !!additionalServices.returnEmpty,
    distance: route.distance,
    vehicleSpec,
    fuelPrice: config.fuelPrice,
    tollRatePerKm: config.tollRatePerKm,
    returnEmptyRate: config.returnEmptyRate,
  });

  const baseKmCost = Math.round(route.distance * vehicleSpec.baseRatePerKm * 100) / 100;

  const baseCost = Math.round(
    (baseKmCost + fuelCost + tollCost + driverCost +
      waitCosts.loadingWaitCost + waitCosts.unloadingWaitCost +
      waitCosts.loadingAssistanceCost + waitCosts.unloadingAssistanceCost +
      returnEmptyCost) * 100
  ) / 100;

  const surcharges = calculateSurcharges({
    urgency,
    additionalServices,
    totalBaseCost: baseCost,
    priceConfig: config,
  });

  const subtotal = Math.round(
    (baseCost + surcharges.totalSurcharge) * 100
  ) / 100;

  const seasonKey = input.season || input.transportDate || new Date();
  const seasonalResult = applySeasonalPricing(subtotal, seasonKey);

  const totalCost = seasonalResult.adjustedAmount;

  const priceRange: PriceRange = calculatePriceRange(totalCost, config.grossProfitMargin);

  const grossProfit = Math.round(
    (priceRange.recommended - totalCost) * 100
  ) / 100;

  const grossProfitRate = Math.round(
    (grossProfit / priceRange.recommended) * 10000
  ) / 100;

  const risks: RiskWarning[] = runAllRiskChecks({
    vehicleType: input.vehicleType,
    actualLoad: input.actualLoad,
    actualVolume: input.actualVolume,
    distance: route.distance,
    waypointCount: route.waypointCount,
  });

  const costBreakdown: CostBreakdownItem[] = buildCostBreakdown({
    route,
    vehicleSpec,
    fuelCost,
    tollCost,
    driverCost,
    waitCosts,
    returnEmptyCost,
    baseKmCost,
    surcharges,
    seasonalResult,
    additionalServices,
    urgency,
  });

  const routeSummary = formatRouteSummary(route);
  const summary = buildSummary(
    routeSummary,
    vehicleSpec,
    totalCost,
    priceRange.recommended,
    grossProfitRate,
    seasonalResult.seasonInfo.name
  );

  const confirmationBrief = buildConfirmationBrief(
    routeSummary,
    vehicleSpec,
    priceRange.recommended,
    route.distance,
    additionalServices
  );

  const validUntil = generateValidUntil();

  return {
    vehicleSpec,
    route,
    costBreakdown,
    totalCost,
    priceRange,
    grossProfit,
    grossProfitRate,
    risks,
    summary,
    confirmationBrief,
    validUntil,
  };
}

function buildCostBreakdown(params: {
  route: RouteInfo;
  vehicleSpec: VehicleSpec;
  fuelCost: number;
  tollCost: number;
  driverCost: number;
  waitCosts: ReturnType<typeof calculateWaitCost>;
  returnEmptyCost: number;
  baseKmCost: number;
  surcharges: ReturnType<typeof calculateSurcharges>;
  seasonalResult: ReturnType<typeof applySeasonalPricing>;
  additionalServices: AdditionalServices;
  urgency: UrgencyLevel;
}): CostBreakdownItem[] {
  const {
    route,
    vehicleSpec,
    fuelCost,
    tollCost,
    driverCost,
    waitCosts,
    returnEmptyCost,
    baseKmCost,
    surcharges,
    seasonalResult,
  } = params;

  const items: CostBreakdownItem[] = [];

  items.push({
    key: 'base_km',
    name: '基础运费',
    amount: baseKmCost,
    unit: '元/公里',
    quantity: route.distance,
    remark: `${vehicleSpec.name} × ${route.distance}公里`,
  });

  items.push({
    key: 'fuel',
    name: '燃油费',
    amount: fuelCost,
    remark: `百公里油耗约${vehicleSpec.fuelConsumption}L`,
  });

  items.push({
    key: 'toll',
    name: '过路费',
    amount: tollCost,
    unit: '元/公里',
    quantity: route.distance,
  });

  items.push({
    key: 'driver',
    name: '司机费用',
    amount: driverCost,
    remark: `预计时长${route.estimatedDuration}小时`,
  });

  if (waitCosts.loadingWaitCost > 0) {
    items.push({
      key: 'loading_wait',
      name: '装货等待费',
      amount: waitCosts.loadingWaitCost,
      unit: '元/小时',
      quantity: params.additionalServices.loadingWaitHours,
    });
  }

  if (waitCosts.unloadingWaitCost > 0) {
    items.push({
      key: 'unloading_wait',
      name: '卸货等待费',
      amount: waitCosts.unloadingWaitCost,
      unit: '元/小时',
      quantity: params.additionalServices.unloadingWaitHours,
    });
  }

  if (waitCosts.loadingAssistanceCost > 0) {
    items.push({
      key: 'loading_assistance',
      name: '装卸协助-装货',
      amount: waitCosts.loadingAssistanceCost,
    });
  }

  if (waitCosts.unloadingAssistanceCost > 0) {
    items.push({
      key: 'unloading_assistance',
      name: '装卸协助-卸货',
      amount: waitCosts.unloadingAssistanceCost,
    });
  }

  if (returnEmptyCost > 0) {
    items.push({
      key: 'return_empty',
      name: '返程空驶费',
      amount: returnEmptyCost,
      remark: `按里程${route.distance}公里的空驶成本计算`,
    });
  }

  if (surcharges.urgencySurcharge > 0) {
    items.push({
      key: 'urgency',
      name: '时效加急费',
      amount: surcharges.urgencySurcharge,
      remark: params.urgency === UrgencyLevel.EXPRESS ? '特快加急' : '加急运输',
    });
  }

  if (surcharges.insuranceCost > 0) {
    items.push({
      key: 'insurance',
      name: '货物保险费',
      amount: surcharges.insuranceCost,
    });
  }

  if (surcharges.nightSurcharge > 0) {
    items.push({
      key: 'night',
      name: '夜间作业费',
      amount: surcharges.nightSurcharge,
    });
  }

  if (seasonalResult.seasonInfo.multiplier !== 1) {
    const seasonalAdjustment = Math.round(
      (seasonalResult.adjustedAmount - (baseKmCost + fuelCost + tollCost + driverCost +
        waitCosts.loadingWaitCost + waitCosts.unloadingWaitCost +
        waitCosts.loadingAssistanceCost + waitCosts.unloadingAssistanceCost +
        returnEmptyCost + surcharges.totalSurcharge)) * 100
    ) / 100;

    items.push({
      key: 'seasonal',
      name: `${seasonalResult.seasonInfo.name}调价`,
      amount: seasonalAdjustment,
      remark: `系数 ×${seasonalResult.seasonInfo.multiplier}`,
    });
  }

  return items;
}

function calculatePriceRange(totalCost: number, margin: number): PriceRange {
  const base = totalCost / (1 - margin);
  return {
    min: Math.round(base * 0.95 * 100) / 100,
    recommended: Math.round(base * 100) / 100,
    max: Math.round(base * 1.1 * 100) / 100,
  };
}

function buildSummary(
  routeSummary: string,
  vehicleSpec: VehicleSpec,
  totalCost: number,
  recommendedPrice: number,
  profitRate: number,
  seasonName: string
): string {
  return (
    `运输报价：${routeSummary} | 车型：${vehicleSpec.name} | ` +
    `成本：¥${totalCost.toFixed(2)} | 建议报价：¥${recommendedPrice.toFixed(2)} | ` +
    `预计毛利率：${profitRate}% | ${seasonName}`
  );
}

function buildConfirmationBrief(
  routeSummary: string,
  vehicleSpec: VehicleSpec,
  price: number,
  distance: number,
  services: AdditionalServices
): string {
  const extras: string[] = [];
  if (services.returnEmpty) extras.push('含返程空驶');
  if (services.insurance) extras.push('含货物保险');
  if (services.loadingAssistance) extras.push('含装货协助');
  if (services.unloadingAssistance) extras.push('含卸货协助');
  const extraStr = extras.length > 0 ? '（' + extras.join('、') + '）' : '';

  return (
    `【运输报价确认】${routeSummary}，使用${vehicleSpec.name}，` +
    `全程约${distance}公里，报价¥${price.toFixed(2)}${extraStr}，` +
    `报价有效期24小时，具体以最终签约为准。`
  );
}

function generateValidUntil(): string {
  const now = new Date();
  now.setHours(now.getHours() + 24);
  return now.toISOString();
}

export function formatQuoteDisplay(quote: QuoteResult): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════');
  lines.push('        公路运输报价明细单');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`路线：${formatRouteSummary(quote.route)}`);
  lines.push(`车型：${quote.vehicleSpec.name}（限重${quote.vehicleSpec.maxLoad}吨/${quote.vehicleSpec.maxVolume}m³）`);
  lines.push(`里程：${quote.route.distance}公里 | 预计时长：${quote.route.estimatedDuration}小时`);
  lines.push('');
  lines.push('────────────── 费用明细 ──────────────');

  for (const item of quote.costBreakdown) {
    const qtyStr = item.quantity ? ` × ${item.quantity}${item.unit || ''}` : '';
    const remarkStr = item.remark ? `（${item.remark}）` : '';
    lines.push(`  ${item.name.padEnd(18)}${qtyStr.padEnd(14)}¥${item.amount.toFixed(2).padStart(10)}${remarkStr}`);
  }

  lines.push('');
  lines.push('───────────────────────────────────────');
  lines.push(`  成本合计${' '.repeat(26)}¥${quote.totalCost.toFixed(2).padStart(10)}`);
  lines.push('');
  lines.push('────────────── 报价区间 ──────────────');
  lines.push(`  保守报价${' '.repeat(26)}¥${quote.priceRange.min.toFixed(2).padStart(10)}`);
  lines.push(`  推荐报价${' '.repeat(26)}¥${quote.priceRange.recommended.toFixed(2).padStart(10)}`);
  lines.push(`  理想报价${' '.repeat(26)}¥${quote.priceRange.max.toFixed(2).padStart(10)}`);
  lines.push('');
  lines.push(`  预计毛利：¥${quote.grossProfit.toFixed(2)}（${quote.grossProfitRate}%）`);
  lines.push('');

  if (quote.risks.length > 0) {
    lines.push('────────────── 风险提示 ──────────────');
    for (const risk of quote.risks) {
      const icon = risk.level === 'critical' ? '🔴' : risk.level === 'high' ? '🟠' : risk.level === 'medium' ? '🟡' : '🟢';
      lines.push(`  ${icon} ${risk.message}`);
      if (risk.suggestion) {
        lines.push(`     💡 ${risk.suggestion}`);
      }
    }
    lines.push('');
  }

  lines.push('───────────────────────────────────────');
  lines.push(`报价有效期至：${new Date(quote.validUntil).toLocaleString()}`);
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}
