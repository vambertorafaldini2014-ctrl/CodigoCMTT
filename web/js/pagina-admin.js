import { api, ErroApi } from './api.js';
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from './config.js';
import { escaparHtml, formatarDataHora, formatarNumero, paraCsv } from './util.js';

const POR_PAGINA = 50;
const status = document.getElementById('status');
const formLogin = document.getElementById('form-login');
const painel = document.getElementById('painel-admin');
const filtroNota = document.getElementById('filtro-nota');
const btnAnterior = document.getElementById('botao-anterior');
const btnProxima = document.getElementById('botao-proxima');

let cliente = null;
let token = null;
let pagina = 1;

function mostrarStatus(texto, tipo = '') {
  status.textContent = texto;
  status.className = `status ${tipo}`;
}

function mostrarLogin(mensagem = '', tipo = '') {
  token = null;
  painel.hidden = true;
  formLogin.hidden = false;
  mostrarStatus(mensagem, tipo);
}

async function entrar(sessao) {
  token = sessao.access_token;
  mostrarStatus('Verificando permissão…');
  try {
    const { email } = await api.admin.eu(token);
    document.getElementById('usuario').textContent = `Conectado como ${email}`;
    formLogin.hidden = true;
    painel.hidden = false;
    mostrarStatus('');
    await carregar();
    document.getElementById('titulo-feedbacks').focus();
  } catch (erro) {
    await cliente.auth.signOut();
    const semPermissao = erro instanceof ErroApi && erro.status === 403;
    mostrarLogin(semPermissao ? 'Este usuário não tem permissão de administrador.' : erro.message, 'erro');
  }
}

function estrelas(n) {
  return n ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)} <span class="visualmente-oculto">(${n} de 5)</span>` : '—';
}

async function carregar() {
  mostrarStatus('Carregando feedbacks…');
  try {
    const dados = await api.admin.feedback({ avaliacao: filtroNota.value, pagina, por_pagina: POR_PAGINA }, token);
    const notas = Object.fromEntries(dados.distribuicao.map(d => [d.avaliacao ?? 'sem', d.total]));
    document.getElementById('resumo').innerHTML = [
      [formatarNumero(dados.total), 'feedbacks recebidos'],
      [dados.media ? dados.media.toLocaleString('pt-BR') : '—', 'avaliação média (1 a 5)'],
      [formatarNumero((notas[5] ?? 0) + (notas[4] ?? 0)), 'avaliações 4 ou 5'],
      [formatarNumero(notas.sem ?? 0), 'sem avaliação'],
    ].map(([v, r]) => `<li class="indicador"><span class="valor">${v}</span><span class="rotulo">${r}</span></li>`).join('');

    document.getElementById('corpo-feedbacks').innerHTML = dados.itens.length
      ? dados.itens.map(f => `
        <tr>
          <td>${formatarDataHora(f.criado_em)}</td>
          <td>${escaparHtml(f.nome || 'Anônimo')}</td>
          <td>${estrelas(f.avaliacao)}</td>
          <td style="white-space: pre-wrap">${escaparHtml(f.mensagem)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">Nenhum feedback encontrado.</td></tr>';

    const totalPaginas = Math.max(1, Math.ceil(dados.total_filtrado / POR_PAGINA));
    document.getElementById('legenda-feedbacks').textContent = `${formatarNumero(dados.total_filtrado)} feedbacks`;
    document.getElementById('info-pagina').textContent = `Página ${pagina} de ${totalPaginas}`;
    btnAnterior.disabled = pagina <= 1;
    btnProxima.disabled = pagina >= totalPaginas;
    mostrarStatus('');
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 401) {
      await cliente.auth.signOut();
      mostrarLogin('Sua sessão expirou. Entre novamente.', 'erro');
    } else {
      mostrarStatus(erro.message, 'erro');
    }
  }
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = formLogin.querySelector('button[type="submit"]');
  botao.disabled = true;
  mostrarStatus('Entrando…');
  const { data, error } = await cliente.auth.signInWithPassword({
    email: document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-senha').value,
  });
  botao.disabled = false;
  document.getElementById('login-senha').value = '';
  if (error || !data.session) {
    mostrarStatus('E-mail ou senha incorretos.', 'erro');
    document.getElementById('login-email').focus();
    return;
  }
  await entrar(data.session);
});

document.getElementById('botao-sair').addEventListener('click', async () => {
  await cliente.auth.signOut();
  mostrarLogin('Você saiu da área administrativa.', 'sucesso');
  document.getElementById('login-email').focus();
});

filtroNota.addEventListener('change', () => { pagina = 1; carregar(); });
btnAnterior.addEventListener('click', () => { pagina--; carregar(); });
btnProxima.addEventListener('click', () => { pagina++; carregar(); });

document.getElementById('botao-csv').addEventListener('click', async () => {
  try {
    const dados = await api.admin.feedback({ avaliacao: filtroNota.value, pagina: 1, por_pagina: 500 }, token);
    const csv = paraCsv(dados.itens.map(f => ({ ...f, criado_em: formatarDataHora(f.criado_em) })), [
      { campo: 'criado_em', titulo: 'Data' }, { campo: 'nome', titulo: 'Nome' },
      { campo: 'avaliacao', titulo: 'Avaliação' }, { campo: 'mensagem', titulo: 'Mensagem' },
    ]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'feedbacks_CMTT.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (erro) {
    mostrarStatus(erro.message, 'erro');
  }
});

document.getElementById('titulo-feedbacks').tabIndex = -1;

// Início: retoma a sessão salva pelo Supabase, se houver
(async () => {
  if (!window.supabase) {
    mostrarStatus('Não foi possível carregar o serviço de login. Verifique sua conexão.', 'erro');
    return;
  }
  cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA);
  const { data } = await cliente.auth.getSession();
  if (data.session) await entrar(data.session);
  else mostrarLogin();
})();
