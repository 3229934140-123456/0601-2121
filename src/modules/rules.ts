import {
  RoutePoint,
  RouteRules,
  RegionFuelRule,
  LineTollRule,
  SpecialLineRule,
  AppliedRuleRecord,
  VehicleSpec,
  AdditionalServices,
} from '../types';

export const DEFAULT_REGION_FUEL_RULES: RegionFuelRule[] = [
  { province: '北京', fuelPrice: 7.7, remark: '北京地区油价' },
  { province: '天津', fuelPrice: 7.65 },
  { province: '上海', fuelPrice: 7.8, remark: '上海地区油价' },
  { province: '重庆', fuelPrice: 7.75 },
  { province: '广东', fuelPrice: 7.9, remark: '广东地区油价' },
  { province: '江苏', fuelPrice: 7.55 },
  { province: '浙江', fuelPrice: 7.6 },
  { province: '山东', fuelPrice: 7.45 },
  { province: '河北', fuelPrice: 7.4 },
  { province: '河南', fuelPrice: 7.45 },
  { province: '四川', fuelPrice: 7.6, remark: '四川地区油价' },
  { province: '云南', fuelPrice: 7.8 },
  { province: '贵州', fuelPrice: 7.75 },
  { province: '陕西', fuelPrice: 7.45 },
  { province: '山西', fuelPrice: 7.4 },
  { province: '湖北', fuelPrice: 7.5 },
  { province: '湖南', fuelPrice: 7.55 },
  { province: '福建', fuelPrice: 7.65 },
  { province: '江西', fuelPrice: 7.5 },
  { province: '安徽', fuelPrice: 7.48 },
  { province: '辽宁', fuelPrice: 7.42 },
  { province: '吉林', fuelPrice: 7.4 },
  { province: '黑龙江', fuelPrice: 7.38 },
  { province: '内蒙古', fuelPrice: 7.35 },
  { province: '新疆', fuelPrice: 7.4, remark: '新疆地区油价' },
  { province: '西藏', fuelPrice: 8.2, remark: '西藏地区油价偏高' },
  { province: '青海', fuelPrice: 7.55 },
  { province: '甘肃', fuelPrice: 7.48 },
  { province: '宁夏', fuelPrice: 7.42 },
  { province: '广西', fuelPrice: 7.6 },
  { province: '海南', fuelPrice: 8.5, remark: '海南高速免费，油价含养路费' },
];

export const DEFAULT_LINE_TOLL_RULES: LineTollRule[] = [
  { key: 'bj-sh', fromCity: '北京', toCity: '上海', tollCoefficient: 1.1, remark: '京沪高速干线' },
  { key: 'bj-gz', fromCity: '北京', toCity: '广州', tollCoefficient: 1.15 },
  { key: 'sh-gz', fromCity: '上海', toCity: '广州', tollCoefficient: 1.1 },
  { key: 'cd-cq', fromCity: '成都', toCity: '重庆', tollCoefficient: 1.4, remark: '成渝高速桥隧多' },
  { key: 'gz-sz', fromCity: '广州', toCity: '深圳', tollCoefficient: 1.05 },
  { key: 'sh-hz', fromCity: '上海', toCity: '杭州', tollCoefficient: 1.05 },
  { key: 'sh-nj', fromCity: '上海', toCity: '南京', tollCoefficient: 1.0 },
];

export const DEFAULT_SPECIAL_LINE_RULES: SpecialLineRule[] = [
  {
    key: 'mountain_west',
    type: 'mountain',
    name: '西部山区附加费',
    rateMultiplier: 1.12,
    appliesTo: { provinces: ['四川', '云南', '贵州', '西藏', '青海', '甘肃', '陕西', '重庆'] },
    remark: '山路多、坡道多，油耗和磨损更高',
  },
  {
    key: 'cold_chain_base',
    type: 'cold_chain',
    name: '冷链运输附加费',
    rateMultiplier: 1.3,
    remark: '含冷藏机组油耗、温控设备折旧',
  },
  {
    key: 'dangerous_cargo_base',
    type: 'dangerous_cargo',
    name: '危险品运输附加费',
    rateMultiplier: 1.5,
    remark: '含资质、押运员、特种保险等',
  },
  {
    key: 'hainan_island',
    type: 'custom',
    name: '海南进出岛附加费',
    rateMultiplier: 1.15,
    appliesTo: { provinces: ['海南'] },
    remark: '含渡轮费用和接驳时间',
  },
];

export interface RuleResolution {
  effectiveFuelPrice: number;
  effectiveTollCoefficient: number;
  specialMultiplier: number;
  appliedRules: AppliedRuleRecord[];
}

