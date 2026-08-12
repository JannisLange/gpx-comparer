import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import archiveStatusHandler from './api/archive-status.js';
import tripFileHandler from './api/trip-file.js';
import tripsHandler from './api/trips.js';

const port = Number(process.env.PORT || 8000);
const root = resolve('.');
const apiHandlers = new Map([
  ['/api/archive-status', archiveStatusHandler],
  ['/api/trip-file', tripFileHandler],
  ['/api/trips', tripsHandler]
]);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const apiHandler = apiHandlers.get(url.pathname);
  if (apiHandler) return apiHandler(request, response);

  try {
    const relativePath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return respondText(response, 403, 'Forbidden');
    const body = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') return respondText(response, 404, 'Not found');
    console.error(error);
    return respondText(response, 500, 'Unexpected server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`GPX Route Comparer running at http://127.0.0.1:${port}`);
});

function respondText(response, statusCode, message) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}
