import {
  QuoteInput,
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
  RoutePoint,
  VehicleType,
  QuoteValidationError,
} from '../types';
import { VEHICLE_SPECS } from './vehicle';
import { isValidCoordinate } from './route';

export const DEFAULT_VALIDATION_LIMITS = {
  maxDistanceKm: 10000,
  maxLoadTon: 100,
  maxVolumeCbm: 500,
  maxWaitHours: 72,
  maxTollFee: 50000,
  minCityNameLength: 2,
};

export function validateQuoteInput(
  input: QuoteInput,
  limits = DEFAULT_VALIDATION_LIMITS
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!input.vehicleType || !VEHICLE_SPECS[input.vehicleType]) {
    errors.push({
      code: ValidationErrorCode.MISSING_REQUIRED,
      field: 'vehicleType',
      message: '车型必填，且必须是支持的车型',
      value: input.vehicleType,
      suggestion: `可选车型：${Object.values(VehicleType).join('、')}`,
    });
  }

  validateRoutePoint('origin', input.origin, errors, warnings, limits);
  validateRoutePoint('destination', input.destination, errors, warnings, limits);

  if (input.waypoints && input.waypoints.length > 0) {
    input.waypoints.forEach((wp, idx) => {
      validateRoutePoint(`waypoints[${idx}]`, wp, errors, warnings, limits);
    });
  }

  if (input.distance !== undefined) {
    if (input.distance < 0) {
      errors.push({
        code: ValidationErrorCode.NEGATIVE_VALUE,
        field: 'distance',
        message: '里程不能为负数',
        value: input.distance,
        suggestion: '请传入大于 0 的里程数，或不传该字段使用自动估算',
      });
    } else if (input.distance === 0) {
      warnings.push({
        code: ValidationErrorCode.ZERO_DISTANCE,
        field: 'distance',
        message: '里程为 0，系统将使用自动估算',
        value: input.distance,
      });
    } else if (input.distance > limits.maxDistanceKm) {
      warnings.push({
        code: ValidationErrorCode.EXCEED_LIMIT,
        field: 'distance',
        message: `里程 ${input.distance}公里 超过常规上限 ${limits.maxDistanceKm}公里`,
        value: input.distance,
        suggestion: '请确认里程是否正确，超长距离建议拆分或安排双驾驶员',
      });
    }
  }

  if (input.actualLoad === undefined || input.actualLoad === null) {
    errors.push({
      code: ValidationErrorCode.MISSING_REQUIRED,
      field: 'actualLoad',
      message: '实际载重必填',
      suggestion: '请传入货物重量（单位：吨）',
    });
  } else if (input.actualLoad < 0) {
    errors.push({
      code: ValidationErrorCode.NEGATIVE_VALUE,
      field: 'actualLoad',
      message: '实际载重不能为负数',
      value: input.actualLoad,
      suggestion: '请传入大于等于 0 的货物重量（单位：吨）',
    });
  } else if (input.actualLoad > limits.maxLoadTon) {
    warnings.push({
      code: ValidationErrorCode.EXCEED_LIMIT,
      field: 'actualLoad',
      message: `实际载重 ${input.actualLoad}吨 超过常规上限 ${limits.maxLoadTon}吨`,
      value: input.actualLoad,
      suggestion: '请确认载重是否正确，超重会导致高额罚款风险',
    });
  }

  if (input.actualVolume !== undefined) {
    if (input.actualVolume < 0) {
      errors.push({
        code: ValidationErrorCode.NEGATIVE_VALUE,
        field: 'actualVolume',
        message: '实际体积不能为负数',
        value: input.actualVolume,
        suggestion: '请传入大于等于 0 的货物体积（单位：立方米）',
      });
    } else if (input.actualVolume > limits.maxVolumeCbm) {
      warnings.push({
        code: ValidationErrorCode.EXCEED_LIMIT,
        field: 'actualVolume',
        message: `实际体积 ${input.actualVolume}m³ 超过常规上限 ${limits.maxVolumeCbm}m³`,
        value: input.actualVolume,
      });
    }
  }

  if (input.additionalServices) {
    const { loadingWaitHours, unloadingWaitHours } = input.additionalServices;
    if (loadingWaitHours !== undefined) {
      if (loadingWaitHours < 0) {
        errors.push({
          code: ValidationErrorCode.NEGATIVE_VALUE,
          field: 'additionalServices.loadingWaitHours',
          message: '装货等待小时数不能为负数',
          value: loadingWaitHours,
        });
      } else if (loadingWaitHours > limits.maxWaitHours) {
        warnings.push({
          code: ValidationErrorCode.EXCEED_LIMIT,
          field: 'additionalServices.loadingWaitHours',
          message: `装货等待时长 ${loadingWaitHours}小时 超过常规上限 ${limits.maxWaitHours}小时`,
          value: loadingWaitHours,
        });
      }
    }
    if (unloadingWaitHours !== undefined) {
      if (unloadingWaitHours < 0) {
        errors.push({
          code: ValidationErrorCode.NEGATIVE_VALUE,
          field: 'additionalServices.unloadingWaitHours',
          message: '卸货等待小时数不能为负数',
          value: unloadingWaitHours,
        });
      } else if (unloadingWaitHours > limits.maxWaitHours) {
        warnings.push({
          code: ValidationErrorCode.EXCEED_LIMIT,
          field: 'additionalServices.unloadingWaitHours',
          message: `卸货等待时长 ${unloadingWaitHours}小时 超过常规上限 ${limits.maxWaitHours}小时`,
          value: unloadingWaitHours,
        });
      }
    }
  }

  if (input.customTollFee !== undefined) {
    if (input.customTollFee < 0) {
      errors.push({
        code: ValidationErrorCode.NEGATIVE_VALUE,
        field: 'customTollFee',
        message: '自定义过路费不能为负数',
        value: input.customTollFee,
      });
    } else if (input.customTollFee > limits.maxTollFee) {
      warnings.push({
        code: ValidationErrorCode.EXCEED_LIMIT,
        field: 'customTollFee',
        message: `自定义过路费 ¥${input.customTollFee} 超过常规上限 ¥${limits.maxTollFee}`,
        value: input.customTollFee,
      });
    }
  }

  if (input.vehicleType && VEHICLE_SPECS[input.vehicleType]) {
    const spec = VEHICLE_SPECS[input.vehicleType];
    if (input.actualLoad !== undefined && input.actualLoad > spec.maxLoad * 1.5) {
      errors.push({
        code: ValidationErrorCode.EXCEED_LIMIT,
        field: 'actualLoad',
        message: `实际载重 ${input.actualLoad}吨 超过所选车型 ${spec.name} 限重的150%`,
        value: input.actualLoad,
        suggestion: `请选择更大车型（限重${spec.maxLoad}吨以上）或分批次运输`,
      });
    }
    if (input.actualVolume !== undefined && input.actualVolume > spec.maxVolume * 1.5) {
      errors.push({
        code: ValidationErrorCode.EXCEED_LIMIT,
        field: 'actualVolume',
        message: `实际体积 ${input.actualVolume}m³ 超过所选车型 ${spec.name} 容积的150%`,
        value: input.actualVolume,
        suggestion: `请选择更大车型（容积${spec.maxVolume}m³以上）或分批次运输`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRoutePoint(
  fieldPrefix: string,
  point: RoutePoint | undefined,
  errors: ValidationError[],
  warnings: ValidationError[],
  limits: typeof DEFAULT_VALIDATION_LIMITS
): void {
  if (!point) {
    errors.push({
      code: ValidationErrorCode.MISSING_REQUIRED,
      field: fieldPrefix,
      message: `${fieldPrefix} 是必填项`,
    });
    return;
  }

  if (!point.city || point.city.trim().length < limits.minCityNameLength) {
    errors.push({
      code: ValidationErrorCode.EMPTY_CITY,
      field: `${fieldPrefix}.city`,
      message: `${fieldPrefix} 城市名不能为空且至少${limits.minCityNameLength}个字符`,
      value: point.city,
      suggestion: '请输入有效的城市名，如「上海」「北京」',
    });
  }

  if (point.lng !== undefined && point.lat !== undefined) {
    if (!isValidCoordinate(point.lng, point.lat)) {
      warnings.push({
        code: ValidationErrorCode.INVALID_COORDINATE,
        field: `${fieldPrefix}.lng/.lat`,
        message: `${fieldPrefix} 经纬度超出有效范围（经度-180~180，纬度-90~90）`,
        value: `lng=${point.lng}, lat=${point.lat}`,
        suggestion: '请检查经纬度是否正确，无效坐标会降级使用城市里程估算',
      });
    }
  } else if ((point.lng !== undefined && point.lat === undefined) || (point.lng === undefined && point.lat !== undefined)) {
    warnings.push({
      code: ValidationErrorCode.INVALID_COORDINATE,
      field: `${fieldPrefix}.lng/.lat`,
      message: `${fieldPrefix} 经度和纬度必须同时提供，否则会按城市名估算`,
      value: `lng=${point.lng}, lat=${point.lat}`,
    });
  }
}

export function throwIfInvalid(result: ValidationResult): void {
  if (!result.valid) {
    throw new QuoteValidationError(result);
  }
}
