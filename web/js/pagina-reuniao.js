import { api } from './api.js';
import { destacar, destacarRadicais, escaparHtml, formatarData, formatarNumero, normalizar, palavrasDoTermo, rotuloMandato } from './util.js';

const params = new URLSearchParams(location.search);
const id = params.get('id');
const titulo = document.getElementById('titulo');
const status = document.getElementById('status');
const campoFiltro = document.getElementById('campo-filtro');
const contagem = document.getElementById('contagem-filtro');
const textoAta = document.getElementById('texto-ata');

let linhas = [];

/**
 * Mostra só as linhas que contêm `termo` e destaca `realce`: um texto (por padrão, o próprio termo)
 * ou uma função que recebe a linha e devolve o HTML destacado.
 */
function renderizarTexto(termo, realce = termo) {
  const palavras = palavrasDoTermo(termo);
  const destacarLinha = typeof realce === 'function' ? realce
    : realce ? (linha) => destacar(linha, realce) : escaparHtml;
  let visiveis = 0;
  textoAta.innerHTML = linhas.map((linha, i) => {
    const norm = normalizar(linha);
    const casa = palavras.every(p => norm.includes(p));
    if (casa) visiveis++;
    const classe = palavras.length && !casa ? ' class="oculta"' : '';
    return `<p id="linha-${i + 1}"${classe}>${destacarLinha(linha)}</p>`;
  }).join('');
  contagem.textContent = palavras.length
    ? `${formatarNumero(visiveis)} de ${formatarNumero(linhas.length)} linhas contêm o termo.`
    : `${formatarNumero(linhas.length)} linhas.`;
}

async function carregar() {
  if (!id) {
    titulo.textContent = 'Reunião não informada';
    return;
  }
  try {
    const r = await api.reuniao(id);
    document.title = `${r.titulo} (${formatarData(r.data)}) — Buscador CMTT`;
    titulo.textContent = `${r.titulo} — ${formatarData(r.data)}`;

    const campos = [
      ['Data', formatarData(r.data)],
      ['Tipo', r.tipo],
      ['Local', r.local || 'Não informado'],
      ['Mandato', r.mandato ? rotuloMandato(r.mandato) : '—'],
      ['Arquivo', `<a href="${escaparHtml(r.url_pdf)}" target="_blank" rel="noopener">${escaparHtml(r.arquivo)}<span class="visualmente-oculto"> (PDF, abre em nova aba)</span></a>`],
    ];
    document.getElementById('metadados').innerHTML = campos
      .map(([k, v]) => `<dt><strong>${k}</strong></dt><dd style="margin:0">${k === 'Arquivo' ? v : escaparHtml(v)}</dd>`).join('');

    document.getElementById('temas').innerHTML = r.temas.length
      ? r.temas.map(t => `<li>${escaparHtml(t.tema)} <strong>(${t.ocorrencias})</strong></li>`).join('')
      : '<li>Nenhum tema identificado</li>';

    linhas = r.linhas;
    const destaque = params.get('destaque') || '';
    // Busca inteligente: a busca envia os radicais (ex.: "ciclov") para destacar as variações
    const radicais = (params.get('radicais') || '').split(',').filter(Boolean);
    const realceDaBusca = radicais.length ? (linha) => destacarRadicais(linha, radicais) : destaque;
    document.getElementById('detalhes').hidden = false;

    const alvo = /^#linha-\d+$/.test(location.hash) ? location.hash : null;
    if (alvo) {
      // Veio de um resultado da busca: mostra o texto inteiro, com o termo destacado,
      // e rola até a linha encontrada
      renderizarTexto('', realceDaBusca);
      const linha = document.querySelector(alvo);
      if (linha) {
        linha.style.background = 'var(--primaria-clara)';
        linha.scrollIntoView({ block: 'center' });
      }
    } else {
      campoFiltro.value = destaque;
      renderizarTexto(destaque);
    }
  } catch (erro) {
    titulo.textContent = 'Não foi possível carregar a ata';
    status.textContent = erro.message;
    status.className = 'status erro';
  }
}

let espera;
campoFiltro.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(() => renderizarTexto(campoFiltro.value), 200);
});
document.getElementById('form-filtro-texto').addEventListener('submit', e => e.preventDefault());

carregar();
