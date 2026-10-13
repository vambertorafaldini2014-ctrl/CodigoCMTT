"""
Coletor das atas das Câmaras Temáticas do CMTT.

Diferente das atas do Conselho Pleno, os PDFs das Câmaras NÃO são guardados no repositório
(seriam centenas de arquivos): guardamos só o texto extraído e o link oficial do PDF no site
da Prefeitura. Saídas:
  - dados/configs/index_atas_camaras.json   -> metadados (câmara, data, título, local, link)
  - dados/configs/.cache_corpus_camaras.json -> texto das atas, linha a linha

O site tem dois formatos:
  - 2024 em diante: bloco com "Data: dd/mm/aaaa ... Ata: <link>" (mesmo formato do Pleno)
  - até 2023: o próprio link se chama "Reunião da Câmara Temática de X - MÊS/AAAA" (sem o dia);
    nesse caso a data é procurada dentro do PDF e, se não for encontrada, fica o dia 1º do mês
    com "data_aproximada": true.

Uso:
    python coletores/coletor_camaras.py            # só lista o que é novo
    python coletores/coletor_camaras.py --baixar   # baixa, extrai o texto e atualiza índice e cache
"""
import io
import json
import os
import re
import sys
from dataclasses import dataclass, field
from urllib.parse import urljoin

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, RAIZ)

from coletores.detector_atas_novas import CABECALHOS, sem_acento  # noqa: E402

CAMINHO_INDEX = os.path.join(RAIZ, 'dados', 'configs', 'index_atas_camaras.json')
CAMINHO_CACHE = os.path.join(RAIZ, 'dados', 'configs', '.cache_corpus_camaras.json')

# Nome oficial de cada câmara e um "apelido" curto usado no identificador do arquivo
CAMARAS = [
    (r'bicicleta', 'Câmara Temática de Bicicleta', 'Bicicleta'),
    (r'mobilidade\s*a\s*pe', 'Câmara Temática de Mobilidade a Pé', 'MobilidadeAPe'),
    (r'motocicleta', 'Câmara Temática de Motocicleta', 'Motocicleta'),
    (r'transporte\s*escolar', 'Câmara Temática de Transporte Escolar', 'TransporteEscolar'),
    (r'taxi', 'Câmara Temática de Táxi', 'Taxi'),
    (r'transporte\s*(publico|coletivo)', 'Câmara Temática do Transporte Público', 'TransportePublico'),
]

MESES = {'janeiro': 1, 'fevereiro': 2, 'marco': 3, 'abril': 4, 'maio': 5, 'junho': 6, 'julho': 7,
         'agosto': 8, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12}


@dataclass
class AtaCamara:
    orgao: str
    apelido: str
    data: str                 # dd/mm/aaaa
    titulo: str
    local: str
    url: str
    data_aproximada: bool = False
    linhas: list = field(default_factory=list, repr=False)

    @property
    def chave(self) -> str:
        d, m, a = self.data.split('/')
        return f'CT_{self.apelido}_{a}-{m}-{d}_ata'


def identificar_camara(texto: str) -> tuple[str, str] | None:
    norm = sem_acento(texto)
    for padrao, nome, apelido in CAMARAS:
        if re.search(padrao, norm):
            return nome, apelido
    return None


def eh_apresentacao(link) -> bool:
    texto = sem_acento(link['href'] + ' ' + link.get_text(' ', strip=True))
    return bool(re.search(r'apresenta|grava|regimento|composic|pauta|lista de presenca', texto))


