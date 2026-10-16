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
  await expect(page.locator('canvas')).toHaveCount(6);
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

test('dica do gráfico de gênero mostra o percentual da parte apontada e o resumo do mandato', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'celular', 'passar o mouse não se aplica ao celular');
  await simularApi(page);
  await page.goto('/painel.html');
  await page.locator('#indicadores li').first().waitFor();
  const canvas = page.locator('#g-genero');
  await canvas.scrollIntoViewIfNeeded();

  // Posição da parte "Homens" (2ª série) do 1º mandato, calculada pelo próprio Chart.js
  const alvo = await page.evaluate(() => {
    const barra = Chart.getChart('g-genero').getDatasetMeta(1).data[0];
    return { x: barra.x, y: (barra.y + barra.base) / 2 };
  });
  await canvas.hover({ position: alvo });
  const dica = await page.evaluate(() => {
    const t = Chart.getChart('g-genero').tooltip;
    return { titulo: t.title, linhas: t.body.flatMap((b) => b.lines), rodape: t.footer };
  });
  // api-simulada: fev/2022 a fev/2024 → 45 mulheres e 62 homens
  expect(dica).toEqual({ titulo: ['fev/2022 a fev/2024'], linhas: ['Homens: 62 (58%)'], rodape: ['Total: 107 pessoas · 42% mulheres'] });
  await page.locator('section.grafico').filter({ has: canvas }).screenshot({ path: testInfo.outputPath('dica-genero.png') });
});
