import { VehicleType, VehicleSpec, RiskWarning, RiskLevel } from '../types';
import { getVehicleSpec } from './vehicle';

export interface RiskCheckOptions {
  vehicleType: VehicleType;
  actualLoad: number;
  actualVolume?: number;
  distance?: number;
  waypointCount?: number;
}

export function validateOverload(options: RiskCheckOptions): RiskWarning | null {
  const spec = getVehicleSpec(options.vehicleType);
  const loadRatio = options.actualLoad / spec.maxLoad;

  if (loadRatio > 1.1) {
    return {
      level: RiskLevel.CRITICAL,
      code: 'OVERLOAD_CRITICAL',
      message: `严重超重：实际载重 ${options.actualLoad}吨，超过车型限重 ${spec.maxLoad}吨 的110%`,
      suggestion: '建议更换更大车型或分批次运输，否则将面临高额罚款及安全风险',
    };
  }

  if (loadRatio > 1) {
    return {
      level: RiskLevel.HIGH,
      code: 'OVERLOAD_HIGH',
      message: `超重：实际载重 ${options.actualLoad}吨，超过车型限重 ${spec.maxLoad}吨`,
      suggestion: '建议更换车型或减少货物，超重会增加油费和被查风险',
    };
  }

  if (loadRatio > 0.95) {
    return {
      level: RiskLevel.MEDIUM,
      code: 'OVERLOAD_WARNING',
      message: `载重接近上限：当前载重 ${options.actualLoad}吨，已达限重 ${spec.maxLoad}吨 的${Math.round(loadRatio * 100)}%`,
      suggestion: '请注意货物实际重量可能存在误差，建议预留一定余量',
    };
  }

  return null;
}

export function validateOverVolume(options: RiskCheckOptions): RiskWarning | null {
  if (options.actualVolume === undefined) return null;
  const spec = getVehicleSpec(options.vehicleType);
  const volumeRatio = options.actualVolume / spec.maxVolume;

  if (volumeRatio > 1.1) {
    return {
      level: RiskLevel.CRITICAL,
      code: 'OVERVOLUME_CRITICAL',
      message: `严重超限：实际体积 ${options.actualVolume}m³，超过车型容积 ${spec.maxVolume}m³ 的110%`,
      suggestion: '必须更换更大车型或拆分货物，否则无法正常装载',
    };
  }

  if (volumeRatio > 1) {
    return {
      level: RiskLevel.HIGH,
      code: 'OVERVOLUME_HIGH',
      message: `超限：实际体积 ${options.actualVolume}m³，超过车型容积 ${spec.maxVolume}m³`,
      suggestion: '建议更换车型，超出部分可能无法安全运输',
    };
  }

  if (volumeRatio > 0.9) {
    return {
      level: RiskLevel.MEDIUM,
      code: 'OVERVOLUME_WARNING',
      message: `体积接近上限：当前体积 ${options.actualVolume}m³，已达容积 ${spec.maxVolume}m³ 的${Math.round(volumeRatio * 100)}%`,
      suggestion: '请确认货物包装尺寸，建议预留装载空间',
    };
  }

  return null;
}

export function validateRouteRisk(options: RiskCheckOptions): RiskWarning[] {
  const risks: RiskWarning[] = [];

  if (options.distance && options.distance > 2000) {
    risks.push({
      level: RiskLevel.MEDIUM,
      code: 'LONG_DISTANCE',
      message: `长途运输：里程 ${options.distance}公里超过2000公里`,
      suggestion: '建议安排双驾驶员轮换，注意时效和休息',
    });
  }

  if (options.waypointCount && options.waypointCount > 5) {
    risks.push({
      level: RiskLevel.LOW,
      code: 'MANY_WAYPOINTS',
      message: `途经点较多：共 ${options.waypointCount} 个途经点`,
      suggestion: '多个装卸点会增加时间成本，建议提前与各站点确认时间',
    });
  }

  return risks;
}

export function runAllRiskChecks(options: RiskCheckOptions): RiskWarning[] {
  const risks: RiskWarning[] = [];
  const overloadRisk = validateOverload(options);
  const overVolumeRisk = validateOverVolume(options);
  const routeRisks = validateRouteRisk(options);

  if (overloadRisk) risks.push(overloadRisk);
  if (overVolumeRisk) risks.push(overVolumeRisk);
  risks.push(...routeRisks);

  return risks.sort((a, b) => getRiskLevelOrder(b.level) - getRiskLevelOrder(a.level));
}

function getRiskLevelOrder(level: RiskLevel): number {
  const order: Record<RiskLevel, number> = {
    [RiskLevel.CRITICAL]: 4,
    [RiskLevel.HIGH]: 3,
    [RiskLevel.MEDIUM]: 2,
    [RiskLevel.LOW]: 1,
  };
  return order[level];
}

export function getHighestRiskLevel(risks: RiskWarning[]): RiskLevel {
  if (risks.length === 0) return RiskLevel.LOW;
  return risks.reduce<RiskLevel>(
    (highest, risk) =>
      getRiskLevelOrder(risk.level) > getRiskLevelOrder(highest) ? risk.level : highest,
    RiskLevel.LOW
  );
}
