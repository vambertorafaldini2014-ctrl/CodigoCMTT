import { expect, test } from '@playwright/test';
import { simularApi, TOTAL_RESULTADOS } from './api-simulada.js';

test.beforeEach(async ({ page }) => {
  await simularApi(page);
});

test('busca mostra resultados com destaque por radical, gráfico e paginação', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByLabel('O que você procura?').fill('ciclovias');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'ocorrências' }))
    .toHaveText(`${TOTAL_RESULTADOS} ocorrências encontradas para “ciclovias”.`);
  await expect(page.locator('.resultado')).toHaveCount(25);

  // Busca inteligente: "ciclovias" destaca também "ciclovia" (singular)
  const primeiro = page.locator('.resultado').first();
  await expect(primeiro.locator('mark')).toHaveText(['Ciclovias', 'ciclovia']);

  await expect(page.getByRole('heading', { name: 'Ocorrências por ano' })).toBeVisible();
  await expect(page).toHaveURL(/q=ciclovias&modo=inteligente&ordem=relevancia/);

  await page.getByRole('button', { name: 'Próxima →' }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await expect(page.locator('.resultado')).toHaveCount(TOTAL_RESULTADOS - 25);
  await expect(page.getByRole('heading', { name: /^Resultados/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Próxima →' })).toBeDisabled();
});

test('trocar o tipo de busca refaz a pesquisa e atualiza a URL', async ({ page }) => {
  await page.goto('/index.html?q=ciclovias');
  await expect(page.locator('.resultado')).toHaveCount(25);

  await page.getByLabel('Tipo de busca').selectOption('exato');
  await expect(page).toHaveURL(/modo=exato/);
  await page.getByLabel('Ordenar por').selectOption('data');
  await expect(page).toHaveURL(/modo=exato&ordem=data/);
  // Na busca exata o destaque é pelo texto digitado
  await expect(page.locator('.resultado').first().locator('mark')).toHaveText(['Ciclovias']);
});

test('busca sem resultados avisa o usuário', async ({ page }) => {
  await page.goto('/index.html?q=termo inexistente');
  await expect(page.getByText('Nenhum resultado para “termo inexistente”. Tente outras palavras.')).toBeVisible();
  await expect(page.locator('#secao-resultados')).toBeHidden();
});

test('resultado abre a ata na linha encontrada, com as variações destacadas', async ({ page }) => {
  await page.goto('/index.html?q=ciclovias');
  await page.locator('.resultado h3 a').first().click();

  await expect(page).toHaveURL(/reuniao\.html\?id=1&radicais=ciclov#linha-20/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('75ª Reunião Ordinária — 01/11/2024');
  const linha = page.locator('#linha-20');
  await expect(linha).toBeInViewport();
  await expect(linha.locator('mark')).toHaveText(['Ciclovias', 'ciclovia']);
});

test('filtro dentro da ata mostra só as linhas com o termo', async ({ page }) => {
  await page.goto('/reuniao.html?id=1');
  await page.getByLabel('Procurar neste texto').fill('paulista');
  await expect(page.getByText('1 de 50 linhas contêm o termo.')).toBeVisible();
  await expect(page.locator('#texto-ata p:visible')).toHaveCount(1);
});

test('páginas de reuniões, conselho e painel carregam os dados', async ({ page }) => {
  await page.goto('/reunioes.html');
  await expect(page.getByRole('table')).toContainText('75ª Reunião Ordinária');
  await expect(page.locator('caption')).toHaveText('2 reuniões encontradas');

  await page.goto('/conselho.html');
  await expect(page.getByRole('heading', { name: 'Mandato mar/2024 a jan/2026' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /CET/ })).toBeVisible();

  await page.goto('/painel.html');
  await expect(page.getByRole('list', { name: 'Indicadores gerais' })).toContainText('52.827');
  await expect(page.locator('canvas')).toHaveCount(5);
});
