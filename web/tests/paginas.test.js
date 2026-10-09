import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlMenu, montarPagina, PAGINAS, RAIZ } from '../scripts/paginas.js';

for (const [arquivo, ativo] of Object.entries(PAGINAS)) {
  test(`${arquivo} está com cabeçalho, menu e rodapé atualizados (rode "node scripts/paginas.js" se falhar)`, () => {
    const html = readFileSync(join(RAIZ, arquivo), 'utf-8').replace(/\r\n/g, '\n');
    assert.equal(montarPagina(html, ativo), html);
  });

  test(`${arquivo} tem idioma, título, link "pular para o conteúdo" e um único <main>`, () => {
    const html = readFileSync(join(RAIZ, arquivo), 'utf-8');
    assert.match(html, /<html lang="pt-BR">/);
    assert.match(html, /<title>[^<]+ — Buscador CMTT<\/title>/);
    assert.match(html, /<a class="pular-link" href="#conteudo">/);
    assert.equal(html.match(/<main id="conteudo"/g)?.length, 1);
  });
}

test('menu marca no máximo um item como página atual', () => {
  assert.equal(htmlMenu('painel.html').match(/aria-current="page"/g).length, 1);
  assert.equal(htmlMenu(null).includes('aria-current'), false);
});

test('montarPagina avisa quando falta a marcação', () => {
  assert.throws(() => montarPagina('<html></html>', null), /partes:cabeca/);
});
