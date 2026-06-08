import {
  BatchQuoteInput,
  BatchQuoteComparison,
  BatchQuoteResultItem,
  BatchQuoteVariant,
  QuoteInput,
  QuoteResult,
  PriceConfig,
  RiskLevel,
  ValidationError,
} from '../types';
import { generateQuote } from './quote';
import { validateQuoteInput } from './validation';

const RISK_SCORE: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
  [RiskLevel.CRITICAL]: 3,
};

function highestRiskScore(quote: QuoteResult): number {
  if (quote.risks.length === 0) return 0;
  return Math.max(...quote.risks.map(r => RISK_SCORE[r.level] || 0));
}

export function runBatchQuote(
  input: BatchQuoteInput,
  globalConfig?: Partial<PriceConfig>
): BatchQuoteComparison {
  const items: BatchQuoteResultItem[] = [];
  const config = globalConfig || input.globalConfig;

  for (let i = 0; i < input.variants.length; i++) {
    const variant = input.variants[i];
    const variantId = variant.id || `v_${i + 1}`;

    try {
      const merged: QuoteInput = mergeVariantToInput(input.base, variant);
      const validation = validateQuoteInput(merged);

      if (!validation.valid) {
        if (input.failFast) {
          return {
            cheapestId: variantId,
            lowestRiskId: variantId,
            items: [buildErrorItem(variantId, variant, validation.errors)],
            summary: `批量试算在第 ${i + 1} 个变体就参数校验失败，已提前终止`,
          };
        }
        items.push(buildErrorItem(variantId, variant, validation.errors));
        continue;
      }

      const quote = generateQuote(merged, config, { validateInput: false });
      items.push({
        variantId,
        variant,
        success: true,
        quote,
      });
    } catch (err) {
      const errors: ValidationError[] = [{
        code: 'UNKNOWN_ERROR' as any,
        field: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      }];
      if (input.failFast) {
        return {
          cheapestId: variantId,
          lowestRiskId: variantId,
          items: [buildErrorItem(variantId, variant, errors)],
          summary: `批量试算在第 ${i + 1} 个变体异常失败，已提前终止`,
        };
      }
      items.push(buildErrorItem(variantId, variant, errors));
    }
  }

  const successItems = items.filter(it => it.success && it.quote);
  if (successItems.length === 0) {
    return {
      cheapestId: items[0]?.variantId || '',
      lowestRiskId: items[0]?.variantId || '',
      items,
      summary: '所有变体均计算失败，请检查参数',
    };
  }

  const sortedByPrice = [...successItems].sort((a, b) =>
    (a.quote!.priceRange.recommended - b.quote!.priceRange.recommended)
  );
  const sortedByRisk = [...successItems].sort((a, b) =>
    highestRiskScore(a.quote!) - highestRiskScore(b.quote!)
  );

  successItems.forEach(item => {
    const priceRank = sortedByPrice.findIndex(it => it.variantId === item.variantId) + 1;
    const riskRank = sortedByRisk.findIndex(it => it.variantId === item.variantId) + 1;
    item.rank = { byPrice: priceRank, byRisk: riskRank };
  });

  const cheapestId = sortedByPrice[0].variantId;
  const lowestRiskId = sortedByRisk[0].variantId;

  const cheapest = sortedByPrice[0].quote!;
  const safest = sortedByRisk[0].quote!;

  const summary =
    `共 ${input.variants.length} 个方案，成功 ${successItems.length} 个，失败 ${items.length - successItems.length} 个；` +
    `最便宜：${cheapestId}（¥${cheapest.priceRange.recommended.toFixed(2)}，车型${cheapest.vehicleSpec.name}）；` +
    `最低风险：${lowestRiskId}（${safest.risks.length === 0 ? '无风险提示' : safest.risks[0].message}）`;

  return {
    cheapestId,
    lowestRiskId,
    items,
    summary,
  };
}

function buildErrorItem(
  variantId: string,
  variant: BatchQuoteVariant,
  errors: ValidationError[]
): BatchQuoteResultItem {
  return {
    variantId,
    variant,
    success: false,
    errors,
  };
}

function mergeVariantToInput(
  base: BatchQuoteInput['base'],
  variant: BatchQuoteVariant
): QuoteInput {
  return {
    origin: base.origin,
    destination: base.destination,
    waypoints: base.waypoints,
    vehicleType: variant.vehicleType || base.vehicleType!,
    actualLoad: base.actualLoad,
    actualVolume: base.actualVolume,
    urgency: variant.urgency || base.urgency,
    distance: base.distance,
    season: variant.season || base.season,
    additionalServices: {
      ...(base.additionalServices || {}),
      ...(variant.additionalServices || {}),
    },
    customTollFee: base.customTollFee,
    transportDate: base.transportDate,
    rules: variant.rules || base.rules,
  };
}

export function formatBatchTable(comparison: BatchQuoteComparison): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('                   批量试算对比表');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`总览：${comparison.summary}`);
  lines.push('');
  const header =
    '方案ID'.padEnd(10) +
    '车型'.padEnd(14) +
    '时效/季节'.padEnd(14) +
    '状态'.padEnd(8) +
    '推荐报价'.padEnd(12) +
    '价格排名'.padEnd(10) +
    '风险排名'.padEnd(10) +
    '主要风险';
  lines.push(header);
  lines.push('─'.repeat(80));

  for (const item of comparison.items) {
    const variant = item.variant;
    const statusStr = item.success ? '✓成功' : '✗失败';
    let vehicleStr = '-';
    let priceStr = '-';
    let priceRankStr = '-';
    let riskRankStr = '-';
    let riskStr = '-';

    if (item.quote) {
      vehicleStr = item.quote.vehicleSpec.name;
      priceStr = `¥${item.quote.priceRange.recommended.toFixed(2)}`;
      priceRankStr = `#${item.rank?.byPrice ?? '-'}`;
      riskRankStr = `#${item.rank?.byRisk ?? '-'}`;
      riskStr = item.quote.risks.length === 0 ? '无' : `${item.quote.risks[0].level.toUpperCase()}:${item.quote.risks[0].code}`;
    } else if (item.errors && item.errors.length > 0) {
      riskStr = item.errors[0].message.slice(0, 16);
    }

    const season = variant.season ? variant.season : '默认';
    const urgency = variant.urgency ? variant.urgency : '默认';
    const condStr = `${urgency}/${season}`;

    lines.push(
      item.variantId.padEnd(10) +
      vehicleStr.padEnd(14) +
      condStr.padEnd(14) +
      statusStr.padEnd(8) +
      priceStr.padEnd(12) +
      priceRankStr.padEnd(10) +
      riskRankStr.padEnd(10) +
      riskStr
    );
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
