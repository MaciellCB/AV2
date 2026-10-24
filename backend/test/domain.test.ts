import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedTransitions, canTransition } from '../src/domain/equipment-workflow.js';
import { roleCan } from '../src/domain/authorization.js';
import { cnpjSchema, isValidCnpj } from '../src/domain/cnpj.js';
import { hasValidContractDates } from '../src/domain/contracts.js';
import { calculateRecoveredValues } from '../src/domain/financial.js';
import { Prisma } from '@prisma/client';
import { StatusEquipamento } from '@prisma/client';

test('workflow permits only defined equipment status transitions', () => {
  assert.equal(canTransition(StatusEquipamento.RECEBIDO, StatusEquipamento.EM_TRIAGEM), true);
  assert.equal(canTransition(StatusEquipamento.EM_TRIAGEM, StatusEquipamento.EM_REPARO), true);
  assert.equal(canTransition(StatusEquipamento.RECEBIDO, StatusEquipamento.DESCARTADO), false);
  assert.equal(canTransition(StatusEquipamento.RECONDICIONADO, StatusEquipamento.EM_TRIAGEM), false);
});

test('every terminal equipment status rejects further transitions', () => {
  for (const status of ['RECONDICIONADO', 'RECICLAGEM', 'DESCARTADO'] as const) {
    assert.deepEqual(allowedTransitions[status], []);
    for (const destination of Object.keys(allowedTransitions) as Array<keyof typeof allowedTransitions>) {
      assert.equal(canTransition(status, destination), false);
    }
  }
});

test('each configured transition is accepted and every unspecified transition is rejected', () => {
  const statuses = Object.keys(allowedTransitions) as Array<keyof typeof allowedTransitions>;
  for (const from of statuses) {
    for (const to of statuses) {
      assert.equal(canTransition(from, to), allowedTransitions[from].includes(to), `${from} -> ${to}`);
    }
  }
});

test('role permissions follow least privilege', () => {
  assert.equal(roleCan('CONSULTA', 'read'), true);
  assert.equal(roleCan('CONSULTA', 'write'), false);
  assert.equal(roleCan('CONSULTA', 'admin'), false);
  assert.equal(roleCan('OPERADOR', 'read'), true);
  assert.equal(roleCan('OPERADOR', 'write'), true);
  assert.equal(roleCan('OPERADOR', 'admin'), false);
  assert.equal(roleCan('ADMINISTRADOR', 'read'), true);
  assert.equal(roleCan('ADMINISTRADOR', 'write'), true);
  assert.equal(roleCan('ADMINISTRADOR', 'admin'), true);
});

test('CNPJ validation checks verifier digits and normalizes formatted input', () => {
  assert.equal(isValidCnpj('12.345.678/0001-95'), true);
  assert.equal(cnpjSchema.parse('12.345.678/0001-95'), '12345678000195');
  assert.equal(isValidCnpj('12.345.678/0001-94'), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
});

test('CNPJ validation supports the alphanumeric format', () => {
  const base = '12ABC34501DE';
  const digit = (value: string, weights: number[]) => {
    const sum = [...value].reduce((total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index], 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const first = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(`${base}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.equal(isValidCnpj(`${base}${first}${second}`), true);
});

test('contract date validation is reusable outside HTTP routes', () => {
  assert.equal(hasValidContractDates(new Date('2026-01-01'), new Date('2026-01-01')), true);
  assert.equal(hasValidContractDates(new Date('2026-02-01'), new Date('2026-01-31')), false);
  assert.equal(hasValidContractDates(new Date('2026-02-01')), true);
});

test('recovered values are summed exactly by status and across the operation', () => {
  const result = calculateRecoveredValues([
    { status: StatusEquipamento.RECONDICIONADO, value: new Prisma.Decimal('12.35') },
    { status: StatusEquipamento.RECONDICIONADO, value: new Prisma.Decimal('0.10') },
    { status: StatusEquipamento.RECICLAGEM, value: new Prisma.Decimal('5.00') },
    { status: StatusEquipamento.EM_REPARO, value: null },
  ]);
  assert.equal(result.valorRecuperadoTotal, '17.45');
  assert.equal(result.porStatus.RECONDICIONADO, '12.45');
  assert.equal(result.porStatus.RECICLAGEM, '5.00');
  assert.equal(result.porStatus.EM_REPARO, '0.00');
});
