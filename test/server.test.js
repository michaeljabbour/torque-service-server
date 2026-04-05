import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../index.js';
import { get, startServer, stopServer } from './helpers.js';

function createMockRegistry(bundles = {}) {
  const bundleStore = {};
  const interfaces = {};
  for (const [name, { manifest, instance }] of Object.entries(bundles)) {
    bundleStore[name] = { manifest, instance, config: {}, dir: `bundles/${name}` };
    if (instance.interfaces) {
      for (const [ifaceName, handler] of Object.entries(instance.interfaces())) {
        interfaces[`${name}.${ifaceName}`] = handler;
      }
    }
  }
  return {
    bundles: bundleStore,
    interfaces,
    dataLayer: { schemas: {} },
    _loadedContexts: {},
    _agents: [],
    _appliedBehaviors: [],
    mountPlan: { app: { name: 'test-app' } },
    activeBundles() { return Object.keys(bundleStore); },
    bundleInstance(name) { return bundleStore[name]?.instance; },
    bundleManifest(name) { return bundleStore[name]?.manifest; },
    bundleDir(name) { return bundleStore[name]?.dir; },
  };
}

function createMockEventBus() {
  return {
    recentEvents(n) { return []; },
    subscriptions() { return {}; },
  };
}

// A bundle with one auth-protected route, for use in auth resolver tests
function createProtectedBundle() {
  return {
    manifest: {
      api: { routes: [{ method: 'GET', path: '/api/protected', handler: 'protected', auth: true }] },
    },
    instance: {
      routes: () => ({ protected: async (ctx) => ({ status: 200, data: { ok: true } }) }),
    },
  };
}

describe('createServer', () => {
  describe('system endpoints', () => {
    let server, port;

    before(async () => {
      const registry = createMockRegistry();
      const eventBus = createMockEventBus();
      const app = await createServer(registry, eventBus);
      ({ server, port } = await startServer(app));
    });

    after(async () => {
      await stopServer(server);
    });

    it('GET /health returns ok status', async () => {
      const res = await get(port, '/health');
      assert.equal(res.status, 200);
      assert.equal(JSON.parse(res.body).status, 'ok');
    });

    it('GET /api/manifest returns bundle manifests', async () => {
      const res = await get(port, '/api/manifest');
      assert.equal(res.status, 200);
      assert.doesNotThrow(() => JSON.parse(res.body));
    });

    it('GET /api/events returns recent events', async () => {
      const res = await get(port, '/api/events');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(JSON.parse(res.body)));
    });

    it('GET /api/introspect returns full introspection', async () => {
      const res = await get(port, '/api/introspect');
      assert.equal(res.status, 200);
      const json = JSON.parse(res.body);
      assert.ok('bundles' in json);
      assert.ok('boot_state' in json);
    });

    it('GET /openapi.json returns valid OpenAPI spec', async () => {
      const res = await get(port, '/openapi.json');
      assert.equal(res.status, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.openapi, '3.1.0');
      assert.ok(json.info, 'spec should have info');
      assert.ok(json.paths, 'spec should have paths');
    });
  });

  describe('route:beforeResponse hook', () => {
    it('emits route:beforeResponse with correct payload before sending response', async () => {
      const emitted = [];
      const mockHookBus = {
        emit: async (event, payload) => { emitted.push({ event, payload }); },
        emitSync: (event, payload) => { emitted.push({ event, payload }); },
      };

      const registry = createMockRegistry({
        'hook-test-bundle': {
          manifest: {
            api: { routes: [{ method: 'GET', path: '/api/hook-test', handler: 'hookTest' }] },
          },
          instance: {
            routes: () => ({ hookTest: async (ctx) => ({ status: 200, data: { hello: 'world' } }) }),
          },
        },
      });

      const eventBus = createMockEventBus();
      const app = await createServer(registry, eventBus, { hookBus: mockHookBus, silent: true });
      const { server, port } = await startServer(app);

      try {
        const res = await get(port, '/api/hook-test');
        assert.equal(res.status, 200);

        const beforeResponse = emitted.find(e => e.event === 'route:beforeResponse');
        assert.ok(beforeResponse, 'route:beforeResponse hook should be emitted');
        assert.equal(beforeResponse.payload.bundle, 'hook-test-bundle');
        assert.equal(beforeResponse.payload.handler, 'hookTest');
        assert.equal(beforeResponse.payload.method, 'get');
        assert.equal(beforeResponse.payload.path, '/api/hook-test');
        assert.equal(beforeResponse.payload.status, 200);
        assert.deepEqual(beforeResponse.payload.data, { hello: 'world' });
        assert.ok(typeof beforeResponse.payload.durationMs === 'number', 'durationMs should be a number');
        assert.ok('requestId' in beforeResponse.payload, 'requestId should be present in payload');
      } finally {
        await stopServer(server);
      }
    });

    it('does not throw when hookBus is not provided (hook-free route still responds)', async () => {
      const registry = createMockRegistry({
        'no-hook-bundle': {
          manifest: {
            api: { routes: [{ method: 'GET', path: '/api/no-hook', handler: 'noHook' }] },
          },
          instance: {
            routes: () => ({ noHook: async (ctx) => ({ status: 200, data: { ok: true } }) }),
          },
        },
      });

      const eventBus = createMockEventBus();
      // No hookBus passed
      const app = await createServer(registry, eventBus, { silent: true });
      const { server, port } = await startServer(app);

      try {
        const res = await get(port, '/api/no-hook');
        assert.equal(res.status, 200, 'Route should still work without hookBus');
        assert.deepEqual(JSON.parse(res.body), { ok: true });
      } finally {
        await stopServer(server);
      }
    });
  });

  describe('auth resolver', () => {
    it('default authResolver sets currentUser to null (protected routes return 401)', async () => {
      const registry = createMockRegistry({ 'test-bundle': createProtectedBundle() });
      const eventBus = createMockEventBus();
      const app = await createServer(registry, eventBus);
      const { server, port } = await startServer(app);
      try {
        const res = await get(port, '/api/protected');
        assert.equal(res.status, 401, 'Protected route should return 401 when no authResolver is provided');
      } finally {
        await stopServer(server);
      }
    });

    it('custom authResolver populates req.currentUser (protected routes return 200)', async () => {
      const registry = createMockRegistry({ 'test-bundle': createProtectedBundle() });
      const eventBus = createMockEventBus();
      const app = await createServer(registry, eventBus, {
        authResolver: (req, reg) => ({ id: 'u1', name: 'Test User' }),
      });
      const { server, port } = await startServer(app);
      try {
        const res = await get(port, '/api/protected');
        assert.equal(res.status, 200, 'Protected route should return 200 when authResolver provides a user');
      } finally {
        await stopServer(server);
      }
    });
  });
});
