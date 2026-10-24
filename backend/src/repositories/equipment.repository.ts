import type { Prisma, PrismaClient } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export const equipmentRepository = {
  findById(db: DbClient, id: string) {
    return db.equipamento.findUnique({ where: { id } });
  },
  updateVersioned(db: DbClient, id: string, version: number, status: Prisma.EquipamentoUpdateManyMutationInput['status']) {
    return db.equipamento.updateMany({
      where: { id, versao: version },
      data: { status, versao: { increment: 1 } },
    });
  },
  createMovement(db: DbClient, data: Prisma.MovimentacaoUncheckedCreateInput) {
    return db.movimentacao.create({ data });
  },
};
