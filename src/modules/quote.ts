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
  RouteSegment,
  AdditionalServices,
  AppliedRuleRecord,
  DetailedConfirmation,
  RiskLevel,
  QuoteValidationError,
} from '../types';

import { getVehicleSpec, VEHICLE_SPECS } from './vehicle';
import { calculateRoute, formatRouteSummary, getRouteDataQualityLabel, estimateDuration } from './route';
import { calculateFuelCost } from './fuel';
import { calculateTollCost, calculateDriverCost, calculateWaitCost } from './costs';
import { calculateReturnEmptyCost, calculateSurcharges } from './surcharge';
import { applySeasonalPricing, getSeasonByType } from './seasonal';
import { runAllRiskChecks } from './risk';
import { validateQuoteInput, throwIfInvalid } from './validation';
import { resolveRouteRules } from './rules';

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

export interface GenerateQuoteOptions {
  validateInput?: boolean;
  throwOnInvalid?: boolean;
}

export function generateQuote(
  input: QuoteInput,
  customConfig?: Partial<PriceConfig>,
  options: GenerateQuoteOptions = {}
): QuoteResult {
  const { validateInput: shouldValidate = true, throwOnInvalid = false } = options;

  if (shouldValidate) {
    const validationResult = validateQuoteInput(input);
    if (!validationResult.valid && throwOnInvalid) {
      throw new QuoteValidationError(validationResult);
    }
  }

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

  const allPoints = [input.origin, ...(input.waypoints || []), input.destination];
  const ruleResolution = resolveRouteRules(
    allPoints,
    vehicleSpec,
    config.fuelPrice,
    vehicleSpec.tollCoefficient,
    input.rules,
    additionalServices
  );

  const appliedRules: AppliedRuleRecord[] = [...ruleResolution.appliedRules];

  const loadFactor = Math.min(input.actualLoad / vehicleSpec.maxLoad, 1.5);

  const fuelCost = calculateFuelCost({
    distance: route.distance,
    vehicleSpec,
    fuelPrice: ruleResolution.effectiveFuelPrice,
    loadFactor,
  });

  const tollCost = calculateTollCost({
    distance: route.distance,
    vehicleSpec: { ...vehicleSpec, tollCoefficient: ruleResolution.effectiveTollCoefficient },
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
    fuelPrice: ruleResolution.effectiveFuelPrice,
    tollRatePerKm: config.tollRatePerKm,
    returnEmptyRate: config.returnEmptyRate,
  });

  const baseKmCostRaw = route.distance * vehicleSpec.baseRatePerKm * ruleResolution.specialMultiplier;
  const baseKmCost = Math.round(baseKmCostRaw * 100) / 100;

  populateSegmentSubtotals(
    route.segments,
    vehicleSpec,
    ruleResolution.effectiveFuelPrice,
    ruleResolution.effectiveTollCoefficient,
    config.tollRatePerKm,
    ruleResolution.specialMultiplier,
    loadFactor,
    urgency
  );

  if (ruleResolution.specialMultiplier !== 1) {
    appliedRules.push({
      key: 'special_lines_combined',
      name: '特殊线路综合附加系数',
      type: 'special_line',
      effect: `基础运费系数 ×${ruleResolution.specialMultiplier}`,
      multiplier: ruleResolution.specialMultiplier,
    });
  }

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

  if (surcharges.urgencySurcharge > 0) {
    appliedRules.push({
      key: `urgency_${urgency}`,
      name: urgency === UrgencyLevel.EXPRESS ? '特快加急加价' : '加急加价',
      type: 'urgency',
      effect: `基础费用 ×${urgency === UrgencyLevel.EXPRESS ? 0.3 : 0.15}`,
      amount: surcharges.urgencySurcharge,
    });
  }

  const subtotal = Math.round(
    (baseCost + surcharges.totalSurcharge) * 100
  ) / 100;

  const seasonKey = input.season || input.transportDate || new Date();
  const seasonalResult = applySeasonalPricing(subtotal, seasonKey);
  if (seasonalResult.seasonInfo.multiplier !== 1) {
    appliedRules.push({
      key: `season_${seasonalResult.seasonInfo.name}`,
      name: seasonalResult.seasonInfo.name,
      type: 'seasonal',
      effect: `总价 ×${seasonalResult.seasonInfo.multiplier}`,
      multiplier: seasonalResult.seasonInfo.multiplier,
    });
  }

  const totalCost = seasonalResult.adjustedAmount;
  const priceRange: PriceRange = calculatePriceRange(totalCost, config.grossProfitMargin);
  const grossProfit = Math.round((priceRange.recommended - totalCost) * 100) / 100;
  const grossProfitRate = Math.round((grossProfit / priceRange.recommended) * 10000) / 100;

  const risks: RiskWarning[] = runAllRiskChecks({
    vehicleType: input.vehicleType,
    actualLoad: input.actualLoad,
    actualVolume: input.actualVolume,
    distance: route.distance,
    waypointCount: route.waypointCount,
  });

  if (route.degradationNotes.length > 0) {
    risks.unshift({
      level: route.dataQuality === 'full_coordinates' ? RiskLevel.LOW : RiskLevel.MEDIUM,
      code: 'ROUTE_DATA_DEGRADED',
      message: `路线数据质量：${getRouteDataQualityLabel(route.dataQuality)}`,
      suggestion: route.degradationNotes.join('；'),
    });
  }

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
    effectiveFuelPrice: ruleResolution.effectiveFuelPrice,
    baseFuelPrice: config.fuelPrice,
    effectiveTollCoefficient: ruleResolution.effectiveTollCoefficient,
    baseTollCoefficient: vehicleSpec.tollCoefficient,
    specialMultiplier: ruleResolution.specialMultiplier,
  });

  const routeSummary = formatRouteSummary(route);
  const summary = buildSummary(
    routeSummary,
    vehicleSpec,
    totalCost,
    priceRange.recommended,
    grossProfitRate,
    seasonalResult.seasonInfo.name,
    appliedRules
  );

  const confirmationBrief = buildConfirmationBrief(
    routeSummary,
    vehicleSpec,
    priceRange.recommended,
    route.distance,
    additionalServices
  );

  const detailedConfirmation = buildDetailedConfirmation(
    routeSummary,
    vehicleSpec,
    priceRange.recommended,
    route,
    additionalServices,
    risks,
    appliedRules
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
    appliedRules,
    summary,
    confirmationBrief,
    detailedConfirmation,
    validUntil,
  };
}

