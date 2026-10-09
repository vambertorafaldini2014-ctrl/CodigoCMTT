"""Testes do detector de atas novas (coletores/detector_atas_novas.py) com HTML de exemplo."""
import os
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, RAIZ)

from coletores.detector_atas_novas import (AtaNoSite, atas_da_pagina, chaves_existentes, ler_bloco,  # noqa: E402
                                           nome_arquivo, novas_atas, paginas_para_varrer)

PAGINA = """
<p>86ª Reunião Ordinária do Conselho Municipal de Trânsito e Transporte - CMTT
   Data : 28/08/2026 Horário : 09h30 às 12h30 Link: <a href="https://teams.microsoft.com/x">Link para reunião - Clique Aqui</a>
   Ata: <a href="/documents/d/mobilidade/86_reuniao_ordinaria_cmtt-pdf">Clique Aqui</a></p>
<p>84ª Reunião Ordinária do Conselho Municipal de Trânsito e Transporte - CMTT Data : 23/04/2026
   Local: Online – Plataforma Microsoft Teams Link: <a href="https://teams.microsoft.com/y">Clique Aqui</a>
   Ata: <a href="/documents/d/mobilidade/84-reuniao-pdf">Clique Aqui</a>
   Apresentação: <a href="/documents/d/mobilidade/cmtt-pdm-smt-pdf">Apresentação SMT</a></p>
<p>Reunião Extraordinária do Conselho Municipal de Trânsito e Transporte - CMTT Data : 07/04/26
   Local: Online Ata: <a href="/documents/d/mobilidade/extra-07-04-26-pdf">Clique Aqui</a></p>
<p>79ª Reunião Ordinária do CMTT Data: 01/08/2025 Ata: <a href="/documents/d/mobilidade/apresentacao-gob-pdf">Clique Aqui</a></p>
<p>3ª Reunião da Câmara Temática de Bicicleta - CMTT Data: 10/03/2026 Ata: <a href="/ct-bike-pdf">Clique Aqui</a></p>
<p>Regimento Interno do CMTT <a href="/regimento-pdf">Regimento Interno</a></p>
"""


def test_le_bloco_de_reuniao_ordinaria():
    dados = ler_bloco("85ª Reunião Ordinária do Conselho Municipal de Trânsito e Transporte - CMTT "
                      "Data : 26/06/2026 Horário : 09h30 Local: Online – Teams Link: Clique Aqui Ata: Clique Aqui")
    assert dados == {"tipo": "ordin", "numero": 85, "data": "26/06/2026", "titulo": "85ª Reunião Ordinária",
                     "local": "Online – Teams"}


def test_le_bloco_extraordinaria_com_ano_de_dois_digitos():
    dados = ler_bloco("Reunião Extraordinária do CMTT Data: 7/4/26 Ata: Clique Aqui")
    assert (dados["tipo"], dados["numero"], dados["data"], dados["local"]) == ("extra", None, "07/04/2026", "Não informado")


def test_ignora_camara_tematica_e_blocos_sem_data():
    assert ler_bloco("1ª Reunião da Câmara Temática de Táxi - CMTT Data: 01/02/2026") is None
    assert ler_bloco("12ª Reunião Ordinária do CMTT, em breve") is None


def test_extrai_so_links_de_ata_do_pleno():
    atas = atas_da_pagina(PAGINA, "https://prefeitura.sp.gov.br/web/mobilidade/cmtt")
    assert [(a.tipo, a.numero, a.data) for a in atas] == [
        ("ordin", 86, "28/08/2026"), ("ordin", 84, "23/04/2026"), ("extra", None, "07/04/2026")]
    assert atas[0].url == "https://prefeitura.sp.gov.br/documents/d/mobilidade/86_reuniao_ordinaria_cmtt-pdf"
    assert atas[1].local == "Online – Plataforma Microsoft Teams"


def test_ignora_apresentacao_colocada_no_lugar_da_ata():
    atas = atas_da_pagina(PAGINA, "https://exemplo")
    assert all("apresentacao" not in a.url for a in atas)


INDEX = {
    "82_2025_Pleno_ordin_ata.pdf": {"data_correta": "19/12/2025"},
    "84_2026_Pleno_ordin_ata.pdf": {"data_correta": "23/04/2026"},
    "extra_10_2026_Pleno_ata.pdf": {"data_correta": "02/01/2026"},
    "tecni_01_2019_Pleno_ata.pdf": {"data_correta": "23/05/2019"},
}


def ata(tipo, numero, data):
    titulo = f"{numero}ª Reunião Ordinária" if numero else "Reunião Extraordinária"
    return AtaNoSite(tipo=tipo, numero=numero, data=data, titulo=titulo, local="Online", url=f"https://x/{data}")


def test_chaves_existentes():
    assert chaves_existentes(INDEX) == {("ordin", 82), ("ordin", 84), ("extra", "02/01/2026"), ("tecni", "23/05/2019")}


def test_novas_atas_ignora_existentes_e_numera_extraordinarias_por_data():
    no_site = [ata("extra", None, "07/04/2026"), ata("ordin", 84, "23/04/2026"), ata("ordin", 85, "26/06/2026"),
               ata("extra", None, "06/03/2026"), ata("extra", None, "02/01/2026"), ata("ordin", 85, "26/06/2026")]
    assert [nome for _, nome in novas_atas(no_site, INDEX)] == [
        "extra_11_2026_Pleno_ata.pdf", "extra_12_2026_Pleno_ata.pdf", "85_2026_Pleno_ordin_ata.pdf"]


def test_nome_de_reuniao_tecnica():
    assert nome_arquivo(ata("tecni", None, "10/10/2026"), INDEX, []) == "tecni_02_2026_Pleno_ata.pdf"


def test_paginas_para_varrer_usa_os_anos_mais_recentes():
    html = '<a href="/2023">2023</a><a href="/2025">2025</a><a href="https://outro/2024">2024</a><a href="/x">Atas</a>'
    assert paginas_para_varrer(html, "https://site/cmtt") == ["https://site/cmtt", "https://site/2025", "https://outro/2024"]
