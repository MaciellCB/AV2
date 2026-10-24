import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliExport } from '../prisma/import-cli.js';

test('parses normalized CLI exports with relational references', () => {
  const result = parseCliExport({
    organizacoes: [{ nome: 'GreenCo', cnpj: '12345678000195' }],
    contratos: [{
      numero: 'CTR-1',
      organizacaoCnpj: '12345678000195',
      dataInicio: '2026-01-01',
      clausulas: { prazo: 12 },
    }],
    lotes: [{ codigo: 'LOT-1', organizacaoCnpj: '12345678000195' }],
    equipamentos: [{
      codigoBarrasInterno: 'EQ-1',
      loteCodigo: 'LOT-1',
      nome: 'Notebook',
      status: 'RECEBIDO',
    }],
    movimentacoes: [{
      equipamentoCodigoBarrasInterno: 'EQ-1',
      tipo: 'RECEBIMENTO',
      statusNovo: 'RECEBIDO',
      data: '2026-01-01T12:00:00.000Z',
    }],
  });
  assert.equal(result.organizacoes.length, 1);
  assert.equal(result.contratos[0].dataInicio.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(result.movimentacoes.length, 1);
});

test('rejects exports that cannot preserve relational integrity', () => {
  assert.throws(
    () => parseCliExport({ organizacoes: [{ nome: 'GreenCo', cnpj: 'short' }] }),
    /Exportação incompatível/,
  );
});
