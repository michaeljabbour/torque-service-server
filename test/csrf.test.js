/**
 * CSRF middleware tests — TDD for the CSRF bypass fix.
 *
 * Bug: when a CSRF cookie is present but the x-csrf-token header is absent,
 * the original code silently passes (because `csrfCookie && csrfHeader` is falsy).
 *
 * Fix: add a check BEFORE the mismatch check:
 *   if (csrfCookie && !csrfHeader) → 403 'CSRF token missing'
 */

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

/**
 * Make an HTTP request with custom headers (including Cookie).
 */
function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method || 'POST',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

describe('CSRF middleware', () => {
  let server, port;
  let originalNodeEnv;

  before(async () => {
    // Enable production mode so the CSRF middleware is activated
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const registry = createMockRegistry();
    const eventBus = createMockEventBus();
    const app = await createServer(registry, eventBus, { silent: true });
    ({ server, port } = await startServer(app));
  });

  after(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await stopServer(server);
  });

  it('returns 403 when CSRF cookie is present but x-csrf-token header is absent', async () => {
    const res = await request(port, '/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__torque_csrf=abc123',
        // Deliberately NOT sending x-csrf-token header
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 403, `Expected 403 but got ${res.status}: ${res.body}`);
    const json = JSON.parse(res.body);
    assert.equal(json.error, 'CSRF token missing');
  });

  it('returns 403 when CSRF cookie and header do not match', async () => {
    const res = await request(port, '/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__torque_csrf=abc123',
        'x-csrf-token': 'wrong-token',
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 403, `Expected 403 but got ${res.status}: ${res.body}`);
    const json = JSON.parse(res.body);
    assert.equal(json.error, 'CSRF token mismatch');
  });

  it('passes through when CSRF cookie and header match', async () => {
    const token = 'matching-token-abc123';
    const res = await request(port, '/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `__torque_csrf=${token}`,
        'x-csrf-token': token,
      },
      body: JSON.stringify({}),
    });
    // Should NOT be blocked by CSRF (404 is fine — route doesn't exist)
    assert.notEqual(res.status, 403, `CSRF should not block matching tokens, but got 403: ${res.body}`);
  });

  it('passes through when no CSRF cookie is present (no session)', async () => {
    const res = await request(port, '/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No Cookie header at all
      },
      body: JSON.stringify({}),
    });
    // Should NOT be blocked by CSRF (404 is fine — route doesn't exist)
    assert.notEqual(res.status, 403, `CSRF should not block cookieless requests, but got 403: ${res.body}`);
  });

  it('passes through for GET requests regardless of CSRF state', async () => {
    const res = await request(port, '/api/records', {
      method: 'GET',
      headers: {
        Cookie: '__torque_csrf=abc123',
        // No x-csrf-token header
      },
    });
    // GET is safe — no CSRF check
    assert.notEqual(res.status, 403, `CSRF should not block GET requests, but got 403: ${res.body}`);
  });

  it('passes through for sign_in paths even with cookie but no header', async () => {
    const res = await request(port, '/api/identity/sign_in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__torque_csrf=abc123',
        // No x-csrf-token header — exempt because it's sign_in
      },
      body: JSON.stringify({ email: 'a@b.com', password: 'pw' }),
    });
    // sign_in is exempt from CSRF checks
    assert.notEqual(res.status, 403, `sign_in path should be exempt from CSRF, but got 403: ${res.body}`);
  });
});
