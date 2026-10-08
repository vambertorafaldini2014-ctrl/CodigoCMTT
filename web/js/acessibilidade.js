// Barra de acessibilidade: tamanho da fonte, alto contraste e VLibras (Libras).
// As preferências ficam salvas no navegador (localStorage) só para conveniência.

const CHAVE = 'cmtt-acessibilidade';
const TAMANHOS = [100, 112.5, 125, 137.5, 150];

function lerPreferencias() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; }
}

function salvarPreferencias(prefs) {
  try { localStorage.setItem(CHAVE, JSON.stringify(prefs)); } catch { /* modo privado */ }
}

const prefs = { fonte: 0, contraste: false, ...lerPreferencias() };

function aplicar() {
  document.documentElement.style.fontSize = `${TAMANHOS[prefs.fonte]}%`;
  if (prefs.contraste) document.documentElement.dataset.contraste = 'alto';
  else delete document.documentElement.dataset.contraste;
  const botaoContraste = document.getElementById('botao-contraste');
  botaoContraste?.setAttribute('aria-pressed', String(prefs.contraste));
  window.dispatchEvent(new CustomEvent('cmtt:tema'));
}

function anunciar(mensagem) {
  const el = document.getElementById('anuncio-acessibilidade');
  if (el) el.textContent = mensagem;
}

document.getElementById('botao-aumentar')?.addEventListener('click', () => {
  prefs.fonte = Math.min(prefs.fonte + 1, TAMANHOS.length - 1);
  aplicar(); salvarPreferencias(prefs);
  anunciar(`Fonte em ${TAMANHOS[prefs.fonte]}%`);
});

document.getElementById('botao-diminuir')?.addEventListener('click', () => {
  prefs.fonte = Math.max(prefs.fonte - 1, 0);
  aplicar(); salvarPreferencias(prefs);
  anunciar(`Fonte em ${TAMANHOS[prefs.fonte]}%`);
});

document.getElementById('botao-contraste')?.addEventListener('click', () => {
  prefs.contraste = !prefs.contraste;
  aplicar(); salvarPreferencias(prefs);
  anunciar(prefs.contraste ? 'Alto contraste ativado' : 'Alto contraste desativado');
});

aplicar();

// ---- VLibras: tradutor oficial do Governo Federal para Língua Brasileira de Sinais ----
function carregarVLibras() {
  const raiz = document.createElement('div');
  raiz.setAttribute('vw', '');
  raiz.className = 'enabled';
  raiz.innerHTML = '<div vw-access-button class="active"></div>' +
    '<div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
  document.body.appendChild(raiz);

  const script = document.createElement('script');
  script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
  script.onload = () => new window.VLibras.Widget('https://vlibras.gov.br/app');
  document.body.appendChild(script);
}

carregarVLibras();

/** Cores para os gráficos, acompanhando o modo de contraste. */
export function coresGraficos() {
  const alto = document.documentElement.dataset.contraste === 'alto';
  return alto
    ? { texto: '#ffffff', grade: '#666666', serie: ['#ffeb3b', '#00e5ff', '#ff80ab', '#b9f6ca', '#ffffff', '#ffab40'] }
    : { texto: '#1b2430', grade: '#e2e8f0', serie: ['#0b4f8a', '#d97706', '#0f766e', '#9333ea', '#be123c', '#4d7c0f', '#475569', '#0369a1', '#a16207', '#7c3aed'] };
}
