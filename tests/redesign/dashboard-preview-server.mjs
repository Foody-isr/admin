import http from 'node:http';
import { createDashboardFixture } from './dashboard-fixture.mjs';
const fixture = createDashboardFixture();
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3103');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-restaurant-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { res.writeHead(400); res.end(); return; }
  const result = fixture.response(req.url, req.method, body, Number(req.headers['x-restaurant-id']) || 1);
  res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.json ?? {}));
});
server.listen(18080, '127.0.0.1', () => console.log('Foody dashboard preview API: synthetic preorders on 127.0.0.1:18080.'));
