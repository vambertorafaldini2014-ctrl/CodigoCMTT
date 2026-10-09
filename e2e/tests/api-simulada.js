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
    if (caminho === '/feedback' && rota.request().method() === 'POST') {
      feedbacks.push(rota.request().postDataJSON());
      return json({ id: feedbacks.length, mensagem: 'Obrigado pelo seu feedback!' }, 201);
    }
    return json({ detail: 'Não encontrado' }, 404);
  });
  return feedbacks;
}
