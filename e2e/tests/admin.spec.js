import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { EMAIL_ADMIN, simularApi, simularSupabase } from './api-simulada.js';

test.beforeEach(async ({ page }) => {
  await simularApi(page);
  await simularSupabase(page);
});

async function entrar(page, email, senha) {
  await page.goto('/admin.html');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('administrador entra, vê os feedbacks, filtra e sai', async ({ page }) => {
  await entrar(page, EMAIL_ADMIN, 'senha-correta');

  await expect(page.getByText(`Conectado como ${EMAIL_ADMIN}`)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Resumo dos feedbacks' })).toContainText('4,33');
  const linhas = page.locator('#corpo-feedbacks tr');
  await expect(linhas).toHaveCount(4);
  await expect(linhas.first()).toContainText('09/10 às 12:30');
  await expect(linhas.nth(1)).toContainText('Anônimo');
  // Mensagem com HTML aparece como texto, sem executar (proteção contra XSS)
  await expect(page.getByRole('cell', { name: '<script>alert(1)</script>' })).toBeVisible();

  await page.getByLabel('Avaliação').selectOption('5');
  await expect(linhas).toHaveCount(2);
  await expect(page.locator('caption')).toHaveText('2 feedbacks');

  // A sessão continua ao recarregar a página
  await page.reload();
  await expect(page.getByText(`Conectado como ${EMAIL_ADMIN}`)).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByText('Você saiu da área administrativa.')).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('E-mail')).toBeVisible();
});

test('senha errada mostra aviso e não entra', async ({ page }) => {
  await entrar(page, EMAIL_ADMIN, 'errada');
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
  await expect(page.getByLabel('Senha')).toHaveValue('');
  await expect(page.locator('#painel-admin')).toBeHidden();
});

test('usuário que não é administrador é recusado', async ({ page }) => {
  await entrar(page, 'visitante@exemplo.com', 'senha-correta');
  await expect(page.getByText('Este usuário não tem permissão de administrador.')).toBeVisible();
  await expect(page.locator('#painel-admin')).toBeHidden();
});

test('tela de login e painel administrativo sem violações WCAG 2.1 AA', async ({ page }) => {
  const regras = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  await page.goto('/admin.html');
  await page.getByLabel('E-mail').waitFor();
  expect((await new AxeBuilder({ page }).withTags(regras).analyze()).violations).toEqual([]);

  await page.getByLabel('E-mail').fill(EMAIL_ADMIN);
  await page.getByLabel('Senha').fill('senha-correta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#corpo-feedbacks tr')).toHaveCount(4);
  expect((await new AxeBuilder({ page }).withTags(regras).analyze()).violations).toEqual([]);
});
