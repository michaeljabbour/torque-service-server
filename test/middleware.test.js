import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../index.js';

function createMockRegistry() {
  return {
    bundles: {},
    interfaces: {},
    dataLayer: { schemas: {} },
    _loadedContexts: {},
    _agents: [],
    _appliedBehaviors: [],
    mountPlan: { app: { name: 'test-app' } },
    activeBundles() { return []; },
    bundleInstance(name) { return undefined; },
    bundleManifest(name) { return {}; },
    bundleDir(name) { return undefined; },
  };
}

function createMockEventBus() {
  return {
    recentEvents(n) { return []; },
    subscriptions() { return {}; },
  };
}

function startServer(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('request_id middleware', () => {
  let server, port;

  before(async () => {
    const registry = createMockRegistry();
    const eventBus = createMockEventBus();
    const app = await createServer(registry, eventBus, { silent: true });
    ({ server, port } = await startServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('adds X-Request-Id header to every response', async () => {
    const res = await request(port, '/health');
    assert.ok(res.headers['x-request-id'], 'Response should have X-Request-Id header');
  });

  it('generates unique request IDs', async () => {
    const res1 = await request(port, '/health');
    const res2 = await request(port, '/health');
    const id1 = res1.headers['x-request-id'];
    const id2 = res2.headers['x-request-id'];
    assert.ok(id1, 'First request should have X-Request-Id');
    assert.ok(id2, 'Second request should have X-Request-Id');
    assert.notEqual(id1, id2, 'Request IDs should be unique');
  });

  it('preserves client-provided X-Request-Id', async () => {
    const clientId = 'my-custom-request-id-12345';
    const res = await request(port, '/health', { headers: { 'x-request-id': clientId } });
    assert.equal(res.headers['x-request-id'], clientId, 'Client-provided X-Request-Id should be preserved');
  });
});

describe('middleware config', () => {
  it('accepts middleware options without crashing', async () => {
    const registry = createMockRegistry();
    const eventBus = createMockEventBus();
    const app = await createServer(registry, eventBus, {
      silent: true,
      middleware: {
        request_id: true,
        request_logging: false,
        compression: false,
        rate_limit: false,
      },
    });
    assert.ok(app, 'Server should be created without errors');
  });
});
