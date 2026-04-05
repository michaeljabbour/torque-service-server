import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAPISpec } from '../openapi.js';

// Helper: build a minimal introspect response
function makeIntrospect(bundles) {
  return {
    app: { name: 'Test App', version: '1.0.0', description: 'A test app' },
    bundles,
  };
}

describe('generateOpenAPISpec', () => {
  it('generates valid OpenAPI 3.1 structure with correct paths for GET/POST/PATCH/DELETE routes', () => {
    const introspect = makeIntrospect({
      items: {
        version: '0.1.0',
        description: 'Items bundle',
        api: {
          routes: [
            { method: 'GET', path: '/api/items', handler: 'list' },
            { method: 'POST', path: '/api/items', handler: 'create' },
            { method: 'GET', path: '/api/items/:id', handler: 'show' },
            { method: 'PATCH', path: '/api/items/:id', handler: 'update' },
            { method: 'DELETE', path: '/api/items/:id', handler: 'destroy' },
          ],
        },
      },
    });

    const spec = generateOpenAPISpec(introspect);

    // Top-level structure
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(spec.info, 'spec should have info');
    assert.ok(spec.paths, 'spec should have paths');

    // Paths converted from Express to OpenAPI syntax
    assert.ok(spec.paths['/api/items'], 'should have /api/items path');
    assert.ok(spec.paths['/api/items/{id}'], 'should have /api/items/{id} path (not :id)');
    assert.ok(!spec.paths['/api/items/:id'], 'should NOT have Express-style :id path');

    // Methods present
    assert.ok(spec.paths['/api/items'].get, 'GET /api/items should exist');
    assert.ok(spec.paths['/api/items'].post, 'POST /api/items should exist');
    assert.ok(spec.paths['/api/items/{id}'].get, 'GET /api/items/{id} should exist');
    assert.ok(spec.paths['/api/items/{id}'].patch, 'PATCH /api/items/{id} should exist');
    assert.ok(spec.paths['/api/items/{id}'].delete, 'DELETE /api/items/{id} should exist');

    // Operations tagged by bundle name
    assert.deepEqual(spec.paths['/api/items'].get.tags, ['items']);
    assert.deepEqual(spec.paths['/api/items/{id}'].patch.tags, ['items']);

    // operationId as bundleName_handler
    assert.equal(spec.paths['/api/items'].get.operationId, 'items_list');
    assert.equal(spec.paths['/api/items'].post.operationId, 'items_create');
    assert.equal(spec.paths['/api/items/{id}'].get.operationId, 'items_show');
  });

  it('maps validate.body rules to request body JSON Schema correctly', () => {
    const introspect = makeIntrospect({
      tasks: {
        version: '0.1.0',
        description: 'Tasks bundle',
        api: {
          routes: [
            {
              method: 'POST',
              path: '/api/tasks',
              handler: 'create',
              validate: {
                body: {
                  title: { type: 'string', required: true, min_length: 1, max_length: 500 },
                  priority: { type: 'integer', min: 0, max: 10 },
                  status: { type: 'string', enum: ['todo', 'done', 'in_progress'] },
                  email: { type: 'string', pattern: 'email' },
                },
              },
            },
          ],
        },
      },
    });

    const spec = generateOpenAPISpec(introspect);
    const op = spec.paths['/api/tasks'].post;

    assert.ok(op.requestBody, 'POST should have requestBody');
    const schema = op.requestBody.content['application/json'].schema;
    assert.ok(schema.properties, 'schema should have properties');

    // title: string with minLength/maxLength, required
    assert.equal(schema.properties.title.type, 'string');
    assert.equal(schema.properties.title.minLength, 1);
    assert.equal(schema.properties.title.maxLength, 500);

    // priority: integer with minimum/maximum
    assert.equal(schema.properties.priority.type, 'integer');
    assert.equal(schema.properties.priority.minimum, 0);
    assert.equal(schema.properties.priority.maximum, 10);

    // status: enum passthrough
    assert.deepEqual(schema.properties.status.enum, ['todo', 'done', 'in_progress']);

    // email: format:email from pattern:'email'
    assert.equal(schema.properties.email.format, 'email');

    // required array from required:true fields
    assert.ok(Array.isArray(schema.required), 'schema.required should be an array');
    assert.ok(schema.required.includes('title'), 'title should be in required array');
  });

  it('adds bearerAuth security scheme when routes have auth: true', () => {
    const introspect = makeIntrospect({
      secure: {
        version: '0.1.0',
        description: 'Secure bundle',
        api: {
          routes: [
            { method: 'GET', path: '/api/secure/data', handler: 'getData', auth: true },
            { method: 'GET', path: '/api/public/data', handler: 'publicData', auth: false },
          ],
        },
      },
    });

    const spec = generateOpenAPISpec(introspect);

    // Security scheme should be in components
    assert.ok(spec.components, 'spec should have components when auth routes exist');
    assert.ok(spec.components.securitySchemes, 'components should have securitySchemes');
    assert.ok(spec.components.securitySchemes.bearerAuth, 'should have bearerAuth scheme');
    assert.equal(spec.components.securitySchemes.bearerAuth.type, 'http');
    assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');

    // The auth route should reference the security scheme
    const secureOp = spec.paths['/api/secure/data'].get;
    assert.ok(secureOp.security, 'authenticated operation should have security field');
  });

  it('converts Express :param to OpenAPI {param} syntax with multiple path parameters', () => {
    const introspect = makeIntrospect({
      nested: {
        version: '0.1.0',
        description: 'Nested bundle',
        api: {
          routes: [
            { method: 'GET', path: '/api/orgs/:orgId/projects/:projectId/tasks/:taskId', handler: 'show' },
          ],
        },
      },
    });

    const spec = generateOpenAPISpec(introspect);

    // Path should be converted
    const expectedPath = '/api/orgs/{orgId}/projects/{projectId}/tasks/{taskId}';
    assert.ok(spec.paths[expectedPath], `should have path ${expectedPath}`);
    assert.ok(!spec.paths['/api/orgs/:orgId/projects/:projectId/tasks/:taskId'], 'should NOT have Express-style path');

    const op = spec.paths[expectedPath].get;
    assert.ok(op.parameters, 'operation should have parameters');

    // All three path params should be present
    const paramNames = op.parameters.map(p => p.name);
    assert.ok(paramNames.includes('orgId'), 'should include orgId param');
    assert.ok(paramNames.includes('projectId'), 'should include projectId param');
    assert.ok(paramNames.includes('taskId'), 'should include taskId param');

    // Each should be in: 'path' and required: true
    for (const param of op.parameters) {
      assert.equal(param.in, 'path', `${param.name} should be in: 'path'`);
      assert.equal(param.required, true, `${param.name} should be required: true`);
    }
  });
});
