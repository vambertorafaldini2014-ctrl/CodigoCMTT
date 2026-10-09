// Aplica as partes comuns (web/partes/*.html) em todas as páginas do site:
// trechos do <head>, cabeçalho com menu e rodapé. Assim cada parte é editada num só lugar.
//
//   node scripts/paginas.js            -> atualiza as páginas
//   node scripts/paginas.js --verificar -> só confere (usado pelos testes)
//
// Cada página marca onde as partes entram com comentários: <!-- partes:topo --> ... <!-- /partes:topo -->
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MENU = [
  ['index.html', 'Busca'],
  ['reunioes.html', 'Reuniões'],
  ['conselho.html', 'Conselho'],
  ['painel.html', 'Painel'],
  ['sobre.html', 'Sobre'],
];

// Página -> item do menu que fica marcado como atual (null: nenhum)
export const PAGINAS = {
  'index.html': 'index.html',
  'reunioes.html': 'reunioes.html',
  'reuniao.html': 'reunioes.html',
  'conselho.html': 'conselho.html',
  'painel.html': 'painel.html',
  'sobre.html': 'sobre.html',
  '404.html': null,
  'admin.html': null,
};

const PARTES = ['cabeca', 'topo', 'rodape'];

function lerParte(nome) {
  return readFileSync(join(RAIZ, 'partes', `${nome}.html`), 'utf-8').replace(/\r\n/g, '\n').trimEnd();
}

export function htmlMenu(ativo) {
  return MENU.map(([href, rotulo]) =>
    `          <li><a href="${href}"${href === ativo ? ' aria-current="page"' : ''}>${rotulo}</a></li>`).join('\n');
}

/** Devolve o HTML da página com as partes atualizadas. */
export function montarPagina(html, ativo) {
  let resultado = html.replace(/\r\n/g, '\n');
  for (const nome of PARTES) {
    const conteudo = lerParte(nome).replace('{{menu}}', htmlMenu(ativo));
    const marcacao = new RegExp(`(<!-- partes:${nome} -->)[\\s\\S]*?(<!-- /partes:${nome} -->)`);
    if (!marcacao.test(resultado)) throw new Error(`Marcação "partes:${nome}" não encontrada`);
    resultado = resultado.replace(marcacao, (_, inicio, fim) => `${inicio}\n${conteudo}\n  ${fim}`);
  }
  return resultado;
}

function executar() {
  const verificar = process.argv.includes('--verificar');
  const desatualizadas = [];
  for (const [arquivo, ativo] of Object.entries(PAGINAS)) {
    const caminho = join(RAIZ, arquivo);
    const atual = readFileSync(caminho, 'utf-8').replace(/\r\n/g, '\n');
    const novo = montarPagina(atual, ativo);
    if (novo === atual) continue;
    desatualizadas.push(arquivo);
    if (!verificar) writeFileSync(caminho, novo);
  }
  if (verificar && desatualizadas.length) {
    console.error(`Páginas desatualizadas: ${desatualizadas.join(', ')}. Rode: node scripts/paginas.js`);
    process.exit(1);
  }
  console.log(desatualizadas.length ? `Atualizadas: ${desatualizadas.join(', ')}` : 'Todas as páginas já estão atualizadas.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) executar();
