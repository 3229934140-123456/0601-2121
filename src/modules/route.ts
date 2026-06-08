import { RoutePoint, RouteInfo, RouteSegment, RouteDataQuality } from '../types';

const CITY_ESTIMATE_DISTANCE: Record<string, Record<string, number>> = {
  '北京': { '上海': 1200, '广州': 2100, '深圳': 2150, '成都': 1800, '重庆': 1750, '杭州': 1300, '南京': 1050, '济南': 420 },
  '上海': { '北京': 1200, '广州': 1450, '深圳': 1500, '成都': 1950, '重庆': 1850, '杭州': 180, '南京': 300, '济南': 850 },
  '广州': { '北京': 2100, '上海': 1450, '深圳': 150, '成都': 1550, '重庆': 1450, '杭州': 1350, '南京': 1400, '济南': 1900 },
  '深圳': { '北京': 2150, '上海': 1500, '广州': 150, '成都': 1600, '重庆': 1500, '杭州': 1400, '南京': 1450, '济南': 1950 },
  '成都': { '北京': 1800, '上海': 1950, '广州': 1550, '深圳': 1600, '重庆': 350, '杭州': 1850, '南京': 1750, '济南': 1650 },
  '重庆': { '北京': 1750, '上海': 1850, '广州': 1450, '深圳': 1500, '成都': 350, '杭州': 1750, '南京': 1650, '济南': 1600 },
  '杭州': { '北京': 1300, '上海': 180, '广州': 1350, '深圳': 1400, '成都': 1850, '重庆': 1750, '南京': 280, '济南': 950 },
  '南京': { '北京': 1050, '上海': 300, '广州': 1400, '深圳': 1450, '成都': 1750, '重庆': 1650, '杭州': 280, '济南': 700 },
  '济南': { '北京': 420, '上海': 850, '广州': 1900, '深圳': 1950, '成都': 1650, '重庆': 1600, '杭州': 950, '南京': 700 },
};

const FALLBACK_DISTANCE_PER_SEGMENT = 400;

