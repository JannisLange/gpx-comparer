const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

export async function readBody(request) {
  if (Buffer.isBuffer(request.body)) return enforceBodyLimit(request.body);
  if (typeof request.body === 'string') return enforceBodyLimit(Buffer.from(request.body));
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      const error = new Error('The GPX file exceeds the 4 MB upload limit.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function enforceBodyLimit(buffer) {
  if (buffer.length <= MAX_UPLOAD_BYTES) return buffer;
  const error = new Error('The GPX file exceeds the 4 MB upload limit.');
  error.statusCode = 413;
  throw error;
}

export function decodeHeader(value, fallback = '') {
  if (!value) return fallback;
  try {
    return decodeURIComponent(Array.isArray(value) ? value[0] : value);
  } catch {
    return fallback;
  }
}

export function safeFileName(value) {
  const baseName = value.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
  return baseName.toLowerCase().endsWith('.gpx') ? baseName : `${baseName || 'trip'}.gpx`;
}

export function handleApiError(response, error) {
  console.error(error);
  sendJson(response, error.statusCode || 500, {error: error.message || 'Unexpected server error.'});
}
