/**
 * OpenAPI 3.1 spec generator from /api/introspect data.
 */

/** Maps Torque field types to OpenAPI/JSON Schema types */
const TYPE_MAP = {
  string: 'string',
  text: 'string',
  integer: 'integer',
  float: 'number',
  boolean: 'boolean',
  uuid: 'string',
  timestamp: 'string',
  datetime: 'string',
};

/** Maps Torque field types to OpenAPI format hints */
const FORMAT_MAP = {
  uuid: 'uuid',
  timestamp: 'date-time',
  datetime: 'date-time',
  float: 'double',
};

/**
 * Converts validate.body rules from a manifest route into a JSON Schema
 * { properties, required } object.
 *
 * @param {object} rules - validate.body rules object
 * @returns {{ properties: object, required?: string[] }}
 */
function rulesToJsonSchema(rules) {
  const properties = {};
  const required = [];

  for (const [field, spec] of Object.entries(rules)) {
    const prop = {};

    // Map type
    if (spec.type && TYPE_MAP[spec.type]) {
      prop.type = TYPE_MAP[spec.type];
    }

    // Format hint from type
    if (spec.type && FORMAT_MAP[spec.type]) {
      prop.format = FORMAT_MAP[spec.type];
    }

    // String length constraints
    if (spec.min_length !== undefined) prop.minLength = spec.min_length;
    if (spec.max_length !== undefined) prop.maxLength = spec.max_length;

    // Numeric range constraints
    if (spec.min !== undefined) prop.minimum = spec.min;
    if (spec.max !== undefined) prop.maximum = spec.max;

    // Enum passthrough
    if (spec.enum) prop.enum = spec.enum;

    // Email pattern -> format: email
    if (spec.pattern === 'email') {
      prop.format = 'email';
    }

    properties[field] = prop;

    // Collect required fields
    if (spec.required) {
      required.push(field);
    }
  }

  const schema = { properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/**
 * Converts an Express-style path (with :param) to OpenAPI path (with {param}).
 *
 * @param {string} path - Express path, e.g. '/api/items/:id'
 * @returns {string} OpenAPI path, e.g. '/api/items/{id}'
 */
function expressToOpenAPIPath(path) {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/**
 * Extracts path parameter names from an Express-style path.
 *
 * @param {string} path - Express path, e.g. '/api/items/:id'
 * @returns {string[]} Array of param names, e.g. ['id']
 */
function extractPathParams(path) {
  const matches = path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
  return matches.map(m => m.slice(1)); // strip leading ':'
}

/**
 * Generates an OpenAPI 3.1 spec from /api/introspect data.
 *
 * @param {object} introspect - The introspect response object
 * @returns {object} OpenAPI 3.1 spec
 */
export function generateOpenAPISpec(introspect) {
  const { app = {}, bundles = {} } = introspect;

  const paths = {};
  let hasAuthRoutes = false;

  for (const [bundleName, bundle] of Object.entries(bundles)) {
    const routes = bundle.api?.routes || [];

    for (const route of routes) {
      const { method, path: expressPath, handler, auth, validate } = route;
      const openAPIPath = expressToOpenAPIPath(expressPath);
      const httpMethod = method.toLowerCase();

      if (!paths[openAPIPath]) {
        paths[openAPIPath] = {};
      }

      const operation = {
        tags: [bundleName],
        operationId: `${bundleName}_${handler}`,
        responses: {
          '200': { description: 'Success' },
        },
      };

      // Path parameters
      const pathParams = extractPathParams(expressPath);
      if (pathParams.length > 0) {
        operation.parameters = pathParams.map(name => ({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }));
      }

      // Request body from validate.body
      if (validate?.body) {
        const schema = rulesToJsonSchema(validate.body);
        operation.requestBody = {
          required: true,
          content: {
            'application/json': { schema },
          },
        };
      }

      // Auth / security
      if (auth) {
        hasAuthRoutes = true;
        operation.security = [{ bearerAuth: [] }];
      }

      paths[openAPIPath][httpMethod] = operation;
    }
  }

  const spec = {
    openapi: '3.1.0',
    info: {
      title: app.name || 'API',
      version: app.version || '0.0.1',
      description: app.description || '',
    },
    paths,
  };

  if (hasAuthRoutes) {
    spec.components = {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    };
  }

  return spec;
}
