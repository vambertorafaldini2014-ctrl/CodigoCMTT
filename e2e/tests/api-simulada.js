// API simulada: intercepta as chamadas do site para http://localhost:8000/api/* e responde
// com dados fixos. Assim os testes não dependem do Render nem do Supabase.
const API = 'http://localhost:8000/api';
const PDF = (arquivo) => `https://raw.githubusercontent.com/exemplo/CodigoCMTT/main/dados/base_dados/pdf_atas_pleno/${arquivo}`;

export const TOTAL_RESULTADOS = 30;

const linhasAta = Array.from({ length: 50 }, (_, i) =>
  i === 19 ? 'Discussão sobre as novas Ciclovias da cidade e a ciclovia da Paulista.' : `Linha ${i + 1} da ata.`);

const reunioes = [
  { id: 1, arquivo: '75_2024_Pleno_ordin_ata.pdf', titulo: '75ª Reunião Ordinária', tipo: 'Ordinária',
    data: '2024-11-01', ano: 2024, local: 'Online – Microsoft Teams', total_linhas: 50,
    tema_principal: 'Mobilidade Ativa e Acessibilidade' },
  { id: 2, arquivo: 'extra_07_2024_Pleno_ata.pdf', titulo: 'Reunião Extraordinária', tipo: 'Extraordinária',
    data: '2024-11-22', ano: 2024, local: null, total_linhas: 40, tema_principal: null },
].map((r) => ({ ...r, url_pdf: PDF(r.arquivo) }));

function busca(params) {
  const q = params.get('q') ?? '';
  const modo = params.get('modo') ?? 'inteligente';
  const pagina = Number(params.get('pagina') ?? 1);
  const porPagina = Number(params.get('por_pagina') ?? 50);
  const total = q.includes('inexistente') ? 0 : TOTAL_RESULTADOS;
  const todos = Array.from({ length: total }, (_, i) => ({
    reuniao_id: 1, arquivo: reunioes[0].arquivo, titulo: reunioes[0].titulo, data: '2024-11-01',
    ano: 2024, ordem: 20, texto: linhasAta[19], url_pdf: reunioes[0].url_pdf, n: i,
  }));
  return {
    termo: q, modo, ordem: params.get('ordem') ?? 'relevancia',
    radicais: modo === 'inteligente' && total ? ['ciclov'] : [],
    pagina, por_pagina: porPagina, total,
    por_ano: total ? [{ ano: 2023, ocorrencias: 10 }, { ano: 2024, ocorrencias: 20 }] : [],
    resultados: todos.slice((pagina - 1) * porPagina, pagina * porPagina),
  };
}

const estatisticas = {
  totais: { reunioes: 91, linhas: 52827, mandatos: 2, pessoas: 220 },
  reunioes_por_ano: [{ ano: 2023, ordinarias: 6, extraordinarias: 0 }, { ano: 2024, ordinarias: 6, extraordinarias: 2 }],
  temas: [{ tema: 'Transporte Público Coletivo', ocorrencias: 3798, reunioes: 90 },
    { tema: 'Mobilidade Ativa e Acessibilidade', ocorrencias: 3119, reunioes: 88 }],
  temas_por_ano: [{ ano: 2023, tema: 'Transporte Público Coletivo', ocorrencias: 300 },
    { ano: 2024, tema: 'Transporte Público Coletivo', ocorrencias: 350 }],
  genero_por_mandato: [{ mandato: '2022fev 2024fev', feminino: 45, masculino: 62, nao_informado: 0, cadeiras: 64 },
    { mandato: '2024mar 2026jan', feminino: 41, masculino: 73, nao_informado: 1, cadeiras: 67 }],
  segmentos_mandato_atual: [{ segmento: 'ÓRGÃOS MUNICIPAIS', cadeiras: 20 }, { segmento: 'SOCIEDADE CIVIL - REGIONAIS', cadeiras: 12 }],
};

const mandatos = [{ id: 6, codigo: '2024mar 2026jan', inicio: '2024-03-01', fim: '2026-01-31', cadeiras: 67, conselheiros: 114, reunioes: 15 }];

const mandato6 = {
  id: 6, codigo: '2024mar 2026jan', inicio: '2024-03-01', fim: '2026-01-31',
  cadeiras: [
    { segmento: 'ÓRGÃOS MUNICIPAIS', orgao: 'Companhia de Engenharia de Tráfego – CET', cadeira: 'CET 1',
      titulares: [{ nome: 'Ana Souza', genero: 'F' }], suplentes: [{ nome: 'Bruno Lima', genero: 'M' }] },
    { segmento: 'SOCIEDADE CIVIL - REGIONAIS', orgao: 'Região Sul', cadeira: 'REGIONAIS - SUL 1',
      titulares: [{ nome: 'Carla Dias', genero: 'F' }], suplentes: [] },
  ],
};

