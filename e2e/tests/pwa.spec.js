import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada.js';

test('manifesto do app é válido e todos os ícones existem', async ({ page, request }) => {
  await simularApi(page);
  await page.goto('/index.html');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifesto = await (await request.get(`/${href}`)).json();

  expect(manifesto).toMatchObject({ short_name: 'Buscador CMTT', lang: 'pt-BR', display: 'standalone', start_url: '/index.html' });
  const tamanhos = manifesto.icons.map((i) => i.sizes);
  expect(tamanhos).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifesto.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icone of manifesto.icons) {
    expect((await request.get(`/${icone.src}`)).status(), icone.src).toBe(200);
  }
});

test('página tem metadados de compartilhamento (Open Graph)', async ({ page, request }) => {
  await simularApi(page);
  await page.goto('/index.html');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Buscador CMTT/);
  const imagem = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(imagem).toMatch(/^https:\/\/.+\/img\/compartilhar\.png$/);
  expect((await request.get(new URL(imagem).pathname)).status()).toBe(200);
});

test('endereço inexistente mostra a página 404 com o menu do site', async ({ page }) => {
  await simularApi(page);
  const resposta = await page.goto('/pasta/qualquer/pagina-que-nao-existe');
  expect(resposta.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Página não encontrada');
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  // Estilo carregado mesmo em subpastas (graças ao <base href="/">)
  await expect(page.locator('.barra-acessibilidade')).toHaveCSS('background-color', 'rgb(8, 58, 102)');
  await page.getByRole('link', { name: 'pesquisar nas atas' }).click();
  await expect(page).toHaveURL(/\/index\.html$/);
});
