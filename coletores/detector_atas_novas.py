"""
Detector de atas novas do Conselho Pleno (usado pelo GitHub Actions toda semana).

Diferente do coletor_atas.py (que baixa tudo e depende de heurísticas de contexto), este script:
  1. lê o BLOCO de cada reunião no site (título, "Data:", "Local:" e o link logo após "Ata:");
  2. considera só atas do Conselho Pleno (ignora apresentações e Câmaras Temáticas);
  3. compara com o índice (dados/configs/index_atas.json) pelo número da reunião ordinária
     ou pela data, no caso de reuniões extraordinárias/técnicas;
  4. com --baixar: baixa só as novas, já com o nome padrão do projeto, atualiza o índice
     e o cache de textos (.cache_corpus_atas.json).

Uso:
    python coletores/detector_atas_novas.py            # só lista o que é novo
    python coletores/detector_atas_novas.py --baixar   # baixa e atualiza índice e cache
"""
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from urllib.parse import urljoin

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, RAIZ)

CABECALHOS = {'User-Agent': 'Mozilla/5.0 (compatible; BuscadorCMTT/1.0; +https://buscador-cmtt.netlify.app)'}


def sem_acento(texto: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn').lower()


@dataclass
class AtaNoSite:
    tipo: str            # 'ordin' | 'extra' | 'tecni'
    numero: int | None   # número da reunião ordinária (None nas extraordinárias/técnicas)
    data: str            # dd/mm/aaaa
    titulo: str
    local: str
    url: str

    @property
    def ano(self) -> str:
        return self.data[-4:]


def ler_bloco(texto: str) -> dict | None:
    """Extrai tipo, número, data, título e local do texto do bloco de uma reunião."""
    t = re.sub(r'\s+', ' ', texto.replace('\xa0', ' ')).strip()
    norm = sem_acento(t)
    if 'camara tematica' in norm or not re.search(r'cmtt|conselho municipal de transito', norm):
        return None
    data = re.search(r'data\s*:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})', norm)
    if not data:
        return None
    dia, mes, ano = data.groups()
    ano = ano if len(ano) == 4 else f'20{ano}'
    numero = re.search(r'(\d+)\s*[ªaº°o]?\s*reuniao\s+ordinaria', norm)
    if 'extraordinaria' in norm.split('data')[0]:
        tipo, titulo = 'extra', 'Reunião Extraordinária'
    elif 'tecnica' in norm.split('data')[0]:
        tipo, titulo = 'tecni', 'Reunião Técnica Ordinária'
    elif numero:
        tipo, titulo = 'ordin', f'{int(numero.group(1))}ª Reunião Ordinária'
    else:
        return None
    local = re.search(r'Local\s*:\s*(.+?)(?:\s+Link\s*:|\s+Ata\s*:|\s+Hor[aá]rio|$)', t)
    return {
        'tipo': tipo, 'numero': int(numero.group(1)) if tipo == 'ordin' else None,
        'data': f'{int(dia):02d}/{int(mes):02d}/{ano}', 'titulo': titulo,
        'local': local.group(1).strip() if local else 'Não informado',
    }


def atas_da_pagina(html: str, url_pagina: str) -> list[AtaNoSite]:
    """Links de ATA (o link que vem logo depois do rótulo "Ata:") de cada bloco de reunião."""
    from bs4 import BeautifulSoup

    sopa = BeautifulSoup(html, 'html.parser')
    atas = []
    for link in sopa.find_all('a', href=True):
        anteriores = [s.strip() for s in link.find_all_previous(string=True, limit=3) if s.strip()]
        if not anteriores or not re.search(r'(^|\s)ata\s*:?$', sem_acento(anteriores[0])):
            continue
        # O site às vezes coloca uma apresentação no lugar da ata: essas são ignoradas
        if 'apresenta' in sem_acento(link['href'] + ' ' + link.get_text(' ', strip=True)):
            continue
        bloco = link.find_parent(['p', 'li', 'td', 'div'])
        dados = ler_bloco(bloco.get_text(' ', strip=True)) if bloco else None
        if dados:
            atas.append(AtaNoSite(url=urljoin(url_pagina, link['href']), **dados))
    return atas


def chaves_existentes(index: dict) -> set[tuple]:
    """('ordin', número) para as ordinárias e (tipo, data) para extraordinárias e técnicas."""
    chaves = set()
    for arquivo, meta in index.items():
        m = re.match(r'^(\d+)_\d{4}_Pleno_ordin_ata\.pdf$', arquivo)
        if m:
            chaves.add(('ordin', int(m.group(1))))
        elif arquivo.startswith(('extra_', 'tecni_')):
            chaves.add((arquivo[:5], meta.get('data_correta')))
    return chaves


def nome_arquivo(ata: AtaNoSite, index: dict, ja_nomeados: list[str]) -> str:
    """Nome no padrão do projeto. Extraordinárias e técnicas seguem a numeração sequencial."""
    if ata.tipo == 'ordin':
        return f'{ata.numero:02d}_{ata.ano}_Pleno_ordin_ata.pdf'
    usados = [int(m.group(1)) for a in [*index, *ja_nomeados] if (m := re.match(rf'^{ata.tipo}_(\d+)_', a))]
    return f'{ata.tipo}_{max(usados, default=0) + 1:02d}_{ata.ano}_Pleno_ata.pdf'


def paginas_para_varrer(html_principal: str, url_principal: str, anos: int = 2) -> list[str]:
    """Página principal + páginas dos anos mais recentes (onde aparecem as atas novas)."""
    from bs4 import BeautifulSoup

    sopa = BeautifulSoup(html_principal, 'html.parser')
    por_ano = {}
    for a in sopa.find_all('a', href=True):
        texto = a.get_text(strip=True)
        if re.fullmatch(r'20[1-3]\d', texto):
            por_ano.setdefault(texto, urljoin(url_principal, a['href']))
    recentes = [por_ano[a] for a in sorted(por_ano, reverse=True)[:anos]]
    return [url_principal, *recentes]


def detectar(index: dict) -> list[tuple[AtaNoSite, str]]:
    import requests
    from core.config_ambiente import URL_BASE_SITE

    html = requests.get(URL_BASE_SITE, headers=CABECALHOS, timeout=60).text
    paginas = {url: (html if url == URL_BASE_SITE else requests.get(url, headers=CABECALHOS, timeout=60).text)
               for url in paginas_para_varrer(html, URL_BASE_SITE)}
    return novas_atas([ata for url, conteudo in paginas.items() for ata in atas_da_pagina(conteudo, url)], index)


def novas_atas(atas: list[AtaNoSite], index: dict) -> list[tuple[AtaNoSite, str]]:
    """Filtra as que já estão no índice e dá nome às novas em ordem cronológica."""
    existentes, vistas, novas, nomes = chaves_existentes(index), set(), [], []
    for ata in sorted(atas, key=lambda a: a.data[6:] + a.data[3:5] + a.data[:2]):
        chave = ('ordin', ata.numero) if ata.tipo == 'ordin' else (ata.tipo, ata.data)
        if chave in existentes or chave in vistas:
            continue
        vistas.add(chave)
        nome = nome_arquivo(ata, index, nomes)
        nomes.append(nome)
        novas.append((ata, nome))
    return novas


def baixar(novas, index: dict) -> list[str]:
    import requests
    from core import config_ambiente

    baixadas = []
    for ata, nome in novas:
        resposta = requests.get(ata.url, headers=CABECALHOS, timeout=120)
        resposta.raise_for_status()
        if not resposta.content.startswith(b'%PDF'):
            print(f'⚠️ Ignorado (não é PDF): {ata.url}')
            continue
        destino = os.path.join(config_ambiente.CAMINHO_PDFS_PADRAO, nome)
        with open(destino, 'wb') as f:
            f.write(resposta.content)
        index[nome] = {'titulo_reuniao': ata.titulo, 'data_correta': ata.data, 'local': ata.local,
                       'caminho_absoluto': f'dados/base_dados/pdf_atas_pleno/{nome}', 'url_origem': ata.url}
        baixadas.append(nome)
        print(f'✅ Baixada: {nome}')
    return baixadas


def main():
    from core import config_ambiente

    with open(config_ambiente.CAMINHO_INDEX_JSON, encoding='utf-8') as f:
        index = json.load(f)
    novas = detectar(index)

    linhas = [f'| `{nome}` | {ata.titulo} | {ata.data} | {ata.local} | [PDF]({ata.url}) |' for ata, nome in novas]
    resumo = (f'### {len(novas)} ata(s) nova(s) do Conselho Pleno\n\n'
              + ('| Arquivo | Reunião | Data | Local | Origem |\n|---|---|---|---|---|\n' + '\n'.join(linhas)
                 if novas else 'Nenhuma ata nova encontrada no site da Prefeitura.'))
    print(resumo)

    if '--baixar' in sys.argv and novas:
        baixadas = baixar(novas, index)
        with open(config_ambiente.CAMINHO_INDEX_JSON, 'w', encoding='utf-8') as f:
            json.dump(index, f, indent=4, ensure_ascii=False)
        from construtores.construtor_cache import construir_cache_novo
        construir_cache_novo(forcar_completo=False)
        print(f'📦 {len(baixadas)} ata(s) incluída(s) no índice e no cache.')

    # Saídas para o GitHub Actions
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
            f.write(f'novas={len(novas)}\n')
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(resumo + '\n')
    if os.getenv('RESUMO_ARQUIVO'):  # usado como descrição do Pull Request
        with open(os.environ['RESUMO_ARQUIVO'], 'w', encoding='utf-8') as f:
            f.write(resumo + '\n')


if __name__ == '__main__':
    main()
