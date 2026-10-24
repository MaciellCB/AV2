import { Prisma, StatusEquipamento } from '@prisma/client';

export function calculateRecoveredValues(
  rows: Array<{ status: StatusEquipamento; value: Prisma.Decimal | null }>,
) {
  const byStatus = Object.fromEntries(
    Object.values(StatusEquipamento).map((status) => [status, new Prisma.Decimal(0)]),
  ) as Record<StatusEquipamento, Prisma.Decimal>;

  for (const row of rows) {
    if (row.value) byStatus[row.status] = byStatus[row.status].plus(row.value);
  }

  const total = Object.values(byStatus).reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
  return {
    valorRecuperadoTotal: total.toFixed(2),
    porStatus: Object.fromEntries(
      Object.entries(byStatus).map(([status, value]) => [status, value.toFixed(2)]),
    ) as Record<StatusEquipamento, string>,
  };
}
