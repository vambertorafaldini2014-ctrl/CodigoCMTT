import { api } from './api.js';
import { coresGraficos } from './acessibilidade.js';
import { escaparHtml, formatarDataHora, formatarNumero, percentualMulheres, quebrarRotulo, rotuloMandato } from './util.js';

const status = document.getElementById('status');
const seletorTema = document.getElementById('seletor-tema');
const graficos = {};
let dados = null;

/** Tabela acessível equivalente ao gráfico (para leitores de tela e quem prefere números). */
function tabela(destino, titulo, colunas, linhas) {
  document.getElementById(destino).innerHTML = `
    <table>
      <caption>${escaparHtml(titulo)}</caption>
      <thead><tr>${colunas.map(c => `<th scope="col">${escaparHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${escaparHtml(typeof v === 'number' ? formatarNumero(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

function grafico(id, config) {
  const cores = coresGraficos();
  graficos[id]?.destroy();
  const eixos = config.options?.scales ?? {};
  for (const eixo of Object.values(eixos)) {
    eixo.ticks = { color: cores.texto, ...eixo.ticks };
    eixo.grid = { color: cores.grade };
  }
  graficos[id] = new window.Chart(document.getElementById(id), {
    ...config,
    options: {
      maintainAspectRatio: false,
      ...config.options,
      plugins: { legend: { labels: { color: cores.texto } }, ...config.options?.plugins },
    },
  });
}

function desenharEvolucao() {
  const tema = seletorTema.value;
  const anos = [...new Set(dados.reunioes_por_ano.map(r => r.ano))];
  const porAno = Object.fromEntries(dados.temas_por_ano.filter(t => t.tema === tema).map(t => [t.ano, t.ocorrencias]));
  const valores = anos.map(a => porAno[a] ?? 0);
  grafico('g-evolucao', {
    type: 'line',
    data: { labels: anos, datasets: [{ label: tema, data: valores, borderColor: coresGraficos().serie[2], backgroundColor: coresGraficos().serie[2], tension: .25 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: {}, y: { beginAtZero: true } } },
  });
  tabela('d-evolucao', `Menções a "${tema}" por ano`, ['Ano', 'Menções'], anos.map((a, i) => [a, valores[i]]));
}

function desenharTudo() {
  const cores = coresGraficos();
  const { totais, reunioes_por_ano: rpa, temas, genero_por_mandato: gen, segmentos_mandato_atual: seg } = dados;

  document.getElementById('indicadores').innerHTML = [
    [totais.reunioes, 'atas de reuniões'],
    [totais.linhas, 'linhas de texto pesquisáveis'],
    [totais.mandatos, 'mandatos'],
    [totais.pessoas, 'pessoas já foram conselheiras'],
  ].map(([v, r]) => `<li class="indicador"><span class="valor">${formatarNumero(v)}</span><span class="rotulo">${r}</span></li>`).join('');

  grafico('g-reunioes', {
    type: 'bar',
    data: {
      labels: rpa.map(r => r.ano),
      datasets: [
        { label: 'Ordinárias', data: rpa.map(r => r.ordinarias), backgroundColor: cores.serie[0] },
        { label: 'Extraordinárias / técnicas', data: rpa.map(r => r.extraordinarias), backgroundColor: cores.serie[1] },
      ],
    },
    options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
  });
  tabela('d-reunioes', 'Reuniões por ano', ['Ano', 'Ordinárias', 'Extraordinárias / técnicas'],
    rpa.map(r => [r.ano, r.ordinarias, r.extraordinarias]));

  grafico('g-temas', {
    type: 'bar',
    data: { labels: temas.map(t => quebrarRotulo(t.tema)), datasets: [{ label: 'Menções', data: temas.map(t => t.ocorrencias), backgroundColor: cores.serie[0] }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { autoSkip: false } } } },
  });
  tabela('d-temas', 'Temas mais debatidos', ['Tema', 'Menções', 'Reuniões em que aparece'],
    temas.map(t => [t.tema, t.ocorrencias, t.reunioes]));

  desenharEvolucao();

  const pctF = gen.map(g => percentualMulheres(g));
  const temNaoInformado = gen.some(g => g.nao_informado > 0);
  grafico('g-genero', {
    type: 'bar',
    data: {
      labels: gen.map(g => rotuloMandato(g.mandato)),
      datasets: [
        { label: 'Mulheres', data: gen.map(g => g.feminino), backgroundColor: cores.serie[1] },
        { label: 'Homens', data: gen.map(g => g.masculino), backgroundColor: cores.serie[0] },
        ...(temNaoInformado ? [{ label: 'Não informado', data: gen.map(g => g.nao_informado), backgroundColor: cores.serie[6] ?? cores.serie[4] }] : []),
      ],
    },
    options: {
      plugins: { tooltip: { callbacks: { footer: (itens) => `${pctF[itens[0].dataIndex]}% mulheres` } } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
  tabela('d-genero', 'Pessoas distintas por gênero e mandato',
    ['Mandato', 'Cadeiras', 'Mulheres', 'Homens', 'Não informado', '% mulheres'],
    gen.map((g, i) => [rotuloMandato(g.mandato), g.cadeiras, g.feminino, g.masculino, g.nao_informado, `${pctF[i]}%`]));

  grafico('g-segmentos', {
    type: 'bar',
    data: { labels: seg.map(s => quebrarRotulo(s.segmento)), datasets: [{ label: 'Cadeiras', data: seg.map(s => s.cadeiras), backgroundColor: cores.serie[3] }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { autoSkip: false } } } },
  });
  tabela('d-segmentos', 'Cadeiras por segmento no mandato atual', ['Segmento', 'Cadeiras'], seg.map(s => [s.segmento, s.cadeiras]));
}

seletorTema.addEventListener('change', desenharEvolucao);
window.addEventListener('cmtt:tema', () => { if (dados) desenharTudo(); });

// Cópia local das últimas estatísticas: aparece na hora enquanto a API (plano gratuito) acorda.
const CHAVE_CACHE = 'cmtt-estatisticas';

function lerCache() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CACHE)); } catch { return null; }
}

function salvarCache(valor) {
  try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ salvoEm: new Date().toISOString(), dados: valor })); } catch { /* modo privado */ }
}

function mostrar(novos) {
  dados = novos;
  const temaAtual = seletorTema.value;
  seletorTema.replaceChildren(...dados.temas.map(t => new Option(t.tema, t.tema)));
  if (dados.temas.some(t => t.tema === temaAtual)) seletorTema.value = temaAtual;
  desenharTudo();
}

(async () => {
  const cache = lerCache();
  if (cache?.dados) {
    mostrar(cache.dados);
    status.textContent = `Mostrando dados salvos em ${formatarDataHora(cache.salvoEm)}. Atualizando…`;
  } else {
    status.textContent = 'Carregando indicadores…';
  }
  try {
    const novos = await api.estatisticas();
    salvarCache(novos);
    mostrar(novos);
    status.textContent = '';
  } catch (e) {
    status.className = 'status erro';
    status.textContent = cache?.dados
      ? `Não foi possível atualizar agora. Mostrando dados salvos em ${formatarDataHora(cache.salvoEm)}.`
      : e.message;
  }
})();
