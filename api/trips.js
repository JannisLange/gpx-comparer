import { randomUUID } from 'node:crypto';
import { processGpx } from '../lib/gpx.js';
import { decodeHeader, handleApiError, readBody, safeFileName, sendJson } from '../lib/http.js';
import { getSupabaseAdmin, storageBucket } from '../lib/supabase-admin.js';
import { normalizeTripDetails, validateTripId } from '../lib/trip-details.js';

export const config = {api: {bodyParser: false}};

const selectedFields = 'id, original_filename, recorded_at, direction, route_name, bike_setup, notes, distance_m, elapsed_time_s, moving_time_s, stopped_time_s, average_speed_mps, moving_average_mps, max_speed_mps, elevation_gain_m, point_count, processing_version, created_at';

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') return await listTrips(request, response);
    if (request.method === 'POST') return await createTrip(request, response);
    if (request.method === 'PATCH') return await updateTrip(request, response);
    response.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(response, 405, {error: 'Method not allowed.'});
  } catch (error) {
    return handleApiError(response, error);
  }
}

async function updateTrip(request, response) {
  const tripId = new URL(request.url, 'http://localhost').searchParams.get('id');
  if (!validateTripId(tripId)) {
    const error = new Error('A valid trip id is required.');
    error.statusCode = 400;
    throw error;
  }

  const contentType = String(request.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    const error = new Error('Trip updates must use application/json.');
    error.statusCode = 415;
    throw error;
  }

  let submitted;
  try {
    submitted = JSON.parse((await readBody(request)).toString('utf8'));
  } catch {
    const error = new Error('The trip update is not valid JSON.');
    error.statusCode = 400;
    throw error;
  }
  const updates = normalizeTripDetails(submitted);
  const supabase = getSupabaseAdmin();
  const {data, error} = await supabase
    .from('trips')
    .update(updates)
    .eq('id', tripId)
    .select(selectedFields)
    .single();
  if (error) {
    const updateError = new Error(error.code === 'PGRST116' ? 'Trip not found.' : `Could not update trip: ${error.message}`);
    updateError.statusCode = error.code === 'PGRST116' ? 404 : 500;
    throw updateError;
  }
  return sendJson(response, 200, {trip: data});
}

async function listTrips(request, response) {
  const supabase = getSupabaseAdmin();
  const requestedLimit = Number(new URL(request.url, 'http://localhost').searchParams.get('limit') || 250);
  const limit = Math.max(1, Math.min(500, requestedLimit));
  const {data, error} = await supabase
    .from('trips')
    .select(selectedFields)
    .order('recorded_at', {ascending: false, nullsFirst: false})
    .limit(limit);
  if (error) throw new Error(`Could not load trips: ${error.message}`);
  return sendJson(response, 200, {trips: data});
}

async function createTrip(request, response) {
  const contentType = String(request.headers['content-type'] || '');
  if (!contentType.includes('gpx') && !contentType.includes('xml') && !contentType.includes('octet-stream')) {
    const error = new Error('Upload a GPX/XML file.');
    error.statusCode = 415;
    throw error;
  }

  const body = await readBody(request);
  if (!body.length) {
    const error = new Error('The uploaded GPX file is empty.');
    error.statusCode = 400;
    throw error;
  }

  const originalFilename = safeFileName(decodeHeader(request.headers['x-gpx-filename'], 'trip.gpx'));
  if (!decodeHeader(request.headers['x-gpx-filename'], '').toLowerCase().endsWith('.gpx')) {
    const error = new Error('The uploaded file must use the .gpx extension.');
    error.statusCode = 400;
    throw error;
  }
  const direction = normalizeDirection(decodeHeader(request.headers['x-trip-direction'], 'other'));
  const routeName = cleanOptional(decodeHeader(request.headers['x-route-name']), 100);
  const bikeSetup = cleanOptional(decodeHeader(request.headers['x-bike-setup']), 100);
  const notes = cleanOptional(decodeHeader(request.headers['x-trip-notes']), 1000);
  const {metrics} = processGpx(body.toString('utf8'));
  const tripId = randomUUID();
  const recordedDate = new Date(metrics.recordedAt);
  const storagePath = `trips/${recordedDate.getUTCFullYear()}/${String(recordedDate.getUTCMonth() + 1).padStart(2, '0')}/${tripId}-${originalFilename}`;
  const supabase = getSupabaseAdmin();

  const {error: uploadError} = await supabase.storage.from(storageBucket()).upload(storagePath, body, {
    contentType: 'application/gpx+xml',
    upsert: false
  });
  if (uploadError) throw new Error(`Could not store GPX file: ${uploadError.message}`);

  const record = {
    id: tripId,
    storage_path: storagePath,
    original_filename: originalFilename,
    recorded_at: metrics.recordedAt,
    direction,
    route_name: routeName,
    bike_setup: bikeSetup,
    notes,
    distance_m: metrics.distanceM,
    elapsed_time_s: metrics.elapsedTimeS,
    moving_time_s: metrics.movingTimeS,
    stopped_time_s: metrics.stoppedTimeS,
    average_speed_mps: metrics.averageSpeedMps,
    moving_average_mps: metrics.movingAverageMps,
    max_speed_mps: metrics.maxSpeedMps,
    elevation_gain_m: metrics.elevationGainM,
    point_count: metrics.pointCount,
    processing_version: metrics.processingVersion
  };

  const {data, error: insertError} = await supabase.from('trips').insert(record).select(selectedFields).single();
  if (insertError) {
    await supabase.storage.from(storageBucket()).remove([storagePath]);
    throw new Error(`Could not create trip record: ${insertError.message}`);
  }
  return sendJson(response, 201, {trip: data});
}

function normalizeDirection(value) {
  return ['work_to_home', 'home_to_work', 'other'].includes(value) ? value : 'other';
}

function cleanOptional(value, maxLength) {
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}
