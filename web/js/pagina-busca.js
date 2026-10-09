import { api } from './api.js';
import { coresGraficos } from './acessibilidade.js';
import { destacar, destacarRadicais, escaparHtml, formatarData, formatarNumero, paraCsv } from './util.js';

const POR_PAGINA = 25;
const form = document.getElementById('form-busca');
const campoTermo = document.getElementById('campo-termo');
const campoAno = document.getElementById('campo-ano');
const campoModo = document.getElementById('campo-modo');
const campoOrdem = document.getElementById('campo-ordem');
const status = document.getElementById('status');
const secaoResultados = document.getElementById('secao-resultados');
const secaoTendencia = document.getElementById('secao-tendencia');
const lista = document.getElementById('lista-resultados');
const tituloResultados = document.getElementById('titulo-resultados');
const btnAnterior = document.getElementById('botao-anterior');
const btnProxima = document.getElementById('botao-proxima');
const infoPagina = document.getElementById('info-pagina');

let estado = { q: '', ano: '', modo: 'inteligente', ordem: 'relevancia', pagina: 1, total: 0 };

/** Parâmetros da busca enviados à API (e guardados na URL). */
function filtros() {
  return { q: estado.q, ano: estado.ano, modo: estado.modo, ordem: estado.ordem };
}

/** Destaque no texto: por radicais na busca inteligente, pelo texto digitado na busca exata. */
function realce(texto, dados) {
  return dados.radicais?.length ? destacarRadicais(texto, dados.radicais) : destacar(texto, estado.q);
}
let grafico = null;
let ultimaTendencia = [];

function mostrarStatus(texto, tipo = '') {
  status.textContent = texto;
  status.className = `status ${tipo}`;
}

async function carregarAnos() {
  try {
    const anos = await api.anos();
    for (const ano of anos) campoAno.add(new Option(ano, ano));
    campoAno.value = estado.ano;
  } catch { /* o filtro de ano é opcional */ }
}

function desenharTendencia(porAno) {
  ultimaTendencia = porAno;
  secaoTendencia.hidden = porAno.length === 0;
  document.getElementById('tabela-tendencia').innerHTML =
    '<table><caption>Ocorrências por ano</caption><thead><tr><th scope="col">Ano</th><th scope="col">Ocorrências</th></tr></thead><tbody>' +
    porAno.map(l => `<tr><td>${l.ano}</td><td>${formatarNumero(l.ocorrencias)}</td></tr>`).join('') +
    '</tbody></table>';

  if (!window.Chart) return;
  const cores = coresGraficos();
  grafico?.destroy();
  grafico = new window.Chart(document.getElementById('grafico-tendencia'), {
    type: 'bar',
    data: {
      labels: porAno.map(l => l.ano),
      datasets: [{ label: 'Ocorrências', data: porAno.map(l => l.ocorrencias), backgroundColor: cores.serie[0] }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: cores.texto }, grid: { color: cores.grade } },
        y: { beginAtZero: true, ticks: { color: cores.texto, precision: 0 }, grid: { color: cores.grade } },
      },
    },
  });
}

function desenharResultados(dados) {
  const destaqueAta = dados.radicais?.length
    ? `radicais=${encodeURIComponent(dados.radicais.join(','))}`
    : `destaque=${encodeURIComponent(estado.q)}`;
  lista.innerHTML = dados.resultados.map(r => `
    <li class="resultado">
      <h3><a href="reuniao.html?id=${r.reuniao_id}&amp;${destaqueAta}#linha-${r.ordem}">${escaparHtml(r.titulo)}</a></h3>
      <p class="meta">${formatarData(r.data)} · linha ${r.ordem}</p>
      <blockquote>${realce(r.texto, dados)}</blockquote>
      <div class="acoes">
        <a href="${escaparHtml(r.url_pdf)}" target="_blank" rel="noopener">Abrir PDF original<span class="visualmente-oculto"> (abre em nova aba)</span></a>
      </div>
    </li>`).join('');

  const totalPaginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA));
  infoPagina.textContent = `Página ${estado.pagina} de ${totalPaginas}`;
  btnAnterior.disabled = estado.pagina <= 1;
  btnProxima.disabled = estado.pagina >= totalPaginas;
  tituloResultados.textContent = `Resultados (${formatarNumero(dados.total)})`;
  secaoResultados.hidden = dados.total === 0;
}

