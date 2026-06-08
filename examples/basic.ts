import {
  RoadTransportPricer,
  generateQuote,
  formatQuoteDisplay,
  VehicleType,
  UrgencyLevel,
  SeasonType,
  recommendVehicle,
  listAvailableVehicles,
} from '../src';

function example1_basicQuote() {
  console.log('\n================ 示例1：基础报价 ================\n');

  const pricer = new RoadTransportPricer();

  const quote = pricer.quote({
    origin: { city: '上海' },
    destination: { city: '北京' },
    waypoints: [{ city: '济南' }],
    vehicleType: VehicleType.TRUCK_9_6,
    actualLoad: 15,
    actualVolume: 50,
    urgency: UrgencyLevel.NORMAL,
    distance: 1200,
    season: SeasonType.PEAK,
    additionalServices: {
      loadingAssistance: true,
      unloadingAssistance: true,
      returnEmpty: true,
      insurance: true,
    },
  });

  console.log(pricer.formatQuote(quote));
  console.log('\n客户确认简版说明：');
  console.log(quote.confirmationBrief);
}

function example2_recommendVehicle() {
  console.log('\n================ 示例2：车型推荐 ================\n');

  const vehicles = listAvailableVehicles();
  console.log('所有可用车型：');
  vehicles.forEach(v => {
    console.log(`  - ${v.name}：限重${v.maxLoad}吨/${v.maxVolume}m³，油耗${v.fuelConsumption}L/100km`);
  });

  const recommended = recommendVehicle({ actualLoad: 25, actualVolume: 75 });
  console.log(`\n推荐车型（载重25吨/体积75m³）：${recommended}`);
}

function example3_seasonalPricing() {
  console.log('\n================ 示例3：淡旺季价格对比 ================\n');

  const baseInput = {
    origin: { city: '广州' },
    destination: { city: '深圳' },
    vehicleType: VehicleType.VAN_4_2,
    actualLoad: 3,
    distance: 150,
  };

  const seasons: { name: string; season: SeasonType }[] = [
    { name: '淡季', season: SeasonType.LOW },
    { name: '平季', season: SeasonType.NORMAL },
    { name: '旺季', season: SeasonType.PEAK },
  ];

  seasons.forEach(({ name, season }) => {
    const quote = generateQuote({ ...baseInput, season });
    console.log(`${name}报价：¥${quote.priceRange.recommended.toFixed(2)}（成本 ¥${quote.totalCost.toFixed(2)}）`);
  });
}

function example4_urgencyAndRisks() {
  console.log('\n================ 示例4：时效加急与风险校验 ================\n');

  const quote = generateQuote({
    origin: { city: '成都' },
    destination: { city: '重庆' },
    vehicleType: VehicleType.TRUCK_6_8,
    actualLoad: 12,
    actualVolume: 45,
    urgency: UrgencyLevel.EXPRESS,
    distance: 350,
    additionalServices: {
      loadingWaitHours: 2,
      nightOperation: true,
    },
  });

  console.log('费用明细：');
  quote.costBreakdown.forEach(item => {
    console.log(`  ${item.name}: ¥${item.amount.toFixed(2)}`);
  });

  console.log(`\n总价区间：¥${quote.priceRange.min} ~ ¥${quote.priceRange.max}`);
  console.log(`推荐报价：¥${quote.priceRange.recommended}`);

  if (quote.risks.length > 0) {
    console.log('\n风险预警：');
    quote.risks.forEach(r => {
      console.log(`  [${r.level.toUpperCase()}] ${r.message}`);
      if (r.suggestion) console.log(`    建议：${r.suggestion}`);
    });
  }

  console.log(`\n摘要：${quote.summary}`);
}

function example5_customConfig() {
  console.log('\n================ 示例5：自定义价格配置 ================\n');

  const pricer = new RoadTransportPricer({
    fuelPrice: 8.2,
    tollRatePerKm: 1.5,
    grossProfitMargin: 0.2,
    waitHourlyRate: 100,
  });

  const quote = pricer.quote({
    origin: { city: '杭州' },
    destination: { city: '南京' },
    vehicleType: VehicleType.TRUCK_9_6,
    actualLoad: 16,
    distance: 280,
    transportDate: '2026-11-11',
    additionalServices: {
      loadingAssistance: true,
      unloadingAssistance: true,
      loadingWaitHours: 1,
      unloadingWaitHours: 1,
    },
  });

  console.log(formatQuoteDisplay(quote));
}

example1_basicQuote();
example2_recommendVehicle();
example3_seasonalPricing();
example4_urgencyAndRisks();
example5_customConfig();
