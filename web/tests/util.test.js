import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  destacar, escaparHtml, formatarData, montarQuery, normalizar, palavrasDoTermo, paraCsv, rotuloMandato,
} from '../js/util.js';

test('escaparHtml neutraliza tags', () => {
  assert.equal(escaparHtml('<script>"x" & \'y\'</script>'), '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
  assert.equal(escaparHtml(null), '');
});

test('normalizar remove acentos e mantém o tamanho', () => {
  assert.equal(normalizar('Ônibus São'), 'onibus sao');
  assert.equal(normalizar('Ação').length, 'Ação'.length);
});

test('palavrasDoTermo separa palavras ou mantém frase entre aspas', () => {
  assert.deepEqual(palavrasDoTermo('  Faixa  Exclusiva '), ['faixa', 'exclusiva']);
  assert.deepEqual(palavrasDoTermo('"faixa exclusiva"'), ['faixa exclusiva']);
  assert.deepEqual(palavrasDoTermo('""'), []);
});

test('destacar marca o termo ignorando acentos e maiúsculas', () => {
  assert.equal(destacar('O Ônibus chegou', 'onibus'), 'O <mark>Ônibus</mark> chegou');
});

test('destacar marca todas as ocorrências e várias palavras', () => {
  assert.equal(destacar('bike e Bike, faixa', 'bike faixa'), '<mark>bike</mark> e <mark>Bike</mark>, <mark>faixa</mark>');
});

test('destacar escapa HTML do texto (proteção contra XSS)', () => {
  assert.equal(destacar('<b>ciclovia</b>', 'ciclovia'), '&lt;b&gt;<mark>ciclovia</mark>&lt;/b&gt;');
});

test('destacar sem termo apenas escapa', () => {
  assert.equal(destacar('a < b', ''), 'a &lt; b');
});

test('formatarData converte ISO para dd/mm/aaaa', () => {
  assert.equal(formatarData('2024-03-01'), '01/03/2024');
  assert.equal(formatarData(null), '—');
});

test('montarQuery ignora valores vazios', () => {
  assert.equal(montarQuery({ q: 'ônibus', ano: '', tipo: null }), '?q=%C3%B4nibus');
  assert.equal(montarQuery({}), '');
});

test('paraCsv usa ; e escapa aspas e quebras de linha', () => {
  const csv = paraCsv([{ a: 'x;y', b: 'diz "oi"' }], [{ campo: 'a', titulo: 'A' }, { campo: 'b', titulo: 'B' }]);
  assert.equal(csv, '﻿A;B\r\n"x;y";"diz ""oi"""');
});

test('rotuloMandato deixa o código legível', () => {
  assert.equal(rotuloMandato('2024mar 2026jan'), 'mar/2024 a jan/2026');
  assert.equal(rotuloMandato('outro'), 'outro');
});
