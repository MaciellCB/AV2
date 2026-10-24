import { StatusEquipamento, TipoMovimentacao } from '@prisma/client';

export const allowedTransitions: Record<StatusEquipamento, readonly StatusEquipamento[]> = {
  RECEBIDO: ['EM_TRIAGEM'],
  EM_TRIAGEM: ['EM_REPARO', 'RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'],
  EM_REPARO: ['RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'],
  RECONDICIONADO: [],
  RECICLAGEM: [],
  DESCARTADO: [],
};

export const movementForStatus: Record<StatusEquipamento, TipoMovimentacao> = {
  RECEBIDO: 'RECEBIMENTO',
  EM_TRIAGEM: 'TRIAGEM',
  EM_REPARO: 'REPARO',
  RECONDICIONADO: 'RECONDICIONAMENTO',
  RECICLAGEM: 'RECICLAGEM',
  DESCARTADO: 'DESCARTE',
};

export function canTransition(from: StatusEquipamento, to: StatusEquipamento): boolean {
  return allowedTransitions[from].includes(to);
}
