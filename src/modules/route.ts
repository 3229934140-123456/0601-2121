import { RoutePoint, RouteInfo } from '../types';

export function calculateRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = [],
  customDistance?: number
): RouteInfo {
  const distance = customDistance ?? estimateDistance(origin, destination, waypoints);
  const waypointCount = waypoints.length;
  const estimatedDuration = estimateDuration(distance, waypointCount);

  return {
    origin,
    destination,
    waypoints,
    distance,
    estimatedDuration,
    waypointCount,
  };
}

export function estimateDistance(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = []
): number {
  if (origin.lng !== undefined && origin.lat !== undefined &&
      destination.lng !== undefined && destination.lat !== undefined) {
    let total = haversineDistance(origin.lng, origin.lat, destination.lng, destination.lat);
    let prev = origin;
    for (const wp of waypoints) {
      if (wp.lng !== undefined && wp.lat !== undefined && prev.lng !== undefined && prev.lat !== undefined) {
        total += haversineDistance(prev.lng, prev.lat, wp.lng, wp.lat);
        prev = wp;
      }
    }
    return Math.round(total * 1.15 * 10) / 10;
  }

  const baseDistance = 500;
  const waypointExtra = waypoints.length * 30;
  return baseDistance + waypointExtra;
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