def atas_da_pagina(html: str, url_pagina: str, orgao: str, apelido: str) -> list[AtaCamara]:
    """Atas de uma página de câmara, nos dois formatos do site."""
    from bs4 import BeautifulSoup

    sopa = BeautifulSoup(html, 'html.parser')
    atas = []
    for link in sopa.find_all('a', href=True):
        if eh_apresentacao(link) or re.search(r'teams\.microsoft|youtube|zoom', link['href']):
            continue
        bloco = link.find_parent(['p', 'li', 'td', 'div'])
        texto_bloco = re.sub(r'\s+', ' ', (bloco.get_text(' ', strip=True) if bloco else '').replace('\xa0', ' '))
        norm = sem_acento(texto_bloco)
        anteriores = [s.strip() for s in link.find_all_previous(string=True, limit=3) if s.strip()]
        extra = 'extraordinaria' in norm
        titulo = f'Reunião {"Extraordinária" if extra else "Ordinária"} — {orgao}'

        # Formato novo: "Data: dd/mm/aaaa ... Ata: <link>"
        if anteriores and re.search(r'(^|\s)ata\s*:?$', sem_acento(anteriores[0])):
            data = re.search(r'data\s*:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})', norm)
            if not data:
                continue
            dia, mes, ano = data.groups()
            local = re.search(r'Local\s*:\s*(.+?)(?:\s+Link\s*:|\s+Ata\s*:|\s+Hor[aá]rio|$)', texto_bloco)
            atas.append(AtaCamara(orgao, apelido, f'{int(dia):02d}/{int(mes):02d}/{ano if len(ano) == 4 else "20" + ano}',
                                  titulo, local.group(1).strip() if local else 'Não informado', urljoin(url_pagina, link['href'])))
            continue

        # Formatos antigos: o próprio link é "Reunião da Câmara Temática de X - dd/mm/aa(aa)"
        # ou "Reunião da Câmara Temática de X - MÊS/AAAA"
        texto_link = sem_acento(link.get_text(' ', strip=True))
        if 'reuniao' not in texto_link:
            continue
        data_link = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b', texto_link)
        if data_link:
            dia, mes, ano = data_link.groups()
            atas.append(AtaCamara(orgao, apelido, f'{int(dia):02d}/{int(mes):02d}/{ano if len(ano) == 4 else "20" + ano}',
                                  titulo, 'Não informado', urljoin(url_pagina, link['href'])))
            continue
        mes_ano = re.search(r'(' + '|'.join(MESES) + r')\s*/\s*(\d{4})', sem_acento(link.get_text(' ', strip=True) + ' ' + texto_bloco))
        if mes_ano:
            mes, ano = MESES[mes_ano.group(1)], mes_ano.group(2)
            atas.append(AtaCamara(orgao, apelido, f'01/{mes:02d}/{ano}', titulo, 'Não informado',
                                  urljoin(url_pagina, link['href']), data_aproximada=True))
    return atas


def data_no_texto(linhas: list[str], mes: int, ano: str) -> str | None:
    """Procura no início da ata uma data do mesmo mês/ano (ex.: "10/09/2024" ou "10 de setembro de 2024")."""
    inicio = sem_acento(' '.join(linhas[:40]))
    for d, m, a in re.findall(r'(\d{1,2})/(\d{1,2})/(\d{4})', inicio):
        if int(m) == mes and a == ano:
            return f'{int(d):02d}/{mes:02d}/{ano}'
    for d, nome_mes, a in re.findall(r'(\d{1,2})[º°o]?\s+de\s+(' + '|'.join(MESES) + r')\s+de\s+(\d{4})', inicio):
        if MESES[nome_mes] == mes and a == ano:
            return f'{int(d):02d}/{mes:02d}/{ano}'
    return None


def paginas_das_camaras(html_principal: str, url_principal: str) -> list[tuple[str, str, str]]:
    """(órgão, apelido, url) da página de cada câmara, a partir da página principal do CMTT."""
    from bs4 import BeautifulSoup

    sopa = BeautifulSoup(html_principal, 'html.parser')
    paginas = []
    for link in sopa.find_all('a', href=True):
        texto = link.get_text(' ', strip=True)
        if 'camara tematica' in sem_acento(texto) and not re.search(r'pdf$', link['href'], re.I):
            camara = identificar_camara(texto.split('Temática', 1)[-1] if 'Temática' in texto else texto)
            if camara and camara[0] not in [p[0] for p in paginas]:
                paginas.append((*camara, urljoin(url_principal, link['href'])))
    return paginas


def subpaginas_de_anos(html: str, url: str) -> list[str]:
    """Links "Atas 2025", "Atas 2020 e anos anteriores" etc. dentro da página da câmara."""
    from bs4 import BeautifulSoup

    sopa = BeautifulSoup(html, 'html.parser')
    return list(dict.fromkeys(urljoin(url, a['href']) for a in sopa.find_all('a', href=True)
                              if re.match(r'atas\s+20\d\d', sem_acento(a.get_text(' ', strip=True)))))


def coletar(index: dict) -> list[AtaCamara]:
    """Atas das câmaras ainda não presentes no índice (sem baixar os PDFs)."""
    import requests
    from core.config_ambiente import URL_BASE_SITE

    obter = lambda u: requests.get(u, headers=CABECALHOS, timeout=60).text  # noqa: E731
    novas, vistas = [], set(index)
    for orgao, apelido, url in paginas_das_camaras(obter(URL_BASE_SITE), URL_BASE_SITE):
        html = obter(url)
        for pagina_url, pagina_html in [(url, html)] + [(u, obter(u)) for u in subpaginas_de_anos(html, url)]:
            for ata in atas_da_pagina(pagina_html, pagina_url, orgao, apelido):
                if ata.url in {v.get('url_origem') for v in index.values()} or ata.url in {n.url for n in novas}:
                    continue
                novas.append(ata)
    return novas


