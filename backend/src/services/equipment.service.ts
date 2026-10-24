import { Prisma, StatusEquipamento } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { canTransition, movementForStatus } from '../domain/equipment-workflow.js';
import { equipmentRepository, type DbClient } from '../repositories/equipment.repository.js';

export class DomainError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'VERSION_CONFLICT' | 'SAME_STATUS', message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export async function transitionEquipment(
  db: DbClient,
  input: { id: string; status: StatusEquipamento; descricao?: string; responsavel?: string; versao?: number },
) {
  const current = await equipmentRepository.findById(db, input.id);
  if (!current) throw new DomainError('NOT_FOUND', 'Equipamento não encontrado');
  if (input.versao !== undefined && current.versao !== input.versao) {
    throw new DomainError('VERSION_CONFLICT', 'Versão desatualizada; atualize os dados');
  }
  if (current.status === input.status) throw new DomainError('SAME_STATUS', 'Equipamento já está nesse status');
  if (!canTransition(current.status, input.status)) {
    throw new DomainError('INVALID_TRANSITION', `Transição não permitida: ${current.status} → ${input.status}`);
  }

  const changed = await equipmentRepository.updateVersioned(db, current.id, current.versao, input.status);
  if (!changed.count) throw new DomainError('VERSION_CONFLICT', 'Conflito de concorrência; atualize os dados e tente novamente');

  await equipmentRepository.createMovement(db, {
    equipamentoId: current.id,
    tipo: movementForStatus[input.status],
    statusAnterior: current.status,
    statusNovo: input.status,
    descricao: input.descricao,
    responsavel: input.responsavel,
  });
  return db.equipamento.findUnique({ where: { id: current.id } });
}

export async function transitionEquipmentAtomically(
  prisma: PrismaClient,
  input: { id: string; status: StatusEquipamento; descricao?: string; responsavel?: string; versao?: number },
) {
  return prisma.$transaction((tx) => transitionEquipment(tx, input));
}
