import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { userRoutes } from './routes/users.js';

export const prisma = new PrismaClient();

export async function buildApp() {
  const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
  if (process.env.NODE_ENV === 'production' && !frontendOrigin) {
    throw new Error('Configure FRONTEND_ORIGIN com a origem autorizada do frontend em produção');
  }
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { validation?: unknown; code?: string; statusCode?: number };
    if (err.name === 'ZodError' || err.validation) {
      return reply.code(400).send({ erro: 'Dados ou parâmetros inválidos' });
    }
    const statusCode = err.statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ erro: statusCode === 400 ? 'Dados ou parâmetros inválidos' : 'Requisição inválida' });
    }
    app.log.error({ err, requestId: request.id }, 'Falha não tratada na API');
    return reply.code(500).send({ erro: 'Erro interno do servidor' });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ erro: 'Endpoint não encontrado' });
  });

  await app.register(cors, { origin: frontendOrigin ?? true });
  await app.register(sensible);
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres no arquivo .env');
  }
  await app.register(jwt, { secret: process.env.JWT_SECRET });
  app.decorate('authenticate', async function (request: any, reply: any) {
    try { await request.jwtVerify(); } catch { return reply.unauthorized('Token ausente ou inválido'); }
  });
  app.get('/health', async () => ({ status: 'ok', service: 'greencode-api' }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(apiRoutes, { prefix: '/api' });
  await app.register(userRoutes, { prefix: '/api/admin' });
  return app;
}

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3333);
  const host = process.env.HOST ?? '0.0.0.0';
  try { await app.listen({ port, host }); }
  catch (error) { app.log.error(error); await prisma.$disconnect(); process.exit(1); }

  const shutdown = async () => { await app.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await start();
}
