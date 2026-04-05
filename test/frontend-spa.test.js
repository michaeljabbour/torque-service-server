/**
 * RED test: Server SPA serving behavior.
 *
 * Verifies that:
 * - express.static(frontendDir) serves static assets
 * - GET / returns index.html (via static middleware)
 * - GET /login returns index.html (via SPA catch-all)
 * - API routes (/health) still work
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer } from '../index.js';
import { get, startServer, stopServer } from './helpers.js';

// Minimal registry stub
function makeRegistry() {
  return {
    activeBundles: () => [],
    bundleManifest: () => ({ api: null, ui: null }),
    bundleInstance: () => null,
    bundleDir: () => null,
  };
}

function makeEventBus() {
  return {
    recentEvents: () => [],
  };
}

describe('Server SPA frontend serving', () => {
  let server;
  let port;
  let frontendDir;

  before(async () => {
    // Create temp dir with index.html and an asset
    frontendDir = mkdtempSync(join(tmpdir(), 'spa-test-'));
    writeFileSync(join(frontendDir, 'index.html'), '<html><body><div id="root"></div></body></html>');
    mkdirSync(join(frontendDir, 'assets'), { recursive: true });
    writeFileSync(join(frontendDir, 'assets', 'main.js'), 'console.log("main")');

    const registry = makeRegistry();
    const eventBus = makeEventBus();
    const app = await createServer(registry, eventBus, { frontendDir });

    ({ server, port } = await startServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('GET / returns 200 with index.html content (via express.static)', async () => {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<div id="root">'), `Expected <div id="root"> in: ${res.body}`);
  });

  it('GET /login returns 200 with index.html (SPA catch-all)', async () => {
    const res = await get(port, '/login');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<div id="root">'), `Expected <div id="root"> in: ${res.body}`);
  });

  it('GET /assets/main.js returns 200 (static asset)', async () => {
    const res = await get(port, '/assets/main.js');
    assert.equal(res.status, 200);
  });

  it('GET /health returns 200 JSON (API routes not broken)', async () => {
    const res = await get(port, '/health');
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.status, 'ok');
  });
});
