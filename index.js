import express from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';
import { scaffoldHTML } from './scaffold-ui.js';
import { generateOpenAPISpec } from './openapi.js';

/**
 * Feature 18: Manifest-driven request validation.
 *
 * Validate rules in manifest:
 *   validate:
 *     body:
 *       name: { type: string, required: true, min_length: 1, max_length: 500 }
 *       email: { type: string, required: true, pattern: "email" }
 *       priority: { type: integer, min: 0, max: 10 }
 *
 * @param {object} data - Request body/params
 * @param {object} rules - Validation rules from manifest
 * @returns {Array} Array of error objects { field, rule, message }
 */
function validateBody(data, rules) {
  const errors = [];
  if (!rules || typeof rules !== 'object') return errors;
  if (!data) data = {};

  for (const [field, spec] of Object.entries(rules)) {
    const value = data[field];
    const label = field.replace(/_/g, ' ');

    // Required check
    if (spec.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, rule: 'required', message: `${label} is required` });
      continue;
    }

    // Skip further validation if value is empty and not required
    if (value === undefined || value === null || value === '') continue;

    // Type check
    if (spec.type) {
      const t = spec.type;
      if (t === 'string' && typeof value !== 'string') {
        errors.push({ field, rule: 'type', message: `${label} must be a string` });
      } else if (t === 'integer' && (!Number.isInteger(value) && !Number.isInteger(Number(value)))) {
        errors.push({ field, rule: 'type', message: `${label} must be an integer` });
      } else if (t === 'float' && isNaN(Number(value))) {
        errors.push({ field, rule: 'type', message: `${label} must be a number` });
      } else if (t === 'boolean' && typeof value !== 'boolean' && value !== 0 && value !== 1) {
        errors.push({ field, rule: 'type', message: `${label} must be a boolean` });
      } else if (t === 'uuid' && typeof value === 'string' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        errors.push({ field, rule: 'type', message: `${label} must be a valid UUID` });
      }
    }

    // String length
    if (spec.min_length && typeof value === 'string' && value.length < spec.min_length) {
      errors.push({ field, rule: 'min_length', message: `${label} must be at least ${spec.min_length} characters` });
    }
    if (spec.max_length && typeof value === 'string' && value.length > spec.max_length) {
      errors.push({ field, rule: 'max_length', message: `${label} must be at most ${spec.max_length} characters` });
    }

    // Numeric range
    if (spec.min !== undefined && Number(value) < spec.min) {
      errors.push({ field, rule: 'min', message: `${label} must be at least ${spec.min}` });
    }
    if (spec.max !== undefined && Number(value) > spec.max) {
      errors.push({ field, rule: 'max', message: `${label} must be at most ${spec.max}` });
    }

    // Pattern
    if (spec.pattern === 'email' && typeof value === 'string' && !value.includes('@')) {
      errors.push({ field, rule: 'pattern', message: `${label} must be a valid email` });
    } else if (spec.pattern && spec.pattern !== 'email' && typeof value === 'string') {
      try {
        if (!new RegExp(spec.pattern).test(value)) {
          errors.push({ field, rule: 'pattern', message: `${label} format is invalid` });
        }
      } catch {}
    }

    // Enum
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push({ field, rule: 'enum', message: `${label} must be one of: ${spec.enum.join(', ')}` });
    }
  }

  return errors;
}

/**
 * @param {object} registry - Registry instance
 * @param {object} eventBus - EventBus instance
 * @param {object} [opts]
 * @param {string} [opts.frontendDir] - Path to frontend static files
 * @param {object} [opts.hookBus] - HookBus instance
 * @param {function} [opts.authResolver] - (req, registry) => user|null. Injectable auth policy.
 *   Default: validates Bearer JWT via the 'identity' bundle's validateToken interface.
 */
