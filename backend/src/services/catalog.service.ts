import { Prisma, type StatusEquipamento, type PrismaClient } from '@prisma/client';
import { createCatalogRepository } from '../repositories/catalog.repository.js';
import { hasValidContractDates } from '../domain/contracts.js';
import { calculateRecoveredValues } from '../domain/financial.js';

export class CatalogBusinessError extends Error {
  constructor(public readonly code: 'INVALID_CONTRACT_DATES' | 'NOT_FOUND' | 'VERSION_CONFLICT') {
    super(code === 'INVALID_CONTRACT_DATES'
      ? 'A data de término não pode ser anterior à data de início'
      : code === 'NOT_FOUND' ? 'Contrato não encontrado' : 'Contrato não encontrado ou versão desatualizada');
    this.name = 'CatalogBusinessError';
  }
}

export function createCatalogService(db: PrismaClient) {
  const repository = createCatalogRepository(db);
  return {
    async dashboard() {
      const [counts, recoveredValues] = await Promise.all([repository.dashboard(), repository.recoveredValues()]);
      const [organizacoes, lotes, equipamentos, emTriagem, recuperados, reciclados] = counts;
      return {
        organizacoes, lotes, equipamentos, emTriagem, recuperados, reciclados,
        financeiro: calculateRecoveredValues(recoveredValues),
      };
    },
    listOrganizations(page: number, limit: number, query?: string) {
      const where: Prisma.OrganizacaoWhereInput = query
        ? { OR: [{ nome: { contains: query, mode: 'insensitive' } }, { cnpj: { contains: query } }] }
        : {};
      return repository.organizations.list(where, (page - 1) * limit, limit).then(([data, total]) => ({ data, total, page, limit }));
    },
    createOrganization(data: Prisma.OrganizacaoCreateInput) { return repository.organizations.create(data); },
    getOrganization(id: string) { return repository.organizations.find(id); },
    updateOrganization(id: string, version: number, data: Prisma.OrganizacaoUpdateManyMutationInput) {
      return repository.organizations.update(id, version, { ...data, versao: { increment: 1 } });
    },
    findOrganization(id: string) { return repository.organizations.get(id); },
    deleteOrganization(id: string) { return repository.organizations.delete(id); },
    listContracts(page: number, limit: number, query?: string) {
      const where: Prisma.ContratoWhereInput = query
        ? { OR: [{ numero: { contains: query, mode: 'insensitive' } }, { descricao: { contains: query, mode: 'insensitive' } }] }
        : {};
      return repository.contracts.list(where, (page - 1) * limit, limit).then(([data, total]) => ({ data, total, page, limit }));
    },
    createContract(input: {
      numero: string;
      descricao?: string;
      dataInicio: Date;
      dataFim?: Date;
      valorTotal?: number;
      clausulas?: unknown;
      organizacaoId: string;
    }) {
      if (!hasValidContractDates(input.dataInicio, input.dataFim)) {
        throw new CatalogBusinessError('INVALID_CONTRACT_DATES');
      }
      const { valorTotal, clausulas, organizacaoId, ...fields } = input;
      return repository.contracts.create({
        ...fields,
        organizacao: { connect: { id: organizacaoId } },
        valorTotal: valorTotal === undefined ? undefined : new Prisma.Decimal(valorTotal),
        clausulas: clausulas === undefined ? undefined : clausulas === null ? Prisma.DbNull : clausulas as Prisma.InputJsonValue,
      });
    },
    async updateContractVersioned(id: string, version: number, input: {
      numero?: string;
      descricao?: string | null;
      dataInicio?: Date;
      dataFim?: Date | null;
      valorTotal?: number | null;
      clausulas?: unknown;
      organizacaoId?: string;
    }) {
      return db.$transaction(async (tx) => {
        const txRepository = createCatalogRepository(tx);
        const existing = await txRepository.contracts.findForUpdate(id);
        if (!existing) throw new CatalogBusinessError('NOT_FOUND');
        if (existing.versao !== version) throw new CatalogBusinessError('VERSION_CONFLICT');
        const dataInicio = input.dataInicio ?? existing.dataInicio;
        const dataFim = input.dataFim === undefined ? existing.dataFim : input.dataFim;
        if (!hasValidContractDates(dataInicio, dataFim)) throw new CatalogBusinessError('INVALID_CONTRACT_DATES');
        const { valorTotal, clausulas, ...fields } = input;
        const data: Prisma.ContratoUpdateManyMutationInput = {
          ...fields,
          ...(valorTotal === undefined ? {} : { valorTotal: valorTotal === null ? null : new Prisma.Decimal(valorTotal) }),
          ...(clausulas === undefined ? {} : { clausulas: clausulas === null ? Prisma.DbNull : clausulas as Prisma.InputJsonValue }),
          versao: { increment: 1 },
        };
        const changed = await txRepository.contracts.update(id, version, data);
        if (!changed.count) throw new CatalogBusinessError('VERSION_CONFLICT');
        return txRepository.contracts.find(id);
      });
    },
    getContract(id: string) { return repository.contracts.find(id); },
    deleteContract(id: string) { return repository.contracts.delete(id); },
    listLots(page: number, limit: number, query?: string) {
      const where: Prisma.LoteWhereInput = query
        ? { OR: [{ codigo: { contains: query, mode: 'insensitive' } }, { descricao: { contains: query, mode: 'insensitive' } }] }
        : {};
      return repository.lots.list(where, (page - 1) * limit, limit).then(([data, total]) => ({ data, total, page, limit }));
    },
    createLot(input: { codigo: string; descricao?: string; organizacaoId: string }) {
      const { organizacaoId, ...data } = input;
      return repository.lots.create({ ...data, organizacao: { connect: { id: organizacaoId } } });
    },
    createLotWithEquipment(input: {
      codigo: string;
      descricao?: string;
      organizacaoId: string;
      equipamentos: Array<{
        codigoBarrasInterno: string;
        nome: string;
        categoria?: string;
        fabricante?: string;
        modelo?: string;
        numeroSerie?: string;
        pesoKg?: number;
        valorRecuperado?: number;
        observacoes?: string;
      }>;
    }) {
      const { organizacaoId, equipamentos, ...lot } = input;
      return repository.lots.createWithEquipment({
        ...lot,
        organizacao: { connect: { id: organizacaoId } },
        equipamentos: {
          create: equipamentos.map(({ pesoKg, valorRecuperado, ...equipment }) => ({
            ...equipment,
            ...(pesoKg === undefined ? {} : { pesoKg: new Prisma.Decimal(pesoKg) }),
            ...(valorRecuperado === undefined ? {} : { valorRecuperado: new Prisma.Decimal(valorRecuperado) }),
            movimentacoes: {
              create: { tipo: 'RECEBIMENTO', statusNovo: 'RECEBIDO', descricao: 'Equipamento cadastrado no lote' },
            },
          })),
        },
      });
    },
    updateLot(id: string, version: number, data: Prisma.LoteUpdateManyMutationInput) {
      return repository.lots.update(id, version, { ...data, versao: { increment: 1 } });
    },
    getLot(id: string) { return repository.lots.find(id); },
    deleteLot(id: string) { return repository.lots.delete(id); },
    listEquipment(page: number, limit: number, status?: StatusEquipamento, query?: string) {
      const where: Prisma.EquipamentoWhereInput = {
        ...(status ? { status } : {}),
        ...(query ? { OR: [{ nome: { contains: query, mode: 'insensitive' } }, { codigoBarrasInterno: { contains: query, mode: 'insensitive' } }] } : {}),
      };
      return repository.equipment.list(where, (page - 1) * limit, limit).then(([data, total]) => ({ data, total, page, limit, ...(status ? { status } : {}), ...(query ? { q: query } : {}) }));
    },
    createEquipment(input: {
      codigoBarrasInterno: string;
      nome: string;
      categoria?: string;
      fabricante?: string;
      modelo?: string;
      numeroSerie?: string;
      pesoKg?: number;
      valorRecuperado?: number;
      loteId: string;
      observacoes?: string;
    }) {
      const { loteId, pesoKg, valorRecuperado, ...data } = input;
      return repository.equipment.createWithInitialMovement({
        ...data,
        lote: { connect: { id: loteId } },
        pesoKg: pesoKg === undefined ? undefined : new Prisma.Decimal(pesoKg),
        valorRecuperado: valorRecuperado === undefined ? undefined : new Prisma.Decimal(valorRecuperado),
      });
    },
    updateEquipment(id: string, version: number, data: Prisma.EquipamentoUpdateManyMutationInput) {
      return repository.equipment.update(id, version, { ...data, versao: { increment: 1 } });
    },
    getEquipment(id: string) { return repository.equipment.find(id); },
    equipmentMovements(id: string) { return repository.equipment.movements(id); },
    listMovements(page: number, limit: number, query?: string) {
      const where: Prisma.MovimentacaoWhereInput = query
        ? { OR: [{ responsavel: { contains: query, mode: 'insensitive' } }, { descricao: { contains: query, mode: 'insensitive' } }, { equipamento: { nome: { contains: query, mode: 'insensitive' } } }, { equipamento: { codigoBarrasInterno: { contains: query, mode: 'insensitive' } } }] }
        : {};
      return repository.movements.list(where, (page - 1) * limit, limit).then(([data, total]) => ({ data, total, page, limit, ...(query ? { q: query } : {}) }));
    },
  };
}
