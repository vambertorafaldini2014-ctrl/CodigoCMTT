// Cliente da API REST (fetch). Lida com o "cold start" do plano gratuito do Render,
// que desliga o servidor após alguns minutos sem uso e leva até ~1 min para religar.
import { API_BASE } from './config.js';
import { montarQuery } from './util.js';

const TEMPO_AVISO_MS = 4000;
const TEMPO_LIMITE_MS = 90000;

let avisoEl = null;

function mostrarAvisoServidor() {
  if (avisoEl) return;
  const main = document.querySelector('main');
  if (!main) return;
  avisoEl = document.createElement('div');
  avisoEl.className = 'aviso-servidor';
  avisoEl.setAttribute('role', 'status');
  avisoEl.textContent = 'Iniciando o servidor (hospedagem gratuita). A primeira consulta pode levar até 1 minuto…';
  main.prepend(avisoEl);
}

function esconderAvisoServidor() {
  avisoEl?.remove();
  avisoEl = null;
}

export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

async function requisitar(caminho, opcoes = {}) {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  const aviso = setTimeout(mostrarAvisoServidor, TEMPO_AVISO_MS);
  try {
    const resp = await fetch(API_BASE + caminho, { ...opcoes, signal: controle.signal });
    const corpo = await resp.json().catch(() => null);
    if (!resp.ok) {
      const detalhe = typeof corpo?.detail === 'string' ? corpo.detail : 'Verifique os dados informados.';
      throw new ErroApi(`Erro ${resp.status}: ${detalhe}`, resp.status);
    }
    return corpo;
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro;
    if (erro.name === 'AbortError') throw new ErroApi('O servidor demorou demais para responder. Tente novamente.', 0);
    throw new ErroApi('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.', 0);
  } finally {
    clearTimeout(limite);
    clearTimeout(aviso);
    esconderAvisoServidor();
  }
}

export const api = {
  anos: () => requisitar('/api/anos'),
  reunioes: (filtros) => requisitar('/api/reunioes' + montarQuery(filtros)),
  reuniao: (id) => requisitar(`/api/reunioes/${encodeURIComponent(id)}`),
  buscar: (params) => requisitar('/api/busca' + montarQuery(params)),
  mandatos: () => requisitar('/api/mandatos'),
  mandato: (id) => requisitar(`/api/mandatos/${encodeURIComponent(id)}`),
  conselheiros: (q) => requisitar('/api/conselheiros' + montarQuery({ q })),
  estatisticas: () => requisitar('/api/estatisticas'),
  enviarFeedback: (dados) => requisitar('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  }),
  // Área administrativa: exigem o token de acesso do login (Supabase Auth)
  admin: {
    eu: (token) => requisitar('/api/admin/eu', { headers: { Authorization: `Bearer ${token}` } }),
    feedback: (filtros, token) => requisitar('/api/admin/feedback' + montarQuery(filtros), {
      headers: { Authorization: `Bearer ${token}` },
    }),
  },
};
