import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../server.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const parsed = z.object({ email: z.string().email(), senha: z.string().min(8) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: parsed.error.flatten() });
    const usuario = await prisma.usuario.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!usuario || !usuario.ativo || !(await bcrypt.compare(parsed.data.senha, usuario.senhaHash))) {
      return reply.code(401).send({ erro: 'E-mail ou senha inválidos' });
    }
    const token = app.jwt.sign({ sub: usuario.id, papel: usuario.papel, nome: usuario.nome }, { expiresIn: '8h' });
    return { token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel } };
  });
  app.get('/me', { preHandler: [(app as any).authenticate] }, async (request: any, reply) => {
    const user = request.user as { sub: string };
    const usuario = await prisma.usuario.findUnique({ where: { id: user.sub }, select: { id: true, nome: true, email: true, papel: true, ativo: true } });
    if (!usuario || !usuario.ativo) return reply.code(401).send({ erro: 'Sessão inválida ou usuário inativo' });
    return { usuario };
  });
}
