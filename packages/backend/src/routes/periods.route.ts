/**
 * Heat periods history route plugin for Fastify.
 * GET /api/periods — returns historical heat period records with day-range pagination.
 *
 * Pagination: start = page × limit days ago, end = (page × limit + limit) days ago.
 * So page=0, limit=10 returns last 10 days; page=1, limit=10 returns 10–20 days ago.
 *
 * Returns 400 if no records found for the requested range.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import type { FastifyPluginAsync } from 'fastify';
import type { IBackendDBService } from '../services/db.service.js';

export interface PeriodsRouteOptions {
  dbService: IBackendDBService;
}

const querySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 0, default: 0 },
    limit: { type: 'integer', minimum: 1, default: 10 },
  },
} as const;

const periodsRoute: FastifyPluginAsync<PeriodsRouteOptions> = async (fastify, opts) => {
  fastify.get<{
    Querystring: { page: number; limit: number };
  }>('/api/periods', {
    schema: {
      querystring: querySchema,
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              room: { type: 'string' },
              period: { type: 'integer' },
              start: { type: 'integer' },
              end: { type: 'integer' },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { page, limit } = request.query;

    const records = await opts.dbService.getHeatPeriods({ page, limit });

    if (records.length === 0) {
      return reply.status(400).send({ error: 'No records found for the requested range' });
    }

    return records;
  });
};

export default periodsRoute;
