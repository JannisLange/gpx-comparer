import { XMLParser } from 'fast-xml-parser';

export const MOVING_SPEED_THRESHOLD_MPS = 0.5;
export const PROCESSING_VERSION = 1;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true
});

const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

export function parseGpx(xmlText) {
  let document;
  try {
    document = parser.parse(xmlText);
  } catch {
    throw new Error('The uploaded file is not valid GPX/XML.');
  }

  const tracks = asArray(document?.gpx?.trk);
  const rawPoints = tracks.flatMap((track) => asArray(track.trkseg).flatMap((segment) => asArray(segment.trkpt)));
  const points = rawPoints.map((point) => ({
    lat: Number(point['@_lat']),
    lon: Number(point['@_lon']),
    ele: Number(point.ele ?? 0),
    time: point.time ? Date.parse(String(point.time)) : NaN
  })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (points.length < 2) throw new Error('The GPX file must contain at least two track points.');
  return points;
}

export function calculateTripMetrics(points) {
  let distanceM = 0;
  let movingTimeS = 0;
  let maxSpeedMps = 0;
  let elevationGainM = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentDistanceM = haversineM(previous, current);
    distanceM += segmentDistanceM;

    if (Number.isFinite(previous.ele) && Number.isFinite(current.ele) && current.ele > previous.ele) {
      elevationGainM += current.ele - previous.ele;
    }

    const segmentTimeS = Number.isFinite(previous.time) && Number.isFinite(current.time)
      ? (current.time - previous.time) / 1000
      : NaN;
    if (segmentTimeS <= 0) continue;
    const speedMps = segmentDistanceM / segmentTimeS;
    maxSpeedMps = Math.max(maxSpeedMps, speedMps);
    if (speedMps >= MOVING_SPEED_THRESHOLD_MPS) movingTimeS += segmentTimeS;
  }

  const timedPoints = points.filter((point) => Number.isFinite(point.time));
  if (timedPoints.length < 2) throw new Error('The GPX file must contain at least two timestamped track points.');
  const elapsedTimeS = Math.max(0, (timedPoints.at(-1).time - timedPoints[0].time) / 1000);
  if (elapsedTimeS <= 0) throw new Error('The GPX timestamps do not describe a positive trip duration.');

  return {
    recordedAt: new Date(timedPoints[0].time).toISOString(),
    distanceM,
    elapsedTimeS,
    movingTimeS,
    stoppedTimeS: Math.max(0, elapsedTimeS - movingTimeS),
    averageSpeedMps: distanceM / elapsedTimeS,
    movingAverageMps: movingTimeS > 0 ? distanceM / movingTimeS : 0,
    maxSpeedMps,
    elevationGainM,
    pointCount: points.length,
    processingVersion: PROCESSING_VERSION
  };
}

export function processGpx(xmlText) {
  const points = parseGpx(xmlText);
  return {points, metrics: calculateTripMetrics(points)};
}

function haversineM(a, b) {
  const earthRadiusM = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lon - a.lon);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(value));
}
