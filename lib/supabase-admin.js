import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    const error = new Error('The trip archive is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to the Vercel project.');
    error.statusCode = 503;
    throw error;
  }
  if (!client) {
    client = createClient(url, secretKey, {
      auth: {autoRefreshToken: false, persistSession: false}
    });
  }
  return client;
}

export const storageBucket = () => process.env.SUPABASE_STORAGE_BUCKET || 'gpx-files';
