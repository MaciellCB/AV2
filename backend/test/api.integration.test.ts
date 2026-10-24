import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

test('Fastify API enforces auth and supports versioned CRUD against PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'integration-test-jwt-secret-at-least-32-characters';
  const { buildApp, prisma } = await import('../src/server.js');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `admin-${suffix}@integration.local`;
  const cnpjBase = `99${Date.now().toString().slice(-10)}`;
  const cnpjDigit = (value: string, weights: number[]) => {
    const sum = [...value].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const firstDigit = cnpjDigit(cnpjBase, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const cnpj = `${cnpjBase}${firstDigit}${cnpjDigit(`${cnpjBase}${firstDigit}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])}`;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let userId: string | undefined;
  let organizationId: string | undefined;
  let lotId: string | undefined;
  let equipmentId: string | undefined;

  try {
    await prisma.$connect();
    const user = await prisma.usuario.create({
      data: { nome: 'Admin integração', email, senhaHash: await bcrypt.hash('Integration@123', 4), papel: 'ADMINISTRADOR' },
    });
    userId = user.id;
    app = await buildApp();
    await app.ready();

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/organizacoes' });
    assert.equal(unauthenticated.statusCode, 401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, senha: 'Integration@123' },
    });
    assert.equal(login.statusCode, 200);
    const token = login.json().token as string;
    const headers = { authorization: `Bearer ${token}` };
    const selfDelete = await app.inject({ method: 'DELETE', url: `/api/admin/usuarios/${user.id}`, headers });
    assert.equal(selfDelete.statusCode, 400);

    const create = await app.inject({
      method: 'POST',
      url: '/api/organizacoes',
      headers,
      payload: { nome: 'Organização integração', cnpj: `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` },
    });
    assert.equal(create.statusCode, 201);
    organizationId = create.json().id as string;
    assert.equal(create.json().cnpj, cnpj);
    const invalidCnpj = await app.inject({
      method: 'POST',
      url: '/api/organizacoes',
      headers,
      payload: { nome: 'CNPJ inválido', cnpj: '12345678000194' },
    });
    assert.equal(invalidCnpj.statusCode, 400);
    const invalidContractDates = await app.inject({
      method: 'POST',
      url: '/api/contratos',
      headers,
      payload: {
        numero: `CONTRACT-${suffix}`,
        organizacaoId: organizationId,
        dataInicio: '2026-02-01T00:00:00.000Z',
        dataFim: '2026-01-31T00:00:00.000Z',
      },
    });
    assert.equal(invalidContractDates.statusCode, 400);
    const beforeEquipment = await app.inject({ method: 'GET', url: '/api/dashboard', headers });
    const financialBaseline = Number(beforeEquipment.json().financeiro.valorRecuperadoTotal);

    const search = await app.inject({
      method: 'GET',
      url: `/api/organizacoes?page=1&limit=1&q=${cnpj}`,
      headers,
    });
    assert.equal(search.statusCode, 200);
    assert.equal(search.json().total, 1);

    const batch = await app.inject({
      method: 'POST',
      url: '/api/lotes',
      headers,
      payload: {
        codigo: `LOT-${suffix}`,
        organizacaoId: organizationId,
        equipamentos: [{ codigoBarrasInterno: `EQ-${suffix}`, nome: 'Equipamento em lote', valorRecuperado: 125.5 }],
      },
    });
    assert.equal(batch.statusCode, 201);
    lotId = batch.json().id as string;
    equipmentId = batch.json().equipamentos[0].id as string;
    assert.equal(batch.json().equipamentos[0].movimentacoes.length, 1);
    const dashboard = await app.inject({ method: 'GET', url: '/api/dashboard', headers });
    assert.equal(dashboard.statusCode, 200);
    assert.equal(Number(dashboard.json().financeiro.valorRecuperadoTotal) - financialBaseline, 125.5);
    await assert.rejects(prisma.equipamento.update({
      where: { id: equipmentId },
      data: { status: 'DESCARTADO' },
    }));
    const transition = await app.inject({
      method: 'PATCH',
      url: `/api/equipamentos/${equipmentId}/status`,
      headers,
      payload: { status: 'EM_TRIAGEM', versao: 1 },
    });
    assert.equal(transition.statusCode, 200);
    assert.equal(transition.json().status, 'EM_TRIAGEM');
    assert.equal(transition.json().versao, 2);

    const invalidBatch = await app.inject({
      method: 'POST',
      url: '/api/lotes',
      headers,
      payload: { codigo: `BAD-${suffix}`, organizacaoId: organizationId, equipamentos: [{ codigoBarrasInterno: '', nome: 'x' }] },
    });
    assert.equal(invalidBatch.statusCode, 400);

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/organizacoes/${organizationId}`,
      headers,
      payload: { nome: 'Organização atualizada', versao: 1 },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().versao, 2);

    const staleUpdate = await app.inject({
      method: 'PUT',
      url: `/api/organizacoes/${organizationId}`,
      headers,
      payload: { nome: 'Atualização obsoleta', versao: 1 },
    });
    assert.equal(staleUpdate.statusCode, 409);

    const newUser = await app.inject({
      method: 'POST',
      url: '/api/admin/usuarios',
      headers,
      payload: { nome: 'Operador integração', email: `operator-${suffix}@integration.local`, senha: 'Operator@1234', papel: 'OPERADOR' },
    });
    assert.equal(newUser.statusCode, 201);
    assert.equal('senhaHash' in newUser.json(), false);
    const operatorToken = app.jwt.sign({ sub: newUser.json().id, papel: 'OPERADOR' }, { expiresIn: '8h' });
    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/usuarios', headers: { authorization: `Bearer ${operatorToken}` } });
    assert.equal(forbidden.statusCode, 403);

    const disabled = await app.inject({
      method: 'PUT',
      url: `/api/admin/usuarios/${newUser.json().id}`,
      headers,
      payload: { ativo: false, versao: 1 },
    });
    assert.equal(disabled.statusCode, 200);
    const inactiveRequest = await app.inject({ method: 'GET', url: '/api/organizacoes', headers: { authorization: `Bearer ${operatorToken}` } });
    assert.equal(inactiveRequest.statusCode, 401);
    const inactiveMe = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: 'Bearer ' + operatorToken } });
    assert.equal(inactiveMe.statusCode, 401);

    const expiredToken = app.jwt.sign({ sub: user.id }, { expiresIn: -1 });
    const expiredApiRequest = await app.inject({
      method: 'GET',
      url: '/api/organizacoes',
      headers: { authorization: 'Bearer ' + expiredToken },
    });
    assert.equal(expiredApiRequest.statusCode, 401);
    const expiredMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer ' + expiredToken },
    });
    assert.equal(expiredMe.statusCode, 401);
  } finally {
    if (app) await app.close();
    if (equipmentId) await prisma.movimentacao.deleteMany({ where: { equipamentoId: equipmentId } });
    if (equipmentId) await prisma.equipamento.deleteMany({ where: { id: equipmentId } });
    if (lotId) await prisma.lote.deleteMany({ where: { id: lotId } });
    if (organizationId) await prisma.organizacao.deleteMany({ where: { id: organizationId } });
    await prisma.usuario.deleteMany({ where: { email: { endsWith: `${suffix}@integration.local` } } });
    if (userId) await prisma.usuario.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
