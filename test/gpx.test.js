import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTripMetrics, parseGpx, processGpx } from '../lib/gpx.js';

const fixture = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
  <trkpt lat="52.0000" lon="13.0000"><ele>10</ele><time>2026-01-01T08:00:00Z</time></trkpt>
  <trkpt lat="52.0010" lon="13.0000"><ele>12</ele><time>2026-01-01T08:00:10Z</time></trkpt>
  <trkpt lat="52.0010" lon="13.0000"><ele>12</ele><time>2026-01-01T08:00:20Z</time></trkpt>
  <trkpt lat="52.0020" lon="13.0000"><ele>11</ele><time>2026-01-01T08:00:30Z</time></trkpt>
</trkseg></trk></gpx>`;

test('parses GPX track points and derives leaderboard metrics', () => {
  const {points, metrics} = processGpx(fixture);
  assert.equal(points.length, 4);
  assert.equal(metrics.elapsedTimeS, 30);
  assert.equal(metrics.movingTimeS, 20);
  assert.equal(metrics.stoppedTimeS, 10);
  assert.equal(metrics.elevationGainM, 2);
  assert.ok(metrics.distanceM > 220 && metrics.distanceM < 223);
  assert.equal(metrics.recordedAt, '2026-01-01T08:00:00.000Z');
});

test('rejects tracks without enough timestamps', () => {
  const points = parseGpx('<gpx><trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk></gpx>');
  assert.throws(() => calculateTripMetrics(points), /timestamped/);
});
