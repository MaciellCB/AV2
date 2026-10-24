import type { Prisma, PrismaClient, StatusEquipamento } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export function createCatalogRepository(db: DbClient) {
  return {
    dashboard() {
      return Promise.all([
        db.organizacao.count(),
        db.lote.count(),
        db.equipamento.count(),
        db.equipamento.count({ where: { status: 'EM_TRIAGEM' } }),
        db.equipamento.count({ where: { status: 'RECONDICIONADO' } }),
        db.equipamento.count({ where: { status: 'RECICLAGEM' } }),
      ]);
    },
    async recoveredValues() {
      const groups = await db.equipamento.groupBy({
        by: ['status'],
        _sum: { valorRecuperado: true },
      });
      return groups.map((group) => ({
        status: group.status as StatusEquipamento,
        value: group._sum.valorRecuperado,
      }));
    },
    organizations: {
      list(where: Prisma.OrganizacaoWhereInput, skip: number, take: number) {
        return Promise.all([
          db.organizacao.findMany({ where, skip, take, orderBy: { criadoEm: 'desc' }, include: { contrato: true, _count: { select: { lotes: true } } } }),
          db.organizacao.count({ where }),
        ]);
      },
      create(data: Prisma.OrganizacaoCreateInput) { return db.organizacao.create({ data }); },
      find(id: string) { return db.organizacao.findUnique({ where: { id }, include: { contrato: true, lotes: { include: { _count: { select: { equipamentos: true } } } } } }); },
      update(id: string, versao: number, data: Prisma.OrganizacaoUpdateManyMutationInput) {
        return db.organizacao.updateMany({ where: { id, versao }, data });
      },
      get(id: string) { return db.organizacao.findUnique({ where: { id } }); },
      delete(id: string) { return db.organizacao.delete({ where: { id } }); },
    },
    contracts: {
      list(where: Prisma.ContratoWhereInput, skip: number, take: number) {
        return Promise.all([
          db.contrato.findMany({ where, skip, take, include: { organizacao: { select: { id: true, nome: true, cnpj: true } } }, orderBy: { criadoEm: 'desc' } }),
          db.contrato.count({ where }),
        ]);
      },
      create(data: Prisma.ContratoCreateInput) { return db.contrato.create({ data }); },
      findForUpdate(id: string) { return db.contrato.findUnique({ where: { id }, select: { dataInicio: true, dataFim: true, versao: true } }); },
      update(id: string, versao: number, data: Prisma.ContratoUpdateManyMutationInput) {
        return db.contrato.updateMany({ where: { id, versao }, data });
      },
      find(id: string) { return db.contrato.findUnique({ where: { id }, include: { organizacao: { select: { id: true, nome: true, cnpj: true } } } }); },
      delete(id: string) { return db.contrato.delete({ where: { id } }); },
    },
    lots: {
      list(where: Prisma.LoteWhereInput, skip: number, take: number) {
        return Promise.all([
          db.lote.findMany({ where, skip, take, include: { organizacao: { select: { id: true, nome: true } }, _count: { select: { equipamentos: true } } }, orderBy: { criadoEm: 'desc' } }),
          db.lote.count({ where }),
        ]);
      },
      create(data: Prisma.LoteCreateInput) { return db.lote.create({ data }); },
      createWithEquipment(data: Prisma.LoteCreateInput) {
        return db.lote.create({
          data,
          include: { equipamentos: { include: { movimentacoes: true } } },
        });
      },
      update(id: string, versao: number, data: Prisma.LoteUpdateManyMutationInput) {
        return db.lote.updateMany({ where: { id, versao }, data });
      },
      find(id: string) { return db.lote.findUnique({ where: { id }, include: { organizacao: { select: { id: true, nome: true } } } }); },
      delete(id: string) { return db.lote.delete({ where: { id } }); },
    },
    equipment: {
      list(where: Prisma.EquipamentoWhereInput, skip: number, take: number) {
        return Promise.all([
          db.equipamento.findMany({ where, skip, take, include: { lote: { include: { organizacao: { select: { nome: true } } } } }, orderBy: { criadoEm: 'desc' } }),
          db.equipamento.count({ where }),
        ]);
      },
      async createWithInitialMovement(data: Prisma.EquipamentoCreateInput) {
        const create = async (tx: Prisma.TransactionClient) => {
          const item = await tx.equipamento.create({ data });
          await tx.movimentacao.create({ data: { equipamentoId: item.id, tipo: 'RECEBIMENTO', statusNovo: 'RECEBIDO', descricao: 'Equipamento cadastrado no sistema' } });
          return item;
        };
        return '$transaction' in db ? db.$transaction(create) : create(db);
      },
      update(id: string, versao: number, data: Prisma.EquipamentoUpdateManyMutationInput) {
        return db.equipamento.updateMany({ where: { id, versao }, data });
      },
      find(id: string) { return db.equipamento.findUnique({ where: { id } }); },
      movements(equipamentoId: string) { return db.movimentacao.findMany({ where: { equipamentoId }, orderBy: { data: 'desc' } }); },
    },
    movements: {
      list(where: Prisma.MovimentacaoWhereInput, skip: number, take: number) {
        return Promise.all([
          db.movimentacao.findMany({ where, skip, take, include: { equipamento: { select: { id: true, nome: true, codigoBarrasInterno: true } } }, orderBy: { data: 'desc' } }),
          db.movimentacao.count({ where }),
        ]);
      },
    },
  };
}