def ler_docx(conteudo: bytes) -> list[str]:
    """Texto de um arquivo Word (.docx) sem bibliotecas extras: lê os parágrafos do XML interno."""
    import html
    import zipfile

    with zipfile.ZipFile(io.BytesIO(conteudo)) as docx:
        xml = docx.read('word/document.xml').decode('utf-8')
    linhas = []
    for paragrafo in re.findall(r'<w:p[ >].*?</w:p>', xml, flags=re.S):
        texto = html.unescape(''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', paragrafo, flags=re.S)))
        texto = re.sub(r'\s+', ' ', texto).strip()
        if len(texto) > 3:
            linhas.append(texto)
    return linhas


def ler_documento(conteudo: bytes) -> list[str]:
    """Atas publicadas em PDF ou, às vezes, em Word (.docx)."""
    if conteudo.startswith(b'%PDF'):
        return ler_pdf(conteudo)
    if conteudo.startswith(b'PK'):  # .docx é um arquivo zip
        return ler_docx(conteudo)
    raise ValueError('formato não suportado (nem PDF nem Word)')


def ler_pdf(conteudo: bytes) -> list[str]:
    import pdfplumber

    linhas = []
    with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
        for pagina in pdf.pages:
            for linha in (pagina.extract_text() or '').replace('\r', '').split('\n'):
                linha = re.sub(r'\s+', ' ', linha.strip())
                if len(linha) > 3:
                    linhas.append(linha)
    return linhas


def baixar_e_extrair(novas: list[AtaCamara], index: dict, cache: list) -> int:
    import requests

    incluidas = 0
    for i, ata in enumerate(novas, 1):
        try:
            resposta = requests.get(ata.url, headers=CABECALHOS, timeout=120)
            resposta.raise_for_status()
            ata.linhas = ler_documento(resposta.content)
        except Exception as erro:  # um PDF com problema não interrompe a coleta
            print(f'⚠️ [{i}/{len(novas)}] falhou ({erro}): {ata.url}')
            continue
        if not ata.linhas:
            print(f'⚠️ [{i}/{len(novas)}] PDF sem texto (provavelmente digitalizado): {ata.url}')
            continue
        if ata.data_aproximada:
            _, mes, ano = ata.data.split('/')
            exata = data_no_texto(ata.linhas, int(mes), ano)
            if exata:
                ata.data, ata.data_aproximada = exata, False
        chave = ata.chave
        sufixo = 2
        while chave in index:  # duas reuniões da mesma câmara no mesmo dia
            chave, sufixo = f'{ata.chave}_{sufixo}', sufixo + 1
        index[chave] = {'orgao': ata.orgao, 'titulo_reuniao': ata.titulo, 'data_correta': ata.data,
                        'data_aproximada': ata.data_aproximada, 'local': ata.local, 'url_origem': ata.url}
        cache.append({'Fonte': chave, 'Data': ata.data[-4:], 'Reunião': ata.titulo, 'Linhas': ata.linhas})
        incluidas += 1
        print(f'✅ [{i}/{len(novas)}] {chave} ({len(ata.linhas)} linhas)')
    return incluidas


def ler_json(caminho, padrao):
    if not os.path.exists(caminho):
        return padrao
    with open(caminho, encoding='utf-8') as f:
        return json.load(f)


def main():
    index = ler_json(CAMINHO_INDEX, {})
    cache = ler_json(CAMINHO_CACHE, [])
    novas = coletar(index)

    por_camara = {}
    for ata in novas:
        por_camara[ata.orgao] = por_camara.get(ata.orgao, 0) + 1
    resumo = f'### {len(novas)} ata(s) nova(s) das Câmaras Temáticas\n\n' + (
        '| Câmara | Atas |\n|---|---|\n' + '\n'.join(f'| {o} | {n} |' for o, n in sorted(por_camara.items()))
        if novas else 'Nenhuma ata nova das Câmaras Temáticas.')
    print(resumo)

    incluidas = 0
    if '--baixar' in sys.argv and novas:
        incluidas = baixar_e_extrair(novas, index, cache)
        with open(CAMINHO_INDEX, 'w', encoding='utf-8') as f:
            json.dump(dict(sorted(index.items())), f, indent=2, ensure_ascii=False)
        with open(CAMINHO_CACHE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False)
        print(f'📦 {incluidas} ata(s) das Câmaras incluída(s) no índice e no cache.')

    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
            f.write(f'novas_camaras={incluidas if "--baixar" in sys.argv else len(novas)}\n')
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(resumo + '\n')
    if os.getenv('RESUMO_ARQUIVO'):
        with open(os.environ['RESUMO_ARQUIVO'], 'a', encoding='utf-8') as f:
            f.write('\n' + resumo + '\n')


if __name__ == '__main__':
    main()
