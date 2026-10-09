"""
Testes de qualidade dos dados de mandatos (dados/configs/AAAAmmm AAAAmmm.json),
gerados por construtores/construtor_conselheiros.py a partir de base_mandatosCMTT.xlsx.
Rodam no CI e avisam se uma nova versão da planilha trouxer problemas.
"""
import glob
import json
import os

import pytest

from app.texto import pessoas_da_cadeira, periodo_mandato

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARQUIVOS = sorted(glob.glob(os.path.join(RAIZ, "dados", "configs", "[0-9][0-9][0-9][0-9]* *.json")))

# Pessoas conhecidas sem gênero preenchido na planilha (ver issue #2).
# Ao corrigir a planilha, remova o nome daqui; nomes novos sem gênero fazem o teste falhar.
SEM_GENERO_CONHECIDOS = {"Audrey Gabriel", "Giovanni Romano", "Amanda Roberta da Silveira"}


def carregar(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def pessoas(mandato):
    for cadeira in mandato["cadeiras"]:
        for pessoa, funcao in pessoas_da_cadeira(cadeira):
            if pessoa["nome"] != "VAGO":
                yield pessoa, funcao, cadeira


def test_existem_arquivos_de_mandato():
    assert len(ARQUIVOS) >= 6


@pytest.mark.parametrize("caminho", ARQUIVOS, ids=os.path.basename)
def test_codigo_do_mandato_e_valido(caminho):
    inicio, fim = periodo_mandato(os.path.splitext(os.path.basename(caminho))[0])
    assert inicio < fim


def test_mandatos_nao_se_sobrepoem():
    periodos = sorted(periodo_mandato(os.path.splitext(os.path.basename(c))[0]) for c in ARQUIVOS)
    for (_, fim_anterior), (inicio, _) in zip(periodos, periodos[1:]):
        assert fim_anterior < inicio


@pytest.mark.parametrize("caminho", ARQUIVOS, ids=os.path.basename)
def test_genero_valido(caminho):
    invalidos = [(p["nome"], p.get("genero")) for p, _, _ in pessoas(carregar(caminho))
                 if p.get("genero") not in ("F", "M", None)]
    assert invalidos == []


@pytest.mark.parametrize("caminho", ARQUIVOS, ids=os.path.basename)
def test_genero_preenchido(caminho):
    sem_genero = {p["nome"] for p, _, _ in pessoas(carregar(caminho)) if not p.get("genero")}
    assert sem_genero <= SEM_GENERO_CONHECIDOS, f"Conselheiros sem gênero na planilha: {sem_genero - SEM_GENERO_CONHECIDOS}"


@pytest.mark.parametrize("caminho", ARQUIVOS, ids=os.path.basename)
def test_toda_cadeira_tem_segmento_e_orgao(caminho):
    for cadeira in carregar(caminho)["cadeiras"]:
        assert cadeira.get("segmento") and cadeira.get("nome_orgao_exibicao")
