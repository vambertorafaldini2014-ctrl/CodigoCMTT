import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada.js';

test('painel guarda as estatísticas e as mostra quando a API não responde', async ({ page }) => {
  await simularApi(page);

  // 1ª visita: dados vêm da API e ficam salvos no navegador
  await page.goto('/painel.html');
  await expect(page.getByRole('list', { name: 'Indicadores gerais' })).toContainText('52.827');
  await expect(page.locator('#status')).toHaveText('');

  // 2ª visita com a API fora do ar (ex.: servidor gratuito ainda acordando e falhando)
  await page.route('http://localhost:8000/api/estatisticas', (rota) => rota.abort());
  await page.reload();
  await expect(page.getByRole('list', { name: 'Indicadores gerais' })).toContainText('52.827');
  await expect(page.locator('canvas')).toHaveCount(5);
  await expect(page.locator('#status')).toHaveText(/^Não foi possível atualizar agora\. Mostrando dados salvos em \d{2}\/\d{2} às \d{2}:\d{2}\.$/);
});

test('painel mostra os dados salvos imediatamente enquanto atualiza', async ({ page }) => {
  await simularApi(page);
  await page.goto('/painel.html');
  await expect(page.getByRole('list', { name: 'Indicadores gerais' })).toContainText('52.827');

  // API lenta: os dados salvos aparecem antes da resposta chegar
  let liberar;
  const respostaPresa = new Promise((r) => { liberar = r; });
  await page.route('http://localhost:8000/api/estatisticas', async (rota) => { await respostaPresa; await rota.fallback(); });
  await page.reload();
  await expect(page.locator('#status')).toContainText('Mostrando dados salvos em');
  await expect(page.getByRole('list', { name: 'Indicadores gerais' })).toContainText('52.827');

  liberar();
  await expect(page.locator('#status')).toHaveText('');
});