// ---- Login (Supabase Auth simulado) ----
export const EMAIL_ADMIN = 'admin@exemplo.com';
const FEEDBACKS = [
  { id: 4, criado_em: '2026-10-09T15:30:00Z', nome: 'Ana', mensagem: 'Muito útil para a pesquisa!', avaliacao: 5 },
  { id: 3, criado_em: '2026-10-08T12:00:00Z', nome: null, mensagem: 'Poderia ter mais filtros.', avaliacao: 3 },
  { id: 2, criado_em: '2026-10-07T12:00:00Z', nome: 'Bruno', mensagem: '<script>alert(1)</script>', avaliacao: 5 },
  { id: 1, criado_em: '2026-10-06T12:00:00Z', nome: 'Carla', mensagem: 'Sem nota', avaliacao: null },
];

const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function tokenFalso(email) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: email, email, exp, role: 'authenticated', aud: 'authenticated' })}.assinatura`;
}
function emailDoToken(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).email; } catch { return null; }
}

/** Simula o Supabase Auth: senha "senha-correta" funciona para qualquer e-mail. */
export async function simularSupabase(page) {
  await page.route('https://aigencggrhljwzibbbfo.supabase.co/auth/v1/**', async (rota) => {
    const url = new URL(rota.request().url());
    if (url.pathname.endsWith('/token')) {
      const { email, password } = rota.request().postDataJSON();
      if (password !== 'senha-correta') {
        return rota.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
      }
      const usuario = { id: email, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
      return rota.fulfill({ json: { access_token: tokenFalso(email), token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'renovar', user: usuario } });
    }
    if (url.pathname.endsWith('/logout')) return rota.fulfill({ status: 204, body: '' });
    return rota.fulfill({ status: 404, json: {} });
  });
}

/** Liga a API simulada na página. Devolve a lista de feedbacks recebidos (para conferir nos testes). */
export async function simularApi(page) {
  const feedbacks = [];
  // VLibras é um serviço externo: bloqueado nos testes para não depender da internet
  await page.route('https://vlibras.gov.br/**', (rota) => rota.abort());
  await page.route(`${API}/**`, async (rota) => {
    const url = new URL(rota.request().url());
    const caminho = url.pathname.replace('/api', '');
    const json = (corpo, status = 200) => rota.fulfill({ status, json: corpo });

    if (caminho === '/saude') return json({ status: 'ok', banco: true });
    if (caminho === '/anos') return json([2024, 2023]);
    if (caminho === '/busca') return json(busca(url.searchParams));
    if (caminho === '/reunioes') return json(reunioes);
    if (caminho === '/reunioes/1') {
      return json({ ...reunioes[0], mandato: '2024mar 2026jan', linhas: linhasAta,
        temas: [{ tema: 'Mobilidade Ativa e Acessibilidade', ocorrencias: 12 }] });
    }
    if (caminho === '/mandatos') return json(mandatos);
    if (caminho === '/mandatos/6') return json(mandato6);
    if (caminho === '/conselheiros') {
      return json([{ nome: 'Ana Souza', funcao: 'TITULAR', orgao: 'CET', segmento: 'ÓRGÃOS MUNICIPAIS', mandato: '2024mar 2026jan', inicio: '2024-03-01' }]);
    }
    if (caminho === '/estatisticas') return json(estatisticas);
    if (caminho.startsWith('/admin/')) {
      const autorizacao = rota.request().headers().authorization ?? '';
      const email = emailDoToken(autorizacao.replace('Bearer ', ''));
      if (!email) return json({ detail: 'Faça login para acessar.' }, 401);
      if (email !== EMAIL_ADMIN) return json({ detail: 'Este usuário não tem permissão de administrador.' }, 403);
      if (caminho === '/admin/eu') return json({ email });
      const nota = url.searchParams.get('avaliacao');
      const itens = FEEDBACKS.filter((f) => !nota || String(f.avaliacao) === nota);
      return json({ total: FEEDBACKS.length, media: 4.33, total_filtrado: itens.length, pagina: 1, por_pagina: 50,
        distribuicao: [{ avaliacao: 3, total: 1 }, { avaliacao: 5, total: 2 }, { avaliacao: null, total: 1 }], itens });
    }
    if (caminho === '/feedback' && rota.request().method() === 'POST') {
      feedbacks.push(rota.request().postDataJSON());
      return json({ id: feedbacks.length, mensagem: 'Obrigado pelo seu feedback!' }, 201);
    }
    return json({ detail: 'Não encontrado' }, 404);
  });
  return feedbacks;
}
