import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada.js';

const PAGINAS = [
  { nome: 'Busca (com resultados)', url: '/index.html?q=ciclovias', pronta: '.resultado' },
  { nome: 'Reuniões', url: '/reunioes.html', pronta: '#corpo-tabela tr' },
  { nome: 'Ata', url: '/reuniao.html?id=1', pronta: '#texto-ata p' },
  { nome: 'Conselho', url: '/conselho.html', pronta: '#cadeiras table' },
  { nome: 'Painel', url: '/painel.html', pronta: '#indicadores li' },
  { nome: 'Sobre', url: '/sobre.html', pronta: '#form-feedback' },
];

// Regras WCAG 2.0/2.1 níveis A e AA (o padrão exigido pelo eMAG)
const REGRAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function resumo(violacoes) {
  return violacoes.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.beforeEach(async ({ page }) => {
  await simularApi(page);
});

for (const { nome, url, pronta } of PAGINAS) {
  for (const contraste of [false, true]) {
    test(`${nome}: sem violações WCAG 2.1 AA${contraste ? ' (alto contraste)' : ''}`, async ({ page }) => {
      if (contraste) {
        await page.addInitScript(() => localStorage.setItem('cmtt-acessibilidade', JSON.stringify({ contraste: true })));
      }
      await page.goto(url);
      await page.locator(pronta).first().waitFor();
      const { violations } = await new AxeBuilder({ page }).withTags(REGRAS).analyze();
      expect(resumo(violations)).toEqual([]);
    });
  }
}

test('link "Pular para o conteúdo" é o primeiro item do teclado e leva ao conteúdo', async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name === 'celular', 'teclado físico não se aplica ao celular');
  await page.goto('/index.html');
  await page.keyboard.press('Tab');
  const pular = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(pular).toBeFocused();
  await expect(pular).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('busca pode ser feita só com o teclado', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'celular', 'teclado físico não se aplica ao celular');
  await page.goto('/index.html');
  await page.getByLabel('O que você procura?').focus();
  await page.keyboard.type('ciclovias');
  await page.keyboard.press('Enter');
  await expect(page.locator('.resultado')).toHaveCount(25);
});

test('botões A+ e A− mudam o tamanho da fonte e a preferência é lembrada', async ({ page }) => {
  await page.goto('/index.html');
  const fonte = () => page.evaluate(() => document.documentElement.style.fontSize);

  await page.getByRole('button', { name: 'Aumentar tamanho da fonte' }).click();
  await page.getByRole('button', { name: 'Aumentar tamanho da fonte' }).click();
  expect(await fonte()).toBe('125%');
  await expect(page.locator('#anuncio-acessibilidade')).toHaveText('Fonte em 125%');

  await page.reload();
  expect(await fonte()).toBe('125%');

  await page.getByRole('button', { name: 'Diminuir tamanho da fonte' }).click();
  expect(await fonte()).toBe('112.5%');
});

test('alto contraste liga e desliga, informando o estado aos leitores de tela', async ({ page }) => {
  await page.goto('/index.html');
  const botao = page.getByRole('button', { name: 'Alto contraste' });
  await expect(botao).toHaveAttribute('aria-pressed', 'false');

  await botao.click();
  await expect(botao).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-contraste', 'alto');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  await page.goto('/painel.html');
  await expect(page.locator('html')).toHaveAttribute('data-contraste', 'alto');

  await page.getByRole('button', { name: 'Alto contraste' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-contraste', 'alto');
});

test('cada gráfico do painel tem uma tabela equivalente', async ({ page }) => {
  await page.goto('/painel.html');
  await page.locator('#indicadores li').first().waitFor();
  const graficos = page.locator('section.grafico');
  await expect(graficos).toHaveCount(5);
  for (const secao of await graficos.all()) {
    await secao.getByText('Ver dados em tabela').click();
    await expect(secao.getByRole('table')).toBeVisible();
  }
});
