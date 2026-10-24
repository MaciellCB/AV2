import type { Prisma, PrismaClient } from '@prisma/client';

export function createUserRepository(db: PrismaClient | Prisma.TransactionClient) {
  return {
    list(skip: number, take: number, query?: string) {
      const where = query
        ? { OR: [{ nome: { contains: query, mode: 'insensitive' as const } }, { email: { contains: query, mode: 'insensitive' as const } }] }
        : {};
      return Promise.all([
        db.usuario.findMany({
          where,
          skip,
          take,
          orderBy: { criadoEm: 'desc' },
          select: { id: true, nome: true, email: true, papel: true, ativo: true, versao: true, criadoEm: true },
        }),
        db.usuario.count({ where }),
      ]);
    },
    findById(id: string) {
      return db.usuario.findUnique({ where: { id } });
    },
    findByEmail(email: string) {
      return db.usuario.findUnique({ where: { email } });
    },
    findAccessState(id: string) {
      return db.usuario.findUnique({ where: { id }, select: { papel: true, ativo: true } });
    },
    countActiveAdministrators() {
      return db.usuario.count({ where: { papel: 'ADMINISTRADOR', ativo: true } });
    },
    create(data: { nome: string; email: string; senhaHash: string; papel: 'ADMINISTRADOR' | 'OPERADOR' | 'CONSULTA' }) {
      return db.usuario.create({
        data,
        select: { id: true, nome: true, email: true, papel: true, ativo: true, versao: true, criadoEm: true },
      });
    },
    updateVersioned(id: string, versao: number, data: {
      nome?: string;
      email?: string;
      senhaHash?: string;
      papel?: 'ADMINISTRADOR' | 'OPERADOR' | 'CONSULTA';
      ativo?: boolean;
    }) {
      return db.usuario.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
    },
    delete(id: string) {
      return db.usuario.delete({ where: { id } });
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