async function pesquisar({ focarResultados = false } = {}) {
  if (estado.q.trim().length < 2) {
    mostrarStatus('Digite ao menos 2 caracteres para pesquisar.', 'erro');
    campoTermo.focus();
    return;
  }
  // Mantém a busca na URL, para poder compartilhar o link ou usar o botão "voltar"
  const url = new URL(location.href);
  url.search = new URLSearchParams(Object.entries({ ...filtros(), pagina: estado.pagina > 1 ? estado.pagina : '' })
    .filter(([, v]) => v !== ''));
  history.replaceState(null, '', url);

  mostrarStatus('Pesquisando…');
  try {
    const dados = await api.buscar({ ...filtros(), pagina: estado.pagina, por_pagina: POR_PAGINA });
    estado.total = dados.total;
    if (dados.total === 0) {
      const sugestao = estado.modo === 'exato' ? ' Experimente a busca inteligente.' : ' Tente outras palavras.';
      mostrarStatus(`Nenhum resultado para “${estado.q}”.${sugestao}`);
      secaoResultados.hidden = true;
      secaoTendencia.hidden = true;
      return;
    }
    // A API usa a busca exata quando o termo só tem palavras muito comuns ("de", "o"...)
    const aviso = dados.modo !== estado.modo ? ' (termo muito comum: usada a busca por texto exato)' : '';
    mostrarStatus(`${formatarNumero(dados.total)} ocorrências encontradas para “${estado.q}”${aviso}.`, 'sucesso');
    if (estado.pagina === 1) desenharTendencia(dados.por_ano);
    desenharResultados(dados);
    if (focarResultados) tituloResultados.focus();
  } catch (erro) {
    mostrarStatus(erro.message, 'erro');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  estado = { ...estado, q: campoTermo.value.trim(), ano: campoAno.value, modo: campoModo.value, ordem: campoOrdem.value, pagina: 1 };
  pesquisar();
});

// Trocar o tipo de busca ou a ordem refaz a pesquisa atual
for (const campo of [campoModo, campoOrdem]) {
  campo.addEventListener('change', () => {
    if (!estado.q) return;
    estado = { ...estado, modo: campoModo.value, ordem: campoOrdem.value, pagina: 1 };
    pesquisar();
  });
}

tituloResultados.tabIndex = -1;
btnAnterior.addEventListener('click', () => { estado.pagina--; pesquisar({ focarResultados: true }); });
btnProxima.addEventListener('click', () => { estado.pagina++; pesquisar({ focarResultados: true }); });

document.getElementById('botao-csv').addEventListener('click', async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  mostrarStatus('Preparando arquivo CSV…');
  try {
    // Exporta até 1.000 resultados (5 páginas de 200)
    const linhas = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const dados = await api.buscar({ ...filtros(), pagina, por_pagina: 200 });
      linhas.push(...dados.resultados.map(r => ({ ...r, data: formatarData(r.data) })));
      if (linhas.length >= dados.total) break;
    }
    const csv = paraCsv(linhas, [
      { campo: 'data', titulo: 'Data' }, { campo: 'titulo', titulo: 'Reunião' },
      { campo: 'ordem', titulo: 'Linha' }, { campo: 'texto', titulo: 'Contexto' },
      { campo: 'url_pdf', titulo: 'Link do PDF' },
    ]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `busca_CMTT_${estado.q.replace(/\W+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarStatus(`Arquivo CSV com ${formatarNumero(linhas.length)} linhas baixado.`, 'sucesso');
  } catch (erro) {
    mostrarStatus(erro.message, 'erro');
  } finally {
    botao.disabled = false;
  }
});

window.addEventListener('cmtt:tema', () => { if (grafico) desenharTendencia(ultimaTendencia); });

// Se a página abriu com ?q=..., executa a busca automaticamente
const params = new URLSearchParams(location.search);
estado.q = params.get('q') || '';
estado.ano = params.get('ano') || '';
estado.pagina = Number(params.get('pagina')) || 1;
if (params.get('modo') === 'exato') estado.modo = 'exato';
if (params.get('ordem') === 'data') estado.ordem = 'data';
campoTermo.value = estado.q;
campoModo.value = estado.modo;
campoOrdem.value = estado.ordem;
carregarAnos();
if (estado.q) pesquisar();
