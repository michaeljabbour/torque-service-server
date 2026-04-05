# @torquedev/server

Express server factory that auto-wires HTTP routes, introspection endpoints, and SPA hosting from a Torque registry.

## Install

```bash
npm install @torquedev/server
```

Or via git dependency:

```bash
npm install git+https://github.com/torque-framework/torque-service-server.git
```

Peer dependency: `express`

## Usage

```js
import { createServer } from '@torquedev/server';

const app = createServer(registry, eventBus, {
  frontendDir: './dist',
  authResolver: (req) => req.user,
  silent: false,
});

app.listen(3000);
```

## API

### `createServer(registry, eventBus, opts)`

Returns a configured Express app with all routes auto-wired.

**Options:**

| Option | Description |
|---|---|
| `frontendDir` | Directory to serve as a SPA. Falls back to `index.html` for client-side routing. |
| `hookBus` | Hook bus instance for lifecycle events. |
| `authResolver` | Injectable auth function — called on routes that set `requireAuth`. |
| `silent` | Suppress startup logging. |

## Auto-Wired System Routes

| Route | Description |
|---|---|
| `GET /health` | Health check. |
| `GET /api/manifest` | Returns the combined manifest of all active bundles. |
| `GET /api/events` | Lists registered events and subscriptions. |
| `GET /api/introspect` | Full system introspection — bundles, routes, events, schemas. |

## Security

### HTTP Hardening

The server applies security-relevant HTTP headers and request policies by default:

- **[helmet](https://helmetjs.github.io/)** -- Sets protective HTTP headers (e.g., `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`).
- **CORS** -- Cross-Origin Resource Sharing is configurable via the `cors` option. When omitted the default Express CORS behavior applies; pass a `cors` options object to restrict origins, methods, or headers.

### Authentication Enforcement

Different route categories have different authentication requirements:

| Route category | Auth requirement |
|---|---|
| System introspection routes (`/api/manifest`, `/api/events`, `/api/introspect`) | Require `systemAuth` — a separate resolver for internal/admin access. |
| Intent endpoints (`POST /api/intents/:bundle/:intentKey`) | Require a valid `authResolver` result; unauthenticated requests receive `401 Unauthorized`. |
| Bundle routes with `auth: true` in manifest | Gated through the configured `authResolver`. Requests without a resolved user are rejected with `401 Unauthorized`. |
| `GET /health` | Always public — no authentication required. |

### Error Handling

When a route handler (or the `authResolver`) throws an `AuthorizationError`, the server catches it and returns an `HTTP 403 Forbidden` response with the error's `code` and `message` in the response body. All other unhandled errors return `HTTP 500 Internal Server Error`.

## Bundle Routes

Routes declared in each bundle's `manifest.api.routes[]` are auto-registered on the Express app. The server iterates all active bundles in the registry, reads each manifest, looks up the handler from `instance.routes()`, and registers it on Express. Routes that set `requireAuth` are gated through the configured `authResolver`.

## Intent Routes

```
POST /api/intents/:bundle/:intentKey
```

Intent endpoints let bundles expose named intents that can be invoked externally.

## Static Assets

- **Bundle UI** — served from `/bundles/:bundleName` for per-bundle frontend assets.
- **SPA fallback** — when `frontendDir` is set, unmatched routes fall back to `index.html`.

## Hook Integration

When a `hookBus` is provided, the server emits lifecycle hooks:

| Hook | When |
|---|---|
| `route:before` | Before a route handler executes. |
| `route:after` | After a route handler completes. |
| `route:error` | When a route handler throws. |
| `idd:intent_invoked` | When an intent endpoint is called. |

## Scaffold UI (Generic Descriptor Renderer)

When no `frontendDir` is provided, the server renders a built-in scaffold UI that dynamically loads bundle views. This is a **generic renderer** with zero app-specific code:

1. Reads `ui.routes` from all bundle manifests to build a route table
2. Reads `ui.navigation` from all manifests to build the nav bar
3. Detects auth bundles (bundles with `validateToken` interface) and auto-redirects to login
4. Dynamically `import()`s bundle UI scripts from `/bundles/<name>/ui/index.js`
5. Calls view functions which return descriptor objects `{ type, props, children }`
6. Renders descriptors to vanilla DOM elements with full `sx` prop support

### Supported Descriptor Types

`stack`, `grid`, `text`, `text-field`, `inline-edit`, `button`, `form`, `card`, `badge`, `alert`, `divider`, `spinner`, `icon`, `modal`, `tab-bar`, `stat-card`, `progress-bar`, `avatar`, `avatar-stack`, `select`, `filter-dropdown`, `checklist`, `kanban-board`, `kanban-list`, `kanban-card`, `workspace-card`, `board-card`, `mini-bar`, `sparkline`

### SSR Skeleton (Feature B7)

The scaffold injects a pre-rendered nav + loading spinner into the initial HTML so users see content before JS loads.

### Theme Support

Dark/light/system themes via CSS custom properties. Persisted in `localStorage`.

## Request Validation (Feature 18)

Routes can declare validation rules in the manifest:

```yaml
api:
  routes:
    - method: POST
      path: /api/cards
      handler: createCard
      auth: true
      validate:
        body:
          name: { type: string, required: true, min_length: 1, max_length: 500 }
          listId: { type: uuid, required: true }
          priority: { type: integer, min: 0, max: 10 }
          status: { type: string, enum: [active, archived] }
          email: { type: string, pattern: email }
```

The server auto-injects validation middleware before the handler. Failed validation returns `422`:

```json
{
  "error": "Validation failed",
  "errors": [
    { "field": "name", "rule": "required", "message": "name is required" },
    { "field": "priority", "rule": "min", "message": "priority must be at least 0" }
  ]
}
```

### Supported Validation Rules

| Rule | Description |
|------|-------------|
| `required` | Field must be present and non-empty |
| `type` | `string`, `integer`, `float`, `boolean`, `uuid` |
| `min_length` / `max_length` | String length constraints |
| `min` / `max` | Numeric range constraints |
| `pattern` | `"email"` or any regex pattern |
| `enum` | Value must be one of the listed options |

## httpOnly Cookie Auth (Feature B8)

In production (`NODE_ENV=production`), the server sets auth tokens as httpOnly cookies:

- Login response sets `__torque_session` cookie (httpOnly, Secure, SameSite=Strict)
- CSRF token set as readable cookie `__torque_csrf`
- Mutation requests (POST/PATCH/PUT/DELETE) validate CSRF header vs cookie
- Falls back to Bearer header auth in development

## Smart Caching (Feature B2)

Bundle UI scripts served from `/bundles/<name>/` have environment-aware caching:

- **Development:** `Cache-Control: no-store` (instant reload on changes)
- **Production:** ETag + `max-age: 1d` (revalidation with 304 Not Modified)

## Details

- ESM-only
- Tests: `node --test`

## Torque Framework

Part of the [Torque](https://github.com/torque-framework/torque) composable monolith framework.

## License

MIT -- see [LICENSE](./LICENSE)
