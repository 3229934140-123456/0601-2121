import { SeasonType, SeasonalRule } from '../types';

export const DEFAULT_SEASONAL_RULES: SeasonalRule[] = [
  {
    name: '春节旺季',
    months: [1, 2],
    type: SeasonType.PEAK,
    rateMultiplier: 1.3,
  },
  {
    name: '双11/双12旺季',
    months: [11, 12],
    type: SeasonType.PEAK,
    rateMultiplier: 1.2,
  },
  {
    name: '夏季淡季',
    months: [6, 7, 8],
    type: SeasonType.LOW,
    rateMultiplier: 0.9,
  },
  {
    name: '春秋平季',
    months: [3, 4, 5, 9, 10],
    type: SeasonType.NORMAL,
    rateMultiplier: 1,
  },
];

export function getSeasonalMultiplier(
  date: string | Date,
  customRules?: SeasonalRule[]
): { type: SeasonType; multiplier: number; ruleName: string } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.getMonth() + 1;
  const rules = customRules || DEFAULT_SEASONAL_RULES;

  for (const rule of rules) {
    if (rule.months.includes(month)) {
      return {
        type: rule.type,
        multiplier: rule.rateMultiplier,
        ruleName: rule.name,
      };
    }
  }

  return {
    type: SeasonType.NORMAL,
    multiplier: 1,
    ruleName: '标准价格',
  };
}

export function getSeasonByType(type: SeasonType): { multiplier: number; name: string } {
  const mapping: Record<SeasonType, { multiplier: number; name: string }> = {
    [SeasonType.PEAK]: { multiplier: 1.2, name: '旺季' },
    [SeasonType.NORMAL]: { multiplier: 1, name: '平季' },
    [SeasonType.LOW]: { multiplier: 0.9, name: '淡季' },
  };
  return mapping[type];
}

export function applySeasonalPricing(
  baseAmount: number,
  dateOrSeason: string | Date | SeasonType
): { adjustedAmount: number; seasonInfo: { type: SeasonType; multiplier: number; name: string } } {
  let seasonInfo: { type: SeasonType; multiplier: number; name: string };

  if (typeof dateOrSeason === 'string' && Object.values(SeasonType).includes(dateOrSeason as SeasonType)) {
    const result = getSeasonByType(dateOrSeason as SeasonType);
    seasonInfo = { type: dateOrSeason as SeasonType, multiplier: result.multiplier, name: result.name };
  } else {
    const result = getSeasonalMultiplier(dateOrSeason as string | Date);
    seasonInfo = { type: result.type, multiplier: result.multiplier, name: result.ruleName };
  }

  return {
    adjustedAmount: Math.round(baseAmount * seasonInfo.multiplier * 100) / 100,
    seasonInfo,
  };
}
