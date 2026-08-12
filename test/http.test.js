import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { decodeHeader, readBody, safeFileName } from '../lib/http.js';

test('reads a raw streamed GPX request body', async () => {
  const request = Readable.from([Buffer.from('<gpx>'), Buffer.from('</gpx>')]);
  assert.equal((await readBody(request)).toString(), '<gpx></gpx>');
});

test('rejects request bodies over the Vercel-safe upload limit', async () => {
  await assert.rejects(() => readBody({body: Buffer.alloc(4 * 1024 * 1024 + 1)}), /4 MB/);
});

test('normalizes upload metadata', () => {
  assert.equal(decodeHeader('Canal%20route'), 'Canal route');
  assert.equal(safeFileName('../../Morning ride.gpx'), 'Morning-ride.gpx');
});
