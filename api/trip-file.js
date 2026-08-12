import { handleApiError, sendJson } from '../lib/http.js';
import { getSupabaseAdmin, storageBucket } from '../lib/supabase-admin.js';

export default async function handler(request, response) {
  try {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return sendJson(response, 405, {error: 'Method not allowed.'});
    }
    const id = new URL(request.url, 'http://localhost').searchParams.get('id');
    if (!id) return sendJson(response, 400, {error: 'A trip ID is required.'});

    const supabase = getSupabaseAdmin();
    const {data: trip, error: tripError} = await supabase
      .from('trips')
      .select('storage_path, original_filename')
      .eq('id', id)
      .single();
    if (tripError || !trip) return sendJson(response, 404, {error: 'Trip not found.'});

    const {data: file, error: downloadError} = await supabase.storage.from(storageBucket()).download(trip.storage_path);
    if (downloadError) throw new Error(`Could not download GPX file: ${downloadError.message}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(trip.original_filename)}`);
    return response.end(buffer);
  } catch (error) {
    return handleApiError(response, error);
  }
}
