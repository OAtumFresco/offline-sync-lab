import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createStore, RequestError } from './store.js';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/outbox.js', ['outbox.js', 'text/javascript; charset=utf-8']],
  ['/sync.js', ['sync.js', 'text/javascript; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Use application/json.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 4096) throw new RequestError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'Invalid JSON.'); }
}

export function createLabServer({ store = createStore(), allowFaults = false } = {}) {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      // This is a local teaching server, not a public deployment.
      const host = request.headers.host ?? '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
        throw new RequestError(403, 'Use a loopback hostname.');
      }
      if (request.headers.origin && request.headers.origin !== `http://${host}`) {
        throw new RequestError(403, 'Cross-origin requests are not allowed.');
      }
      const path = new URL(request.url, `http://${host}`).pathname;
      if (request.method === 'GET' && path === '/api/notes') {
        return json(response, 200, { notes: store.list() });
      }
      if (request.method === 'POST' && path === '/api/notes') {
        const body = await readBody(request);
        const result = store.apply(request.headers['idempotency-key'], body);
        if (allowFaults && request.headers['x-demo-drop-response'] === 'once' && !result.replayed) {
          // Deliberately commit, then lose the acknowledgement. The next retry is safe.
          request.socket.destroy();
          return;
        }
        return json(response, result.replayed ? 200 : 201, result);
      }
      const asset = assets.get(path);
      if (request.method === 'GET' && asset) {
        const data = await readFile(resolve(publicDirectory, asset[0]));
        response.writeHead(200, { 'Content-Type': asset[1] });
        return response.end(data);
      }
      json(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (!response.destroyed) {
        json(response, error.status ?? 500, { error: error.status ? error.message : 'The operation could not be completed. Retry with the same key.' });
      }
    }
  });
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = fileURLToPath(new URL('../.data/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const store = createStore(new DatabaseSync(resolve(directory, 'notes.sqlite')));
  const { server } = createLabServer({ store, allowFaults: true });
  const port = Number(process.env.LAB_PORT ?? 4178);
  server.listen(port, '127.0.0.1', () => {
    console.log(`Offline Sync Lab: http://127.0.0.1:${server.address().port}`);
  });
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    server.close(() => store.close());
    server.closeAllConnections();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
