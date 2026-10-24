import type { FastifyInstance } from 'fastify';
import { Prisma, Papel } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../server.js';
import { createUserService, UserManagementError } from '../services/user.service.js';

const userInput = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email().transform((value) => value.toLowerCase()),
  senha: z.string().min(10).max(128),
  papel: z.nativeEnum(Papel),
});
const userUpdateInput = z.object({
  nome: z.string().min(2).max(120).optional(),
  email: z.string().email().transform((value) => value.toLowerCase()).optional(),
  senha: z.string().min(10).max(128).optional(),
  papel: z.nativeEnum(Papel).optional(),
  ativo: z.boolean().optional(),
  versao: z.number().int().positive(),
});
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  const service = createUserService(prisma);
  app.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: 'Autenticação necessária' });
    }
    const userId = (request.user as { sub?: string }).sub;
    const user = userId ? await service.accessState(userId) : null;
    if (!user?.ativo) return reply.code(401).send({ erro: 'Sessão inválida ou usuário inativo' });
    if (user.papel !== 'ADMINISTRADOR') return reply.code(403).send({ erro: 'Apenas administradores podem gerenciar usuários' });
  });

  app.get('/usuarios', async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ erro: 'Parâmetros inválidos', detalhes: parsed.error.flatten() });
    const { page, limit, q } = parsed.data;
    return service.list(page, limit, q);
  });

  app.post('/usuarios', async (request, reply) => {
    const parsed = userInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: parsed.error.flatten() });
    try {
      const { senha, ...data } = parsed.data;
      return reply.code(201).send(await service.create({ ...data, senhaHash: await bcrypt.hash(senha, 12) }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({ erro: 'E-mail já cadastrado' });
      }
      throw error;
    }
  });

  app.put('/usuarios/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const parsed = userUpdateInput.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ erro: 'ID ou dados inválidos', detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const { versao, senha, ...data } = parsed.data;
    try {
      const usuario = await service.update({
        id: params.data.id,
        versao,
        actorId: (request.user as { sub: string }).sub,
        data: { ...data, ...(senha ? { senhaHash: await bcrypt.hash(senha, 12) } : {}) },
      });
      return { usuario };
    } catch (error) {
      if (error instanceof UserManagementError) {
        const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'VERSION_CONFLICT' ? 409 : 400;
        const messages = {
          NOT_FOUND: 'Usuário não encontrado',
          VERSION_CONFLICT: 'Versão desatualizada; atualize os dados',
          LAST_ADMIN: 'Não é permitido desativar ou rebaixar o último administrador ativo',
          SELF_CHANGE: 'Não é permitido desativar ou rebaixar a própria conta',
        };
        return reply.code(status).send({ erro: messages[error.code] });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({ erro: 'E-mail já cadastrado' });
      }
      throw error;
    }
  });

  app.delete('/usuarios/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ erro: 'ID inválido' });
    try {
      await service.remove(params.data.id, (request.user as { sub: string }).sub);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof UserManagementError) {
        if (error.code === 'NOT_FOUND') return reply.code(404).send({ erro: 'Usuário não encontrado' });
        if (error.code === 'LAST_ADMIN') return reply.code(400).send({ erro: 'Não é permitido excluir o último administrador ativo' });
        if (error.code === 'SELF_CHANGE') return reply.code(400).send({ erro: 'Não é permitido excluir a própria conta' });
        return reply.code(409).send({ erro: 'Conflito ao atualizar usuário' });
      }
      throw error;
    }
  });
}
