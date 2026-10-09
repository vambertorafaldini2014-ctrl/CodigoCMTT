// Funções puras (sem DOM), testadas com `node --test` (ver web/tests).

/** Escapa caracteres especiais de HTML para evitar injeção de código (XSS). */
export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Remove acentos e coloca em minúsculas, mantendo o MESMO tamanho do texto original. */
export function normalizarCaractere(c) {
  return c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c;
}

export function normalizar(texto) {
  return Array.from(String(texto ?? '')).map(normalizarCaractere).join('');
}

/** Extrai as palavras do termo de busca (ou a frase inteira, se estiver entre aspas). */
export function palavrasDoTermo(termo) {
  const t = String(termo ?? '').trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    const frase = normalizar(t.slice(1, -1)).trim();
    return frase ? [frase] : [];
  }
  return normalizar(t).split(/\s+/).filter(p => p.length > 0);
}

/**
 * Devolve HTML seguro com as palavras buscadas envolvidas em <mark>.
 * A comparação ignora acentos e maiúsculas: buscar "onibus" destaca "Ônibus".
 */
export function destacar(texto, termo) {
  const original = Array.from(String(texto ?? ''));
  const norm = original.map(normalizarCaractere).join('');
  const marcado = new Array(original.length).fill(false);

  for (const palavra of palavrasDoTermo(termo)) {
    let pos = norm.indexOf(palavra);
    while (pos !== -1) {
      for (let i = pos; i < pos + palavra.length; i++) marcado[i] = true;
      pos = norm.indexOf(palavra, pos + palavra.length);
    }
  }

  let html = '';
  let aberto = false;
  original.forEach((c, i) => {
    if (marcado[i] && !aberto) { html += '<mark>'; aberto = true; }
    if (!marcado[i] && aberto) { html += '</mark>'; aberto = false; }
    html += escaparHtml(c);
  });
  if (aberto) html += '</mark>';
  return html;
}

/** "2024-03-01" -> "01/03/2024" (sem conversão de fuso horário). */
export function formatarData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Formata números no padrão brasileiro: 52827 -> "52.827". */
export function formatarNumero(n) {
  return Number(n ?? 0).toLocaleString('pt-BR');
}

/** Monta a query string ignorando valores vazios. */
export function montarQuery(params) {
  const qs = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') qs.set(chave, valor);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Converte uma lista de objetos em CSV (separador ";" e BOM, para abrir certo no Excel). */
export function paraCsv(linhas, colunas) {
  const celula = v => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = colunas.map(c => celula(c.titulo)).join(';');
  const corpo = linhas.map(l => colunas.map(c => celula(l[c.campo])).join(';'));
  return '﻿' + [cabecalho, ...corpo].join('\r\n');
}

/** % de mulheres entre as pessoas com gênero informado (arredondado). */
export function percentualMulheres({ feminino = 0, masculino = 0 } = {}) {
  const total = feminino + masculino;
  return total ? Math.round((100 * feminino) / total) : 0;
}

/** Converte código de mandato em texto legível: "2024mar 2026jan" -> "mar/2024 a jan/2026". */
export function rotuloMandato(codigo) {
  const m = /^(\d{4})([a-z]{3})\s+(\d{4})([a-z]{3})$/i.exec(String(codigo ?? '').trim());
  return m ? `${m[2]}/${m[1]} a ${m[4]}/${m[3]}` : String(codigo ?? '');
}
