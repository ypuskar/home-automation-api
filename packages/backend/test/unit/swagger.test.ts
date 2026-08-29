import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import swaggerPlugin from '../../src/plugins/swagger.js';

describe('Swagger Plugin (OpenAPI)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(swaggerPlugin);

    // Register a sample route so swagger has something to document.
    // In @fastify/swagger v9+, routes must be defined after the swagger plugin
    // is registered for them to appear in the generated spec.
    app.get('/api/sample', {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              hello: { type: 'string' },
            },
          },
        },
      },
    }, async () => ({ hello: 'world' }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves OpenAPI JSON at /api/docs/json', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs/json',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info.title).toBe('Home Automation API');
    expect(body.info.version).toBe('1.0.0');
  });

  it('generates valid OpenAPI spec structure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs/json',
    });

    const body = response.json();
    // The spec should have the standard OpenAPI structure
    expect(body).toHaveProperty('openapi');
    expect(body).toHaveProperty('info');
    expect(body).toHaveProperty('paths');
  });

  it('does not expose internal credentials or sensitive config', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs/json',
    });

    const text = response.body;
    expect(text).not.toContain('password');
    expect(text).not.toContain('DB_PASSWORD');
    expect(text).not.toContain('privkey.pem');
  });

  it('serves Swagger UI at /api/docs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs/',
    });

    // Swagger UI returns 200 with HTML
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});
