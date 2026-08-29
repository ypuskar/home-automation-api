/**
 * Swagger/OpenAPI plugin for Fastify.
 * Registers @fastify/swagger (spec generation) and @fastify/swagger-ui (interactive docs).
 *
 * GET /api/docs — Swagger UI interface
 * GET /api/docs/json — raw OpenAPI 3.0 JSON spec
 *
 * The spec is auto-generated from registered route schemas.
 * No internal implementation details or credentials are exposed.
 *
 * Requirements: 7a.1, 7a.2, 7a.3
 */

import type { FastifyPluginAsync } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Home Automation API',
        version: '1.0.0',
        description: 'API for the home automation system — temperature monitoring, heating period history, and system health.',
      },
      servers: [
        {
          url: 'https://kilde27.hopto.org:4000',
          description: 'Production (Raspberry Pi)',
        },
      ],
      tags: [
        { name: 'history', description: 'Historical temperature and heating data' },
        { name: 'health', description: 'System health and uptime' },
        { name: 'sse', description: 'Real-time Server-Sent Events' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUI, {
    routePrefix: '/api/docs',
  });
};

export default swaggerPlugin;
