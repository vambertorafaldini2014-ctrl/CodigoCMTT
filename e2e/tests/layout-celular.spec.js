import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada.js';

// Cabeçalho em celulares de várias larguras: logotipos inteiros dentro da moldura,
// menu em uma linha e nada vazando para fora da tela.
for (const largura of [320, 360, 390, 430]) {
  test(`cabeçalho cabe na tela de ${largura}px`, async ({ page }) => {
    await simularApi(page);
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto('/sobre.html');
    const medidas = await page.evaluate(() => {
      const caixa = document.querySelector('.logos').getBoundingClientRect();
      const logos = [...document.querySelectorAll('.logos img')].map((i) => i.getBoundingClientRect());
      const titulo = document.querySelector('.marca-texto').getBoundingClientRect();
      const itens = [...document.querySelectorAll('.menu a')].map((a) => a.getBoundingClientRect());
      return {
        logosDentroDaMoldura: logos.every((i) => i.left >= caixa.left - 0.5 && i.right <= caixa.right + 0.5),
        logosSemSobreporTitulo: logos.every((i) => i.right <= titulo.left + 0.5 || i.bottom <= titulo.top + 0.5),
        proporcaoCmtt: logos[1].width / logos[1].height,
        menuEmUmaLinha: new Set(itens.map((r) => Math.round(r.top))).size === 1,
        menuDentroDaTela: itens.every((r) => r.left >= 0 && r.right <= innerWidth),
        semRolagemHorizontal: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(medidas).toMatchObject({ logosDentroDaMoldura: true, logosSemSobreporTitulo: true, menuEmUmaLinha: true,
      menuDentroDaTela: true, semRolagemHorizontal: true });
    expect(medidas.proporcaoCmtt).toBeCloseTo(548 / 303, 1); // logotipo do CMTT sem distorção
  });
}
