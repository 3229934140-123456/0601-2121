import {
  RoadTransportPricer,
  generateQuote,
  formatQuoteDisplay,
  validateQuoteInput,
  runBatchQuote,
  formatBatchTable,
  VehicleType,
  UrgencyLevel,
  SeasonType,
  QuoteValidationError,
} from '../src';

function example1_segmentedRouteWithDegradation() {
  console.log('\n============= 示例1：分段路线 + 降级说明 =============\n');

  const pricer = new RoadTransportPricer();

  const quoteA = pricer.quote({
    origin: { city: '上海', lng: 121.47, lat: 31.23 },
    waypoints: [
      { city: '南京', lng: 118.78, lat: 32.04 },
      { city: '济南' },
    ],
    destination: { city: '北京', lng: 116.40, lat: 39.90 },
    vehicleType: VehicleType.TRUCK_9_6,
    actualLoad: 15,
    actualVolume: 55,
    urgency: UrgencyLevel.NORMAL,
  });

  console.log(`数据质量：${quoteA.route.dataQuality}`);
  console.log(`总里程：${quoteA.route.distance}公里，总时长：${quoteA.route.estimatedDuration}小时`);
  console.log('各段明细：');
  quoteA.route.segments.forEach(seg => {
    console.log(`  第${seg.index + 1}段 ${seg.from.city}→${seg.to.city}：${seg.distance}km / ${seg.estimatedDuration}h [来源:${seg.distanceSource}] 小计¥${(seg.subtotal?.total || 0).toFixed(2)}${seg.remark ? '  备注: ' + seg.remark : ''}`);
  });
  if (quoteA.route.degradationNotes.length > 0) {
    console.log('\n降级说明：');
    quoteA.route.degradationNotes.forEach(n => console.log('  • ' + n));
  }
}

function example2_inputValidation() {
  console.log('\n============= 示例2：参数业务校验 =============\n');

  const badInput = {
    origin: { city: '' },
    destination: { city: '北京' },
    vehicleType: VehicleType.TRUCK_6_8,
    actualLoad: -5,
    actualVolume: 60,
    distance: -100,
    additionalServices: { loadingWaitHours: -2 },
    customTollFee: -50,
  } as any;

  const result = validateQuoteInput(badInput);
  console.log(`校验结果：${result.valid ? '通过' : '失败'}`);
  console.log(`错误数：${result.errors.length}，警告数：${result.warnings.length}`);
  if (result.errors.length > 0) {
    console.log('\n错误明细：');
    result.errors.forEach(e => {
      console.log(`  [${e.code}] ${e.field}: ${e.message}${e.suggestion ? '  (' + e.suggestion + ')' : ''}`);
    });
  }

  console.log('\n--- 使用 throwOnInvalid 捕获异常 ---');
  try {
    generateQuote(badInput, undefined, { throwOnInvalid: true });
  } catch (err) {
    if (err instanceof QuoteValidationError) {
      console.log(`捕获到 QuoteValidationError，含 ${err.errors.length} 个错误`);
      console.log('首个错误：', err.errors[0].message);
    }
  }
}

function example3_regionAndLineRules() {
  console.log('\n============= 示例3：地区/线路规则参与计算 =============\n');

  const pricer = new RoadTransportPricer();

  const quote = pricer.quote({
    origin: { city: '成都' },
    destination: { city: '重庆' },
    vehicleType: VehicleType.TRUCK_6_8,
    actualLoad: 8,
    urgency: UrgencyLevel.NORMAL,
    additionalServices: { coldChain: true },
    rules: {
      regionFuelRules: [{ province: '四川', fuelPrice: 8.0, remark: '自定义四川油价' }],
      specialLineRules: [
        { key: 'my_cold', type: 'cold_chain', name: '客户冷链加价', rateMultiplier: 1.2 },
      ],
    },
  });

  console.log(`推荐报价：¥${quote.priceRange.recommended.toFixed(2)}`);
  console.log(`\n参与计算的规则（共 ${quote.appliedRules.length} 条）：`);
  quote.appliedRules.forEach(r => {
    console.log(`  [${r.type}] ${r.name}  →  ${r.effect}`);
  });

  console.log('\n费用明细中已体现规则：');
  quote.costBreakdown
    .filter(i => i.remark && (i.remark.includes('油价') || i.remark.includes('系数') || i.remark.includes('特殊')))
    .forEach(i => console.log(`  ${i.name}：¥${i.amount.toFixed(2)}  (${i.remark})`));
}

function example4_batchQuotes() {
  console.log('\n============= 示例4：批量试算对比（多车型+多季节+多时效） =============\n');

  const pricer = new RoadTransportPricer({ grossProfitMargin: 0.18 });

  const result = pricer.batch({
    base: {
      origin: { city: '上海' },
      destination: { city: '广州' },
      actualLoad: 20,
      actualVolume: 60,
    },
    variants: [
      { id: 'A_平季普通', vehicleType: VehicleType.TRUCK_9_6, season: SeasonType.NORMAL, urgency: UrgencyLevel.NORMAL },
      { id: 'B_平季加急', vehicleType: VehicleType.TRUCK_9_6, season: SeasonType.NORMAL, urgency: UrgencyLevel.URGENT },
      { id: 'C_旺季大车', vehicleType: VehicleType.TRUCK_13_5, season: SeasonType.PEAK, urgency: UrgencyLevel.NORMAL },
      { id: 'D_淡季特快', vehicleType: VehicleType.TRUCK_9_6, season: SeasonType.LOW, urgency: UrgencyLevel.EXPRESS },
      { id: 'E_超重试算', vehicleType: VehicleType.TRUCK_6_8, season: SeasonType.NORMAL, urgency: UrgencyLevel.NORMAL },
    ],
  });

  console.log(pricer.formatBatch(result));

  console.log('\n最便宜方案详情：');
  const cheapest = result.items.find(it => it.variantId === result.cheapestId);
  if (cheapest?.quote) {
    console.log(`  ${cheapest.variantId} → ¥${cheapest.quote.priceRange.recommended.toFixed(2)}，车型${cheapest.quote.vehicleSpec.name}`);
  }
}

function example5_detailedConfirmation() {
  console.log('\n============= 示例5：客户确认详细说明 =============\n');

  const pricer = new RoadTransportPricer();
  const quote = pricer.quote({
    origin: { city: '广州' },
    destination: { city: '深圳' },
    vehicleType: VehicleType.VAN_4_2,
    actualLoad: 6,
    actualVolume: 22,
    urgency: UrgencyLevel.URGENT,
    additionalServices: {
      loadingAssistance: true,
      insurance: true,
      returnEmpty: true,
      loadingWaitHours: 1,
    },
  });

  const dc = quote.detailedConfirmation;
  console.log(dc.plainText);

  console.log('\n--- 结构化字段（供车队管理工具直接展示）---');
  console.log('总价：¥' + dc.totalPrice.toFixed(2));
  console.log('包含服务：' + dc.includedServices.join('；'));
  console.log('未包含费用：' + dc.excludedCosts.join('；'));
  console.log('超重超限提示：' + (dc.overloadWarnings.length ? dc.overloadWarnings.join('；') : '无'));
  console.log('改价条件：' + dc.priceAdjustmentConditions.join('；'));
  console.log('有效期：' + dc.validHours + '小时（至 ' + new Date(dc.validUntil).toLocaleString() + '）');
}

example1_segmentedRouteWithDegradation();
example2_inputValidation();
example3_regionAndLineRules();
example4_batchQuotes();
example5_detailedConfirmation();