export function calculateRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = [],
  customDistance?: number
): RouteInfo {
  if (customDistance !== undefined && customDistance > 0) {
    const estimatedDuration = estimateDuration(customDistance, waypoints.length);
    const fallbackSegments = buildFallbackSegments(origin, destination, waypoints, customDistance);
    return {
      origin,
      destination,
      waypoints,
      distance: customDistance,
      estimatedDuration,
      waypointCount: waypoints.length,
      segments: fallbackSegments,
      dataQuality: RouteDataQuality.CUSTOM_DISTANCE,
      degradationNotes: ['调用方传入了自定义总里程，实际分段距离按比例估算，可能与实际路线存在偏差'],
    };
  }

  const pointList: RoutePoint[] = [origin, ...waypoints, destination];
  const segments: RouteSegment[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  const degradationNotes: string[] = [];
  let coordSegmentsCount = 0;
  let cityEstimateSegmentsCount = 0;
  let fallbackSegmentsCount = 0;

  for (let i = 0; i < pointList.length - 1; i++) {
    const from = pointList[i];
    const to = pointList[i + 1];
    const segment = buildSegment(i, from, to);
    segments.push(segment);
    totalDistance += segment.distance;
    totalDuration += segment.estimatedDuration;

    if (segment.distanceSource === 'coordinate') {
      coordSegmentsCount++;
    } else if (segment.distanceSource === 'city_estimate') {
      cityEstimateSegmentsCount++;
    } else {
      fallbackSegmentsCount++;
    }

    if (segment.remark) {
      degradationNotes.push(`第${i + 1}段（${from.city || '未知'}→${to.city || '未知'}）：${segment.remark}`);
    }
  }

  let dataQuality: RouteDataQuality;
  if (coordSegmentsCount === segments.length) {
    dataQuality = RouteDataQuality.FULL_COORDINATES;
  } else if (coordSegmentsCount > 0 || cityEstimateSegmentsCount > 0) {
    dataQuality = RouteDataQuality.PARTIAL_COORDINATES;
  } else {
    dataQuality = RouteDataQuality.CITY_ONLY;
  }

  if (cityEstimateSegmentsCount > 0) {
    degradationNotes.unshift(`有 ${cityEstimateSegmentsCount} 段仅提供城市名未提供经纬度，已按历史线路数据估算距离`);
  }
  if (fallbackSegmentsCount > 0) {
    degradationNotes.unshift(`有 ${fallbackSegmentsCount} 段缺少经纬度且无城市里程参考，使用默认值 ${FALLBACK_DISTANCE_PER_SEGMENT}公里/段 估算，建议补充经纬度以获得更精准报价`);
  }

  return {
    origin,
    destination,
    waypoints,
    distance: Math.round(totalDistance * 10) / 10,
    estimatedDuration: Math.ceil(totalDuration),
    waypointCount: waypoints.length,
    segments,
    dataQuality,
    degradationNotes,
  };
}

function buildSegment(index: number, from: RoutePoint, to: RoutePoint): RouteSegment {
  if (from.lng !== undefined && from.lat !== undefined && to.lng !== undefined && to.lat !== undefined) {
    if (!isValidCoordinate(from.lng, from.lat) || !isValidCoordinate(to.lng, to.lat)) {
      return {
        index,
        from,
        to,
        distance: getCityEstimateOrDefault(from.city, to.city),
        estimatedDuration: estimateDuration(getCityEstimateOrDefault(from.city, to.city), 0),
        distanceSource: 'city_estimate',
        remark: '经纬度超出有效范围（经度-180~180，纬度-90~90），已降级为城市级别估算',
      };
    }
    const dist = haversineDistance(from.lng, from.lat, to.lng, to.lat);
    return {
      index,
      from,
      to,
      distance: Math.round(dist * 1.15 * 10) / 10,
      estimatedDuration: estimateDuration(dist * 1.15, 0),
      distanceSource: 'coordinate',
    };
  }

  if (from.city && to.city) {
    const estimated = getCityEstimateOrDefault(from.city, to.city);
    const hasDirectEstimate = CITY_ESTIMATE_DISTANCE[from.city]?.[to.city] !== undefined;
    return {
      index,
      from,
      to,
      distance: estimated,
      estimatedDuration: estimateDuration(estimated, 0),
      distanceSource: hasDirectEstimate ? 'city_estimate' : 'fallback',
      remark: hasDirectEstimate ? undefined : `未找到「${from.city}→${to.city}」历史里程数据，使用默认值估算`,
    };
  }

  return {
    index,
    from,
    to,
    distance: FALLBACK_DISTANCE_PER_SEGMENT,
    estimatedDuration: estimateDuration(FALLBACK_DISTANCE_PER_SEGMENT, 0),
    distanceSource: 'fallback',
    remark: `缺少起终点城市名${!from.city ? '（起点）' : ''}${!to.city ? '（终点）' : ''}，使用默认值估算`,
  };
}

function getCityEstimateOrDefault(from: string, to: string): number {
  if (!from || !to) return FALLBACK_DISTANCE_PER_SEGMENT;
  if (CITY_ESTIMATE_DISTANCE[from]?.[to] !== undefined) {
    return CITY_ESTIMATE_DISTANCE[from][to];
  }
  if (CITY_ESTIMATE_DISTANCE[to]?.[from] !== undefined) {
    return CITY_ESTIMATE_DISTANCE[to][from];
  }
  return FALLBACK_DISTANCE_PER_SEGMENT;
}

function buildFallbackSegments(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[],
  totalDistance: number
): RouteSegment[] {
  const pointList = [origin, ...waypoints, destination];
  const segmentCount = pointList.length - 1;
  const perSegment = totalDistance / segmentCount;
  const segments: RouteSegment[] = [];
  for (let i = 0; i < segmentCount; i++) {
    segments.push({
      index: i,
      from: pointList[i],
      to: pointList[i + 1],
      distance: Math.round(perSegment * 10) / 10,
      estimatedDuration: estimateDuration(perSegment, 0),
      distanceSource: 'fallback',
      remark: '总里程由调用方传入，本段距离按段数均分',
    });
  }
  return segments;
}

export function estimateDistance(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = []
): number {
  const route = calculateRoute(origin, destination, waypoints);
  return route.distance;
}

export function isValidCoordinate(lng: number, lat: number): boolean {
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function estimateDuration(distance: number, waypointCount: number): number {
  const avgSpeed = 60;
  const waypointTime = waypointCount * 1.5;
  return Math.ceil((distance / avgSpeed) + waypointTime);
}

export function getWaypointCount(waypoints?: RoutePoint[]): number {
  return waypoints ? waypoints.length : 0;
}

export function formatRouteSummary(route: RouteInfo): string {
  const parts = [route.origin.city];
  if (route.waypoints && route.waypoints.length > 0) {
    parts.push(...route.waypoints.map(wp => wp.city));
  }
  parts.push(route.destination.city);
  return parts.join(' → ');
}

export function getRouteDataQualityLabel(quality: RouteDataQuality): string {
  const map: Record<RouteDataQuality, string> = {
    [RouteDataQuality.FULL_COORDINATES]: '完整经纬度（高精度）',
    [RouteDataQuality.PARTIAL_COORDINATES]: '部分经纬度+城市估算（中等精度）',
    [RouteDataQuality.CITY_ONLY]: '仅城市名（估算值）',
    [RouteDataQuality.CUSTOM_DISTANCE]: '调用方自定义里程',
  };
  return map[quality];
}