export function resolveRouteRules(
  points: RoutePoint[],
  vehicleSpec: VehicleSpec,
  baseFuelPrice: number,
  baseTollCoefficient: number,
  customRules?: RouteRules,
  additionalServices: AdditionalServices = {}
): RuleResolution {
  const appliedRules: AppliedRuleRecord[] = [];
  let effectiveFuelPrice = baseFuelPrice;
  let effectiveTollCoefficient = baseTollCoefficient;
  let specialMultiplier = 1;

  const allRegionFuelRules: RegionFuelRule[] = [
    ...DEFAULT_REGION_FUEL_RULES,
    ...(customRules?.regionFuelRules || []),
  ];

  const allLineTollRules: LineTollRule[] = [
    ...DEFAULT_LINE_TOLL_RULES,
    ...(customRules?.lineTollRules || []),
  ];

  const allSpecialRules: SpecialLineRule[] = [
    ...DEFAULT_SPECIAL_LINE_RULES,
    ...(customRules?.specialLineRules || []),
  ];

  const fuelPrices: number[] = [];
  for (const point of points) {
    if (!point.city) continue;
    const province = matchProvince(point.city, allRegionFuelRules);
    if (province) {
      fuelPrices.push(province.fuelPrice);
      if (!appliedRules.some(r => r.key === `fuel_${province.province}`)) {
        appliedRules.push({
          key: `fuel_${province.province}`,
          name: `${province.province}油价`,
          type: 'region_fuel',
          effect: `油价 ¥${province.fuelPrice}/L（基准 ¥${baseFuelPrice}）`,
          amount: province.fuelPrice,
        });
      }
    }
  }
  if (fuelPrices.length > 0) {
    effectiveFuelPrice = Math.round(
      fuelPrices.reduce((a, b) => a + b, 0) / fuelPrices.length * 100
    ) / 100;
  }

  const segmentTollCoefficients: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const lineRule = allLineTollRules.find(r =>
      (r.fromCity === from.city && r.toCity === to.city) ||
      (r.fromCity === to.city && r.toCity === from.city)
    );
    if (lineRule) {
      segmentTollCoefficients.push(lineRule.tollCoefficient);
      if (!appliedRules.some(r => r.key === lineRule.key)) {
        appliedRules.push({
          key: lineRule.key,
          name: `${from.city}→${to.city}过路费系数`,
          type: 'line_toll',
          effect: `系数 ×${lineRule.tollCoefficient}（基准 ×${baseTollCoefficient}）`,
          multiplier: lineRule.tollCoefficient,
        });
      }
    }
  }
  if (segmentTollCoefficients.length > 0) {
    effectiveTollCoefficient = segmentTollCoefficients.reduce((a, b) => a + b, 0) / segmentTollCoefficients.length;
  }

  const provincesOnRoute = extractProvinces(points);
  for (const rule of allSpecialRules) {
    let applies = false;

    if (rule.type === 'cold_chain') {
      applies = !!additionalServices.coldChain;
    } else if (rule.type === 'dangerous_cargo') {
      applies = !!additionalServices.dangerousCargo;
    } else if (rule.type === 'mountain') {
      const provinceMatch = rule.appliesTo?.provinces
        ? provincesOnRoute.some(p => rule.appliesTo!.provinces!.includes(p))
        : false;
      const cityMatch = rule.appliesTo?.cities
        ? points.some(p => rule.appliesTo!.cities!.includes(p.city))
        : false;
      applies = !!additionalServices.mountainRoute || provinceMatch || cityMatch;
    } else {
      if (!rule.appliesTo) {
        applies = true;
      } else {
        if (rule.appliesTo.provinces && rule.appliesTo.provinces.length > 0) {
          applies = provincesOnRoute.some(p => rule.appliesTo!.provinces!.includes(p));
        }
        if (!applies && rule.appliesTo.cities && rule.appliesTo.cities.length > 0) {
          applies = points.some(p => rule.appliesTo!.cities!.includes(p.city));
        }
      }
    }

    if (applies) {
      specialMultiplier *= rule.rateMultiplier;
      appliedRules.push({
        key: rule.key,
        name: rule.name,
        type: 'special_line',
        effect: `系数 ×${rule.rateMultiplier}${rule.remark ? '（' + rule.remark + '）' : ''}`,
        multiplier: rule.rateMultiplier,
      });
    }
  }

  return {
    effectiveFuelPrice,
    effectiveTollCoefficient,
    specialMultiplier: Math.round(specialMultiplier * 10000) / 10000,
    appliedRules,
  };
}

const CITY_TO_PROVINCE: Record<string, string> = {
  '北京': '北京', '天津': '天津', '上海': '上海', '重庆': '重庆',
  '广州': '广东', '深圳': '广东', '东莞': '广东', '佛山': '广东',
  '杭州': '浙江', '宁波': '浙江', '温州': '浙江',
  '南京': '江苏', '苏州': '江苏', '无锡': '江苏',
  '成都': '四川', '绵阳': '四川',
  '武汉': '湖北', '长沙': '湖南',
  '郑州': '河南', '济南': '山东', '青岛': '山东',
  '石家庄': '河北', '西安': '陕西', '太原': '山西',
  '沈阳': '辽宁', '大连': '辽宁', '长春': '吉林', '哈尔滨': '黑龙江',
  '福州': '福建', '厦门': '福建', '合肥': '安徽', '南昌': '江西',
  '昆明': '云南', '贵阳': '贵州', '南宁': '广西', '海口': '海南',
  '兰州': '甘肃', '西宁': '青海', '银川': '宁夏', '乌鲁木齐': '新疆', '拉萨': '西藏',
  '呼和浩特': '内蒙古',
};

function matchProvince(city: string, rules: RegionFuelRule[]): RegionFuelRule | undefined {
  const provinceName = CITY_TO_PROVINCE[city] || city;
  return rules.find(r => r.province === provinceName);
}

function extractProvinces(points: RoutePoint[]): string[] {
  const result = new Set<string>();
  for (const p of points) {
    if (!p.city) continue;
    const province = CITY_TO_PROVINCE[p.city] || p.city;
    result.add(province);
  }
  return Array.from(result);
}
