import test from 'node:test';
import assert from 'node:assert/strict';

test('HTTP server responds to health and rejects unauthenticated API access', async () => {
  process.env.JWT_SECRET = 'server-smoke-test-secret-at-least-32-characters';
  const { buildApp, prisma } = await import('../src/server.js');
  const app = await buildApp();
  try {
    await app.ready();
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, 'ok');

    const protectedRoute = await app.inject({ method: 'GET', url: '/api/organizacoes' });
    assert.equal(protectedRoute.statusCode, 401);

    const expiredToken = app.jwt.sign({ sub: 'expired-user' }, { expiresIn: -1 });
    const expiredRoute = await app.inject({
      method: 'GET',
      url: '/api/organizacoes',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expiredRoute.statusCode, 401);

    const previousNodeEnv = process.env.NODE_ENV;
    const previousFrontendOrigin = process.env.FRONTEND_ORIGIN;
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_ORIGIN;
    try {
      await assert.rejects(buildApp(), /FRONTEND_ORIGIN/);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
      else process.env.FRONTEND_ORIGIN = previousFrontendOrigin;
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});