export async function createServer(registry, eventBus, { frontendDir, hookBus, authResolver, silent = false, middleware = {}, agentRouter } = {}) {
  const app = express();

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled: shell injects inline <script> for config
  }));

  // CORS — restrict origins in production via CORS_ORIGIN env var
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  app.use(express.json());

  // --- Middleware pipeline (configurable from mount plans) ---

  // request_id: ON by default (set middleware.request_id = false to disable)
  if (middleware.request_id !== false) {
    app.use((req, res, next) => {
      const requestId = req.headers['x-request-id'] || crypto.randomUUID();
      req.requestId = requestId;
      res.setHeader('X-Request-Id', requestId);
      next();
    });
  }

  // request_logging: structured JSON logging (opt-in)
  if (middleware.request_logging) {
    app.use((req, res, next) => {
      const start = Date.now();
      const originalEnd = res.end.bind(res);
      res.end = function (...args) {
        const duration_ms = Date.now() - start;
        console.log(JSON.stringify({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms,
          request_id: req.requestId,
        }));
        return originalEnd(...args);
      };
      next();
    });
  }

  // compression: gzip/deflate compression (opt-in, requires 'compression' package)
  if (middleware.compression) {
    try {
      const { default: compression } = await import('compression');
      app.use(compression());
    } catch {
      if (!silent) console.log('[server] compression middleware requested but "compression" package is not installed');
    }
  }

  // rate_limit: request rate limiting (opt-in, requires 'express-rate-limit' package)
  if (middleware.rate_limit) {
    try {
      const { default: rateLimit } = await import('express-rate-limit');
      app.use(rateLimit({
        windowMs: middleware.rate_limit.window_ms || 60 * 1000,
        max: middleware.rate_limit.max_requests || 100,
      }));
    } catch {
      if (!silent) console.log('[server] rate_limit middleware requested but "express-rate-limit" package is not installed');
    }
  }

  // Default auth resolver: no authentication. Apps with auth should provide
  // a custom authResolver (e.g., one that calls identity.validateToken).
  const resolveAuth = authResolver || ((req, reg) => null);
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieAuth = isProduction; // B8: httpOnly cookies in production

  // --- Auth middleware (B8: httpOnly cookie support) ---
  app.use((req, res, next) => {
    // Try httpOnly cookie first, then Bearer header (backwards compatible)
    if (cookieAuth && req.cookies?.__torque_session) {
      req.currentUser = resolveAuth({ headers: { authorization: 'Bearer ' + req.cookies.__torque_session } }, registry);
    } else {
      req.currentUser = resolveAuth(req, registry);
    }
    next();
  });

  // B8: Login endpoint sets httpOnly cookie in production
  if (cookieAuth) {
    const origJson = express.response.json;
    app.use('/api/identity/sign_in', (req, res, next) => {
      const _json = res.json.bind(res);
      res.json = function(data) {
        const token = data?.data?.access_token || data?.access_token;
        if (token && res.statusCode < 400) {
          res.cookie('__torque_session', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
          });
          // Also set CSRF token as readable cookie
          const csrf = crypto.randomBytes(16).toString('hex');
          res.cookie('__torque_csrf', csrf, { sameSite: 'strict', path: '/' });
        }
        return _json(data);
      };
      next();
    });

    // B8: CSRF validation for mutations in production
    app.use((req, res, next) => {
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.path.startsWith('/api/') && !req.path.includes('sign_in')) {
        const csrfCookie = req.cookies?.__torque_csrf;
        const csrfHeader = req.headers['x-csrf-token'];
        if (csrfCookie && csrfHeader && csrfCookie !== csrfHeader) {
          return res.status(403).json({ error: 'CSRF token mismatch' });
        }
      }
      next();
    });
  }

  function requireAuth(req, res, next) {
    if (!req.currentUser) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }

  // --- System auth middleware: requires auth in production ---
  function systemAuth(req, res, next) {
    if (process.env.NODE_ENV === 'production' && !req.currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  }

  // --- System endpoints (kernel-owned, not bundle-owned) ---

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', bundles: registry.activeBundles(), timestamp: new Date().toISOString() });
  });

  app.get('/api/manifest', systemAuth, (req, res) => {
    const result = {};
    for (const name of registry.activeBundles()) {
      const m = registry.bundleManifest(name);
      result[name] = {
        version: m.version,
        description: m.description,
        api: m.api,
        ui: m.ui,
        events: m.events?.publishes?.map(e => e.name),
      };
    }
    res.json(result);
  });

  app.get('/api/events', systemAuth, (req, res) => {
    res.json(eventBus.recentEvents(50));
  });

  app.get('/api/introspect', systemAuth, (req, res) => {
    const bundles = {};
    for (const name of registry.activeBundles()) {
      const m = registry.bundleManifest(name);
      const schema = registry.dataLayer?.schemas?.[name] || {};
      const tables = {};
      for (const [t, def] of Object.entries(schema)) {
        tables[t] = { fullName: def.fullName, columns: def.columns };
      }
      bundles[name] = {
        version: m.version,
        description: m.description,
        tables,
        interfaces: m.interfaces || {},
        events: { publishes: m.events?.publishes || [], subscribes: m.events?.subscribes || [] },
        api: m.api || {},
        behaviors: m.behaviors || [],
        specs: m.specs || [],
        depends_on: m.depends_on || [],
        optional_deps: m.optional_deps || [],
        ui: m.ui || undefined,
      };
    }
    res.json({
      app: registry.mountPlan?.app || {},
      bundles,
      event_subscriptions: eventBus.subscriptions(),
      interfaces_registered: Object.keys(registry.interfaces),
      context_loaded: Object.keys(registry._loadedContexts || {}),
      agents_available: (registry._agents || []).map(a => ({
        name: a.meta?.name || a.bundle, bundle: a.bundle, modes: a.meta?.modes?.map(m => m.name) || [],
      })),
      behaviors_applied: registry._appliedBehaviors || [],
      boot_state: { bundles_active: registry.activeBundles(), timestamp: new Date().toISOString() },
    });
  });

  // --- OpenAPI spec + Swagger UI ---

  const openApiIntrospect = { app: registry.mountPlan?.app || {}, bundles: {} };
  for (const name of registry.activeBundles()) {
    const m = registry.bundleManifest(name);
    openApiIntrospect.bundles[name] = {
      version: m.version,
      description: m.description,
      api: m.api,
    };
  }
  const openApiSpec = generateOpenAPISpec(openApiIntrospect);

  app.get('/openapi.json', (req, res) => {
    res.json(openApiSpec);
  });

  try {
    const swaggerUiDistUrl = import.meta.resolve('swagger-ui-dist');
    const swaggerUiDistDir = fileURLToPath(new URL('.', swaggerUiDistUrl));

    // Redirect /api/docs -> /api/docs/index.html
    app.get('/api/docs', (req, res) => {
      res.redirect('/api/docs/index.html');
    });

    // Override swagger-initializer.js to point at /openapi.json
    app.get('/api/docs/swagger-initializer.js', (req, res) => {
      res.type('application/javascript');
      res.send(`window.onload = function() {
  window.ui = SwaggerUIBundle({
    url: "/openapi.json",
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  });
};`);
    });

    // Serve static Swagger UI files
    app.use('/api/docs', express.static(swaggerUiDistDir));

    if (!silent) console.log('[server] Serving Swagger UI at /api/docs');
  } catch {
    if (!silent) console.log('[server] swagger-ui-dist not available, skipping /api/docs');
  }

  // --- Auto-register bundle routes from manifests ---

  let registeredCount = 0;
  for (const bundleName of registry.activeBundles()) {
    const manifest = registry.bundleManifest(bundleName);
    const instance = registry.bundleInstance(bundleName);

    const apiRoutes = manifest.api?.routes;
    if (!apiRoutes || !instance.routes) continue;

    const routeHandlers = instance.routes();

    for (const route of apiRoutes) {
      const { method, path, handler: handlerName, auth, validate } = route;
      const handlerFn = routeHandlers[handlerName];

      if (!handlerFn) {
        console.warn(`[server] Bundle '${bundleName}' declares route ${method} ${path} -> ${handlerName} but no handler found`);
        continue;
      }

      const middlewares = auth ? [requireAuth] : [];

      // Feature 18: Auto-validate request body from manifest
      if (validate?.body) {
        middlewares.push((req, res, next) => {
          const errors = validateBody(req.body, validate.body);
          if (errors.length > 0) {
            return res.status(422).json({ error: 'Validation failed', errors });
          }
          next();
        });
      }
      if (validate?.params) {
        middlewares.push((req, res, next) => {
          const errors = validateBody(req.params, validate.params);
          if (errors.length > 0) {
            return res.status(422).json({ error: 'Validation failed', errors });
          }
          next();
        });
      }

      const expressMethod = method.toLowerCase();

      app[expressMethod](path, ...middlewares, async (req, res) => {
        const ctx = {
          params: req.params,
          query: req.query,
          body: req.body,
          currentUser: req.currentUser,
        };

        const start = Date.now();
        try {
          // Hook: before route — awaited so async auth hooks (e.g. AuthorizationService) actually block
          if (hookBus) {
            await hookBus.emit('route:before', {
              bundle: bundleName,
              handler: handlerName,
              method: expressMethod,
              path: req.path,
              currentUser: req.currentUser,
            });
          }

          const result = await handlerFn(ctx);
          const status = result?.status || 200;
          const data = result?.data ?? result; // Support { status, data } shape or raw response

          // Hook: after route
          if (hookBus) {
            hookBus.emitSync('route:after', {
              bundle: bundleName,
              handler: handlerName,
              method: expressMethod,
              path: req.path,
              status,
              durationMs: Date.now() - start,
            });
          }

          if (hookBus) {
            await hookBus.emit('route:beforeResponse', {
              bundle: bundleName,
              handler: handlerName,
              method: expressMethod,
              path: req.path,
              status,
              data,
              requestId: req.requestId || null,
              durationMs: Date.now() - start,
            });
          }

          res.status(status).json(data);
        } catch (e) {
          // Auth hooks throw AuthorizationError — return 403 without logging as server error
          if (e.name === 'AuthorizationError') {
            return res.status(403).json({ error: e.message });
          }

          // Hook: route error
          if (hookBus) {
            hookBus.emitSync('route:error', {
              bundle: bundleName,
              handler: handlerName,
              error: e.message,
              durationMs: Date.now() - start,
            });
          }

          console.error(`[server] Error in ${bundleName}.${handlerName}: ${e.message}`);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      registeredCount++;
    }
  }

  if (!silent) console.log(`[server] Auto-registered ${registeredCount} routes from bundle manifests`);

  // --- Auto-register intents as dual-interface APIs ---
  let intentsRegisteredCount = 0;
  for (const bundleName of registry.activeBundles()) {
    const bundle = registry.bundles[bundleName];
    if (!bundle || !bundle.intents) continue;

    for (const [intentKey, intentInstance] of Object.entries(bundle.intents)) {
      const intentPath = `/api/intents/${bundleName}/${intentKey}`;

      app.post(intentPath, requireAuth, async (req, res) => {
        const payload = req.body;

        if (hookBus) {
          hookBus.emitSync('idd:intent_invoked', {
            bundle: bundleName,
            intent: intentKey,
            trigger: intentInstance.trigger,
            payload,
            userId: req.currentUser?.id,
          });
        }

        if (!agentRouter) {
          return res.status(501).json({
            status: 'not_implemented',
            intent: intentKey,
            message: 'Agent runtime is not available. Install @anthropic-ai/claude-agent-sdk to enable intent execution.',
          });
        }

        const result = await agentRouter.execute(bundleName, intentKey, req.body);

        if (result.status === 'success') {
          return res.status(200).json({
            status: 'success',
            output: result.output,
            trace: result.trace,
          });
        } else {
          return res.status(500).json({
            status: 'failed',
            error: result.error instanceof Error ? result.error.message : result.error,
            intent: intentKey,
          });
        }
      });
      intentsRegisteredCount++;
    }
  }

  if (!silent) console.log(`[server] Auto-registered ${intentsRegisteredCount} intents via dual-interface API`);

  // --- Bundle UI scripts (served from resolved bundle directories) ---

  const isDev = process.env.NODE_ENV !== 'production';
  for (const bundleName of registry.activeBundles()) {
    const manifest = registry.bundleManifest(bundleName);
    if (manifest.ui?.script) {
      const bundleDir = registry.bundleDir?.(bundleName);
      if (bundleDir) {
        if (isDev) {
          // Dev mode: no-cache headers so UI changes are picked up on refresh
          app.use(`/bundles/${bundleName}`, (req, res, next) => {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            next();
          }, express.static(bundleDir));
        } else {
          // B2: Production — immutable cache with ETag support
          app.use(`/bundles/${bundleName}`, express.static(bundleDir, {
            maxAge: '1d',
            etag: true,
            lastModified: true,
            immutable: false, // allow revalidation
          }));
        }
      }
    }
  }

  // --- App-level UI overrides (served from app's ui/ directory) ---
  const appUiDir = registry.mountPlan?.app?.ui?.dir || './ui';
  if (existsSync(appUiDir)) {
    app.use('/app-ui', express.static(appUiDir));
    if (!silent) console.log(`[server] Serving app UI overrides from ${appUiDir}`);
  }

  // --- Frontend ---

  if (frontendDir) {
    app.use(express.static(frontendDir));
    app.get('*', (req, res) => { if (req.path.startsWith('/bundles/')) return res.status(404).end(); res.sendFile(join(frontendDir, 'index.html')); });
  } else {
    // Built-in scaffold UI — zero dependencies, vanilla HTML+JS
    // Like Rails scaffold views: functional, shows your data, no build step
    // If a shell middleware is mounted later (by boot.js), it will override this.
    const appName = registry.mountPlan?.app?.name || 'Torque App';
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/bundles/') || req.path.startsWith('/health')) return res.status(404).end();
      res.send(scaffoldHTML(appName, registry));
    });
    if (!silent) console.log(`[server] Serving built-in scaffold UI`);
  }

  return app;
}
