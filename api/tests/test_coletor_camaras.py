"""Testes do coletor das Câmaras Temáticas (coletores/coletor_camaras.py) com HTML de exemplo."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from coletores.coletor_camaras import (AtaCamara, atas_da_pagina, data_no_texto, identificar_camara,  # noqa: E402
                                       paginas_das_camaras, subpaginas_de_anos)

ORGAO, APELIDO = "Câmara Temática de Táxi", "Taxi"

PAGINA = """
<p>1 - <a href="/regimento-taxi.pdf">Regimento Interno</a></p>
<p>- Reunião da Câmara Temática de Táxi - Fevereiro/2025 Data: 25/02/2025 Horário: 10h às 12h
   Local: Online – Plataforma Microsoft Teams Ata: <a href="/d/ata-taxi-25-02-2025-pdf">Clique Aqui</a>
   <a href="/d/apresentacao-taxi-pdf">Apresentação</a></p>
<p>- Reunião Extraordinária da Câmara Temática de Táxi Data: 27/03/25 Ata: <a href="/d/extra-taxi-pdf">Clique Aqui</a></p>
<p>- <a href="/upload/ata_taxi_12122023.pdf">Reunião da Câmara Temática do Serviço de Táxi - 12/12/2023</a>
   <a href="/upload/taxi_luxo.pdf">Táxi Luxo aeroporto de Congonhas</a></p>
<p>- <a href="/upload/relatorio_ct_taxi_1576.pdf">Reunião da Câmara Temática de Táxi - DEZEMBRO/2019</a></p>
<p><a href="https://teams.microsoft.com/l/x">Reunião - Link Teams</a></p>
"""


def test_le_os_tres_formatos_e_ignora_apresentacoes():
    atas = atas_da_pagina(PAGINA, "https://prefeitura.sp.gov.br/taxi", ORGAO, APELIDO)
    assert [(a.data, a.data_aproximada, a.url.rsplit("/", 1)[-1]) for a in atas] == [
        ("25/02/2025", False, "ata-taxi-25-02-2025-pdf"),
        ("27/03/2025", False, "extra-taxi-pdf"),
        ("12/12/2023", False, "ata_taxi_12122023.pdf"),
        ("01/12/2019", True, "relatorio_ct_taxi_1576.pdf"),
    ]
    assert atas[0].local == "Online – Plataforma Microsoft Teams"
    assert atas[1].titulo == "Reunião Extraordinária — Câmara Temática de Táxi"
    assert atas[2].titulo == "Reunião Ordinária — Câmara Temática de Táxi"


def test_chave_usa_camara_e_data():
    ata = AtaCamara(ORGAO, APELIDO, "09/09/2026", "t", "l", "u")
    assert ata.chave == "CT_Taxi_2026-09-09_ata"


def test_data_no_texto_em_numeros_ou_por_extenso():
    assert data_no_texto(["ATA DA REUNIÃO", "Data: 10/12/2019 às 10h"], 12, "2019") == "10/12/2019"
    assert data_no_texto(["Aos 3 de dezembro de 2019, reuniu-se..."], 12, "2019") == "03/12/2019"
    assert data_no_texto(["Publicado em 05/01/2020"], 12, "2019") is None


def test_identificar_camara():
    assert identificar_camara("Da Câmara Temática Mobilidade A Pé - 2026")[1] == "MobilidadeAPe"
    assert identificar_camara("Câmara Temática de usuários do Transporte Coletivo")[1] == "TransportePublico"
    assert identificar_camara("Câmara Temática do Serviço de Táxi")[0] == ORGAO
    assert identificar_camara("Conselho Pleno") is None


def test_paginas_das_camaras_e_subpaginas_de_anos():
    principal = """
      <a href="/ct/bike">Clique Aqui e acesse Informações Sobre As Reuniões Da Câmara Temática De Bicicleta - 2026</a>
      <a href="/ct/taxi">Clique Aqui e acesse Informações Sobre As Reuniões Da Câmara Temática De Táxi - 2026</a>
      <a href="/ct/bike-de-novo">Câmara Temática de Bicicleta</a>
      <a href="/regimento.pdf">Regimento da Câmara Temática</a>"""
    assert paginas_das_camaras(principal, "https://site/cmtt") == [
        ("Câmara Temática de Bicicleta", "Bicicleta", "https://site/ct/bike"),
        ("Câmara Temática de Táxi", "Taxi", "https://site/ct/taxi")]
    anos = '<a href="/a2025">Atas 2025</a><a href="/a2020">Atas 2020 e anos anteriores</a><a href="/x">Atas</a>'
    assert subpaginas_de_anos(anos, "https://site/ct/bike") == ["https://site/a2025", "https://site/a2020"]


def test_ler_documento_aceita_word_docx():
    import io
    import zipfile

    from coletores.coletor_camaras import ler_documento
    xml = ('<w:document><w:body><w:p><w:r><w:t>ATA DA REUNIÃO</w:t></w:r></w:p>'
           '<w:p><w:r><w:t xml:space="preserve">Data: </w:t></w:r><w:r><w:t>05/12/2024 &amp; pauta</w:t></w:r></w:p>'
           '<w:p><w:r><w:t>ok</w:t></w:r></w:p></w:body></w:document>')
    arquivo = io.BytesIO()
    with zipfile.ZipFile(arquivo, 'w') as z:
        z.writestr('word/document.xml', xml)
    assert ler_documento(arquivo.getvalue()) == ['ATA DA REUNIÃO', 'Data: 05/12/2024 & pauta']


def test_ler_documento_recusa_formato_desconhecido():
    import pytest

    from coletores.coletor_camaras import ler_documento
    with pytest.raises(ValueError):
        ler_documento(b'<html>pagina de erro</html>')
