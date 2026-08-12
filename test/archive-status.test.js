import test from 'node:test';
import assert from 'node:assert/strict';
import {readCommuteConfig} from '../api/archive-status.js';

test('reads valid commute endpoints and clamps the matching radius', () => {
  assert.deepEqual(readCommuteConfig({
    COMMUTE_HOME_LAT: '50.1',
    COMMUTE_HOME_LON: '8.2',
    COMMUTE_WORK_LAT: '50.3',
    COMMUTE_WORK_LON: '8.4',
    COMMUTE_ENDPOINT_RADIUS_M: '50'
  }), {
    home: {lat: 50.1, lon: 8.2},
    work: {lat: 50.3, lon: 8.4},
    endpointRadiusM: 100
  });
});

test('disables endpoint suggestions when a coordinate is missing or invalid', () => {
  assert.equal(readCommuteConfig({COMMUTE_HOME_LAT: '50'}), null);
  assert.equal(readCommuteConfig({
    COMMUTE_HOME_LAT: '91', COMMUTE_HOME_LON: '8', COMMUTE_WORK_LAT: '50', COMMUTE_WORK_LON: '8'
  }), null);
});
