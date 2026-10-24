import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient, StatusEquipamento, TipoMovimentacao } from '@prisma/client';
import { z } from 'zod';
import { cnpjSchema } from '../src/domain/cnpj.js';

const optionalText = z.string().optional().nullable();
export const cliExportSchema = z.object({
  organizacoes: z.array(z.object({
    nome: z.string().min(2),
    cnpj: cnpjSchema,
    email: optionalText,
    telefone: optionalText,
    endereco: optionalText,
  })),
  contratos: z.array(z.object({
    numero: z.string().min(1),
    organizacaoCnpj: cnpjSchema,
    descricao: optionalText,
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date().optional().nullable(),
    valorTotal: z.coerce.number().nonnegative().optional().nullable(),
    clausulas: z.unknown().optional().nullable(),
  })).default([]),
  lotes: z.array(z.object({
    codigo: z.string().min(1),
    organizacaoCnpj: z.string().min(11).max(18),
    descricao: optionalText,
    dataRecebimento: z.coerce.date().optional(),
  })).default([]),
  equipamentos: z.array(z.object({
    codigoBarrasInterno: z.string().min(1),
    loteCodigo: z.string().min(1),
    nome: z.string().min(2),
    categoria: optionalText,
    fabricante: optionalText,
    modelo: optionalText,
    numeroSerie: optionalText,
    status: z.nativeEnum(StatusEquipamento).default(StatusEquipamento.RECEBIDO),
    pesoKg: z.coerce.number().nonnegative().optional().nullable(),
    valorRecuperado: z.coerce.number().nonnegative().optional().nullable(),
    observacoes: optionalText,
  })).default([]),
  movimentacoes: z.array(z.object({
    equipamentoCodigoBarrasInterno: z.string().min(1),
    tipo: z.nativeEnum(TipoMovimentacao),
    statusAnterior: z.nativeEnum(StatusEquipamento).optional().nullable(),
    statusNovo: z.nativeEnum(StatusEquipamento),
    descricao: optionalText,
    responsavel: optionalText,
    data: z.coerce.date(),
  })).default([]),
});

export function parseCliExport(input: unknown) {
  const parsed = cliExportSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Exportação incompatível: ${JSON.stringify(parsed.error.flatten())}`);
  return parsed.data;
}

export async function importCliExport(filePath: string, db: PrismaClient) {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Não foi possível ler um JSON válido em "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const data = parseCliExport(input);
  const imported = await db.$transaction(async (tx) => {
    const organizationIds = new Map<string, string>();
    for (const organization of data.organizacoes) {
      const saved = await tx.organizacao.upsert({
        where: { cnpj: organization.cnpj },
        create: organization,
        update: organization,
      });
      organizationIds.set(saved.cnpj, saved.id);
    }

    for (const contract of data.contratos) {
      const organizacaoId = organizationIds.get(contract.organizacaoCnpj)
        ?? (await tx.organizacao.findUnique({ where: { cnpj: contract.organizacaoCnpj }, select: { id: true } }))?.id;
      if (!organizacaoId) throw new Error(`Organização não encontrada para o contrato ${contract.numero}`);
      const { organizacaoCnpj: _cnpj, valorTotal, clausulas, ...fields } = contract;
      const common = {
        ...fields,
        organizacaoId,
        valorTotal: valorTotal == null ? null : new Prisma.Decimal(valorTotal),
        clausulas: clausulas == null ? Prisma.JsonNull : clausulas as Prisma.InputJsonValue,
      };
      await tx.contrato.upsert({
        where: { numero: contract.numero },
        create: common,
        update: common,
      });
    }

    const lotIds = new Map<string, string>();
    for (const lot of data.lotes) {
      const organizacaoId = organizationIds.get(lot.organizacaoCnpj)
        ?? (await tx.organizacao.findUnique({ where: { cnpj: lot.organizacaoCnpj }, select: { id: true } }))?.id;
      if (!organizacaoId) throw new Error(`Organização não encontrada para o lote ${lot.codigo}`);
      const saved = await tx.lote.upsert({
        where: { codigo: lot.codigo },
        create: { codigo: lot.codigo, descricao: lot.descricao, dataRecebimento: lot.dataRecebimento, organizacaoId },
        update: { descricao: lot.descricao, dataRecebimento: lot.dataRecebimento, organizacaoId },
      });
      lotIds.set(saved.codigo, saved.id);
    }

    for (const equipment of data.equipamentos) {
      const loteId = lotIds.get(equipment.loteCodigo)
        ?? (await tx.lote.findUnique({ where: { codigo: equipment.loteCodigo }, select: { id: true } }))?.id;
      if (!loteId) throw new Error(`Lote não encontrado para o equipamento ${equipment.codigoBarrasInterno}`);
      const { loteCodigo: _codigo, pesoKg, valorRecuperado, ...fields } = equipment;
      await tx.equipamento.upsert({
        where: { codigoBarrasInterno: equipment.codigoBarrasInterno },
        create: {
          ...fields, loteId,
          pesoKg: pesoKg == null ? null : new Prisma.Decimal(pesoKg),
          valorRecuperado: valorRecuperado == null ? null : new Prisma.Decimal(valorRecuperado),
        },
        update: {
          ...fields, loteId,
          pesoKg: pesoKg == null ? null : new Prisma.Decimal(pesoKg),
          valorRecuperado: valorRecuperado == null ? null : new Prisma.Decimal(valorRecuperado),
        },
      });
    }

    for (const movement of data.movimentacoes) {
      const equipamento = await tx.equipamento.findUnique({
        where: { codigoBarrasInterno: movement.equipamentoCodigoBarrasInterno },
        select: { id: true },
      });
      if (!equipamento) throw new Error(`Equipamento não encontrado para movimentação: ${movement.equipamentoCodigoBarrasInterno}`);
      const { equipamentoCodigoBarrasInterno: _codigo, ...fields } = movement;
      const movementData = { ...fields, equipamentoId: equipamento.id };
      const existing = await tx.movimentacao.findFirst({
        where: {
          equipamentoId: equipamento.id,
          tipo: movement.tipo,
          statusNovo: movement.statusNovo,
          data: movement.data,
          responsavel: movement.responsavel ?? null,
        },
        select: { id: true },
      });
      if (!existing) await tx.movimentacao.create({ data: movementData });
    }

    return {
      organizacoes: data.organizacoes.length,
      contratos: data.contratos.length,
      lotes: data.lotes.length,
      equipamentos: data.equipamentos.length,
      movimentacoes: data.movimentacoes.length,
    };
  }, { timeout: 60_000 });
  return imported;
}

const inputPath = process.argv[2];
if (inputPath) {
  const prisma = new PrismaClient();
  try {
    const counts = await importCliExport(inputPath, prisma);
    console.log('Importação concluída:', counts);
  } catch (error) {
    console.error('Falha na importação:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
} else if (process.argv[1]?.endsWith('import-cli.ts')) {
  console.error('Uso: npm run db:import-cli -- <caminho-do-export-json>');
  process.exitCode = 2;
}
