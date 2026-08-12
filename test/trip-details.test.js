import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTripDetails, validateTripId} from '../lib/trip-details.js';

test('normalizes editable trip details and permits clearing fields', () => {
  assert.deepEqual(normalizeTripDetails({routeName: '  Canal route ', bikeSetup: '  Gravel tires  '}), {
    route_name: 'Canal route',
    bike_setup: 'Gravel tires'
  });
  assert.deepEqual(normalizeTripDetails({routeName: '', bikeSetup: '   '}), {
    route_name: null,
    bike_setup: null
  });
});

test('rejects invalid trip detail updates', () => {
  assert.throws(() => normalizeTripDetails({routeName: 123, bikeSetup: ''}), /must be text/);
  assert.throws(() => normalizeTripDetails({routeName: 'x'.repeat(101), bikeSetup: ''}), /100 characters/);
});

test('validates trip UUIDs', () => {
  assert.equal(validateTripId('123e4567-e89b-42d3-a456-426614174000'), true);
  assert.equal(validateTripId('../trips'), false);
});