function populateSegmentSubtotals(
  segments: RouteSegment[],
  vehicleSpec: VehicleSpec,
  fuelPrice: number,
  tollCoefficient: number,
  tollRatePerKm: number,
  specialMultiplier: number,
  loadFactor: number,
  urgency: UrgencyLevel
): void {
  for (const seg of segments) {
    const baseKmCost = Math.round(seg.distance * vehicleSpec.baseRatePerKm * specialMultiplier * 100) / 100;
    const fuelCost = calculateFuelCost({
      distance: seg.distance,
      vehicleSpec,
      fuelPrice,
      loadFactor,
    });
    const tollCost = calculateTollCost({
      distance: seg.distance,
      vehicleSpec: { ...vehicleSpec, tollCoefficient },
      tollRatePerKm,
    });
    const driverHourly = (vehicleSpec.driverDailyWage / 8) * (urgency === UrgencyLevel.URGENT ? 1.2 : urgency === UrgencyLevel.EXPRESS ? 1.5 : 1);
    const driverCost = Math.round(seg.estimatedDuration * driverHourly * 100) / 100;
    seg.subtotal = {
      baseKmCost,
      fuelCost,
      tollCost,
      driverCost,
      total: Math.round((baseKmCost + fuelCost + tollCost + driverCost) * 100) / 100,
    };
  }
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
  effectiveFuelPrice: number;
  baseFuelPrice: number;
  effectiveTollCoefficient: number;
  baseTollCoefficient: number;
  specialMultiplier: number;
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
    effectiveFuelPrice,
    baseFuelPrice,
    effectiveTollCoefficient,
    baseTollCoefficient,
    specialMultiplier,
  } = params;

  const items: CostBreakdownItem[] = [];

  if (route.segments.length > 1) {
    items.push({
      key: 'segments_header',
      name: '── 分段小计 ──',
      amount: 0,
      remark: `${route.segments.length} 段路线明细`,
    });
    for (const seg of route.segments) {
      const label = `第${seg.index + 1}段 ${seg.from.city || '未知'}→${seg.to.city || '未知'}`;
      items.push({
        key: `segment_${seg.index}`,
        name: label,
        amount: seg.subtotal?.total || 0,
        unit: '公里',
        quantity: seg.distance,
        remark: `油¥${seg.subtotal?.fuelCost.toFixed(2)} + 过¥${seg.subtotal?.tollCost.toFixed(2)} + 司机¥${seg.subtotal?.driverCost.toFixed(2)}`,
      });
    }
    items.push({ key: 'segments_spacer', name: '', amount: 0 });
  }

  let baseRemark = `${vehicleSpec.name} × ${route.distance}公里`;
  if (specialMultiplier !== 1) {
    baseRemark += ` × 特殊系数${specialMultiplier}`;
  }
  items.push({
    key: 'base_km',
    name: '基础运费',
    amount: baseKmCost,
    unit: '元/公里',
    quantity: route.distance,
    remark: baseRemark,
  });

  const fuelRemark = effectiveFuelPrice !== baseFuelPrice
    ? `油价¥${effectiveFuelPrice}/L（基准¥${baseFuelPrice}），百公里油耗约${vehicleSpec.fuelConsumption}L`
    : `百公里油耗约${vehicleSpec.fuelConsumption}L`;
  items.push({
    key: 'fuel',
    name: '燃油费',
    amount: fuelCost,
    remark: fuelRemark,
  });

  const tollRemark = effectiveTollCoefficient !== baseTollCoefficient
    ? `车型系数 ×${effectiveTollCoefficient.toFixed(2)}（基准 ×${baseTollCoefficient}）`
    : `车型系数 ×${effectiveTollCoefficient}`;
  items.push({
    key: 'toll',
    name: '过路费',
    amount: tollCost,
    unit: '元/公里',
    quantity: route.distance,
    remark: tollRemark,
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
    items.push({ key: 'loading_assistance', name: '装卸协助-装货', amount: waitCosts.loadingAssistanceCost });
  }
  if (waitCosts.unloadingAssistanceCost > 0) {
    items.push({ key: 'unloading_assistance', name: '装卸协助-卸货', amount: waitCosts.unloadingAssistanceCost });
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
    items.push({ key: 'insurance', name: '货物保险费', amount: surcharges.insuranceCost });
  }
  if (surcharges.nightSurcharge > 0) {
    items.push({ key: 'night', name: '夜间作业费', amount: surcharges.nightSurcharge });
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
  seasonName: string,
  appliedRules: AppliedRuleRecord[]
): string {
  const ruleTags = appliedRules.length > 0 ? ` | 规则：${appliedRules.map(r => r.name).join('、')}` : '';
  return (
    `运输报价：${routeSummary} | 车型：${vehicleSpec.name} | ` +
    `成本：¥${totalCost.toFixed(2)} | 建议报价：¥${recommendedPrice.toFixed(2)} | ` +
    `预计毛利率：${profitRate}% | ${seasonName}${ruleTags}`
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

function buildDetailedConfirmation(
  routeSummary: string,
  vehicleSpec: VehicleSpec,
  price: number,
  route: RouteInfo,
  services: AdditionalServices,
  risks: RiskWarning[],
  appliedRules: AppliedRuleRecord[]
): DetailedConfirmation {
  const includedServices: string[] = [
    `${vehicleSpec.name} 车辆运输（限重${vehicleSpec.maxLoad}吨/${vehicleSpec.maxVolume}m³）`,
    `全程 ${route.distance} 公里运输，约 ${route.estimatedDuration} 小时`,
    '标准燃油费、过路费、司机费用',
  ];
  if (services.returnEmpty) includedServices.push('返程空驶补偿');
  if (services.insurance) includedServices.push('货物运输保险');
  if (services.loadingAssistance) includedServices.push('装货协助服务');
  if (services.unloadingAssistance) includedServices.push('卸货协助服务');
  if (services.loadingWaitHours && services.loadingWaitHours > 0) {
    includedServices.push(`装货等待 ${services.loadingWaitHours} 小时`);
  }
  if (services.unloadingWaitHours && services.unloadingWaitHours > 0) {
    includedServices.push(`卸货等待 ${services.unloadingWaitHours} 小时`);
  }
  if (services.coldChain) includedServices.push('冷链温控运输');
  if (services.dangerousCargo) includedServices.push('危险品资质运输');
  if (services.nightOperation) includedServices.push('夜间作业许可');

  const excludedCosts: string[] = [
    '货物实际重量超过申报导致的超载罚款',
    '因客户原因额外增加的装卸点或改道费用',
    '不可抗力（天气、交通管制）导致的额外费用',
    '未声明的特殊货物（易碎、贵重、生鲜）附加费',
  ];
  if (!services.insurance) excludedCosts.push('货物运输保险（可选购）');
  if (!services.loadingAssistance) excludedCosts.push('装货协助（可选购）');
  if (!services.unloadingAssistance) excludedCosts.push('卸货协助（可选购）');
  if (!services.returnEmpty) excludedCosts.push('返程空驶补偿（可选购）');

  const overloadWarnings = risks
    .filter(r => r.code.startsWith('OVERLOAD') || r.code.startsWith('OVERVOLUME'))
    .map(r => `${r.message}。建议：${r.suggestion || '联系调度确认'}`);

  const priceAdjustmentConditions: string[] = [
    '货物实际重量/体积与申报偏差超过 10% 时重新核算',
    '运输路线变更、增加装卸点需另行报价',
    '燃油价格波动超过 10% 时可能调整',
    '实际等待时间超出约定时长按 ¥80/小时 追加',
  ];
  if (appliedRules.length > 0) {
    priceAdjustmentConditions.push(`本次报价已包含：${appliedRules.map(r => r.name).join('、')}`);
  }

  const remarks: string[] = [
    `路线数据质量：${getRouteDataQualityLabel(route.dataQuality)}`,
    ...route.degradationNotes,
  ].filter(Boolean);

  const validHours = 24;
  const validUntil = generateValidUntil();

  const plainTextLines = [
    '═══════════════ 客户报价确认 ═══════════════',
    `路线：${routeSummary}`,
    `车型：${vehicleSpec.name}（限重${vehicleSpec.maxLoad}吨 / ${vehicleSpec.maxVolume}m³）`,
    `里程：${route.distance}公里  |  预计时长：${route.estimatedDuration}小时`,
    '',
    `【总报价】¥ ${price.toFixed(2)}`,
    '',
    '一、包含服务：',
    ...includedServices.map(s => `  ✔ ${s}`),
    '',
    '二、未包含费用：',
    ...excludedCosts.map(s => `  ✘ ${s}`),
    '',
  ];
  if (overloadWarnings.length > 0) {
    plainTextLines.push('三、超重超限提示：');
    overloadWarnings.forEach(s => plainTextLines.push(`  ⚠ ${s}`));
    plainTextLines.push('');
  }
  plainTextLines.push(
    '四、价格调整条件：',
    ...priceAdjustmentConditions.map(s => `  • ${s}`),
    '',
    `五、有效期：${new Date(validUntil).toLocaleString()}（${validHours}小时）`,
  );
  if (remarks.length > 0) {
    plainTextLines.push('', '六、备注：', ...remarks.map(s => `  - ${s}`));
  }
  plainTextLines.push(
    '',
    '═════════════════════════════════════════════',
    '以上为初步报价，最终价格以双方签署运输合同为准。',
  );

  return {
    totalPrice: price,
    includedServices,
    excludedCosts,
    validUntil,
    validHours,
    overloadWarnings,
    priceAdjustmentConditions,
    remarks,
    plainText: plainTextLines.join('\n'),
  };
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
  lines.push(`数据质量：${getRouteDataQualityLabel(quote.route.dataQuality)}`);
  if (quote.route.degradationNotes.length > 0) {
    lines.push(`降级说明：${quote.route.degradationNotes.join('；')}`);
  }
  lines.push('');

  if (quote.route.segments.length > 1) {
    lines.push('────────────── 分段明细 ──────────────');
    for (const seg of quote.route.segments) {
      const qualityLabel = seg.distanceSource === 'coordinate' ? '精准' : seg.distanceSource === 'city_estimate' ? '估' : '默认';
      lines.push(`  第${seg.index + 1}段 ${seg.from.city || '?'}→${seg.to.city || '?'}：${seg.distance}km / ${seg.estimatedDuration}h [${qualityLabel}] 小计 ¥${(seg.subtotal?.total || 0).toFixed(2)}`);
    }
    lines.push('');
  }

  lines.push('────────────── 费用明细 ──────────────');
  for (const item of quote.costBreakdown) {
    if (item.key.includes('_header') || item.key.includes('_spacer')) {
      lines.push(`  ${item.name}${item.remark ? ' ' + item.remark : ''}`);
      continue;
    }
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

  if (quote.appliedRules.length > 0) {
    lines.push('────────────── 参与计算的规则 ────────────');
    for (const rule of quote.appliedRules) {
      lines.push(`  [${rule.type}] ${rule.name}：${rule.effect}`);
    }
    lines.push('');
  }

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
