import { sendJson } from '../lib/http.js';

export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, {error: 'Method not allowed.'});
  }
  const configured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
    && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
  return sendJson(response, 200, {configured, commute: readCommuteConfig()});
}

export function readCommuteConfig(environment = process.env) {
  const home = readCoordinate(environment.COMMUTE_HOME_LAT, environment.COMMUTE_HOME_LON);
  const work = readCoordinate(environment.COMMUTE_WORK_LAT, environment.COMMUTE_WORK_LON);
  if (!home || !work) return null;
  const requestedRadius = Number(environment.COMMUTE_ENDPOINT_RADIUS_M || 1000);
  const endpointRadiusM = Number.isFinite(requestedRadius)
    ? Math.max(100, Math.min(5000, requestedRadius))
    : 1000;
  return {home, work, endpointRadiusM};
}

function readCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {lat, lon};
}
