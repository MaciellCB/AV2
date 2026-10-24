import { expect, test } from '@playwright/test';

test('admin logs in and creates then removes a user from the site', async ({ page }) => {
  const email = `e2e-${Date.now()}@greencode.local`;
  await page.goto('/');
  await expect(page.locator('input[type="email"]')).toHaveValue('');
  await expect(page.locator('input[type="password"]')).toHaveValue('');
  await page.locator('input[type="email"]').fill('admin@greencode.local');
  await page.locator('input[type="password"]').fill('GreenCode@123');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();

  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await page.getByRole('button', { name: 'Usuários' }).click();
  await page.getByRole('button', { name: 'Novo cadastro' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Operador E2E');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha (mínimo 10 caracteres)').fill('Operator@1234');
  await page.getByLabel('Papel').selectOption('OPERADOR');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();

  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `Excluir Operador E2E` }).click();
  await row.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByText(email)).toHaveCount(0);
});

test('tables expose text search and server pagination controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="email"]').fill('admin@greencode.local');
  await page.locator('input[type="password"]').fill('GreenCode@123');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();
  await page.getByRole('button', { name: 'Equipamentos', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Pesquisar registros' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filtrar por status' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próxima' })).toBeVisible();
});
