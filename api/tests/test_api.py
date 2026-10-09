"""Testes dos endpoints usando um repositório falso (não precisa de banco)."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_repo


class RepoFalso:
    def __init__(self):
        self.feedbacks = []
        self.ultima_busca = None

    def ping(self):
        return True

    def anos(self):
        return [2025, 2024]

    def listar_reunioes(self, ano, tipo):
        dados = [
            {"id": 1, "arquivo": "01_2013_Pleno_ordin_ata.pdf", "titulo": "1ª Reunião Ordinária",
             "tipo": "Ordinária", "data": date(2013, 8, 2), "ano": 2013, "local": "Biblioteca",
             "total_linhas": 85, "tema_principal": "Transporte Público Coletivo"},
            {"id": 2, "arquivo": "extra_01_2016_Pleno_ata.pdf", "titulo": "Reunião Extraordinária",
             "tipo": "Extraordinária", "data": date(2016, 11, 23), "ano": 2016, "local": None,
             "total_linhas": 40, "tema_principal": None},
        ]
        return [d for d in dados if (ano is None or d["ano"] == ano) and (tipo is None or d["tipo"] == tipo)]

    def obter_reuniao(self, reuniao_id):
        if reuniao_id != 1:
            return None
        return {"id": 1, "arquivo": "01_2013_Pleno_ordin_ata.pdf", "titulo": "1ª Reunião Ordinária",
                "tipo": "Ordinária", "data": date(2013, 8, 2), "ano": 2013, "local": "Biblioteca",
                "mandato": "2013ago 2014mai", "temas": [], "linhas": ["linha 1", "linha 2"]}

    def consulta_valida(self, consulta):
        return consulta not in ("de", "o que")  # simula consulta só com palavras muito comuns

    def radicais(self, palavras):
        return [p[:6] for p in palavras.split()]

    def buscar(self, **kwargs):
        self.ultima_busca = kwargs
        return {"total": 1, "por_ano": [{"ano": 2013, "ocorrencias": 1}],
                "resultados": [{"reuniao_id": 1, "arquivo": "01_2013_Pleno_ordin_ata.pdf",
                                "titulo": "1ª Reunião Ordinária", "data": date(2013, 8, 2),
                                "ano": 2013, "ordem": 10, "texto": "Discussão sobre a ciclovia"}]}

    def listar_mandatos(self):
        return [{"id": 1, "codigo": "2024mar 2026jan", "inicio": date(2024, 3, 1),
                 "fim": date(2026, 1, 31), "cadeiras": 67, "conselheiros": 120, "reunioes": 12}]

    def obter_mandato(self, mandato_id):
        return None

    def buscar_conselheiros(self, padrao):
        return []

    def estatisticas(self):
        return {"totais": {"reunioes": 91}, "reunioes_por_ano": [], "temas": [],
                "temas_por_ano": [], "genero_por_mandato": [], "segmentos_mandato_atual": []}

    def salvar_feedback(self, nome, mensagem, avaliacao):
        self.feedbacks.append((nome, mensagem, avaliacao))
        return len(self.feedbacks)


@pytest.fixture
def repo():
    falso = RepoFalso()
    app.dependency_overrides[get_repo] = lambda: falso
    yield falso
    app.dependency_overrides.clear()


@pytest.fixture
def cliente(repo):
    return TestClient(app)


def test_saude_sem_banco():
    resp = TestClient(app).get("/api/saude")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_sem_banco_configurado_retorna_503():
    resp = TestClient(app).get("/api/anos")
    assert resp.status_code == 503


def test_anos(cliente):
    assert cliente.get("/api/anos").json() == [2025, 2024]


def test_listar_reunioes_inclui_link_do_pdf(cliente):
    dados = cliente.get("/api/reunioes").json()
    assert len(dados) == 2
    assert dados[0]["url_pdf"].endswith("/dados/base_dados/pdf_atas_pleno/01_2013_Pleno_ordin_ata.pdf")
    assert dados[0]["url_pdf"].startswith("https://raw.githubusercontent.com/")


def test_listar_reunioes_filtra_por_tipo(cliente):
    dados = cliente.get("/api/reunioes", params={"tipo": "Extraordinária"}).json()
    assert [d["id"] for d in dados] == [2]


def test_listar_reunioes_tipo_invalido(cliente):
    assert cliente.get("/api/reunioes", params={"tipo": "Qualquer"}).status_code == 422


def test_obter_reuniao(cliente):
    dados = cliente.get("/api/reunioes/1").json()
    assert dados["linhas"] == ["linha 1", "linha 2"]
    assert dados["data"] == "2013-08-02"


def test_obter_reuniao_inexistente(cliente):
    assert cliente.get("/api/reunioes/999").status_code == 404


def test_busca_padrao_e_inteligente_por_relevancia(cliente, repo):
    resp = cliente.get("/api/busca", params={"q": "Ciclovias Paulista", "ano": 2013, "pagina": 3, "por_pagina": 20})
    assert resp.status_code == 200
    assert repo.ultima_busca == {"modo": "inteligente", "consulta": "ciclovias paulista",
                                 "padrao": "%ciclovias%paulista%", "ordem": "relevancia",
                                 "ano": 2013, "limite": 20, "deslocamento": 40}
    corpo = resp.json()
    assert corpo["modo"] == "inteligente"
    assert corpo["radicais"] == ["ciclov", "paulis"]
    assert corpo["total"] == 1
    assert corpo["resultados"][0]["url_pdf"].endswith("01_2013_Pleno_ordin_ata.pdf")


def test_busca_exata_por_data_nao_calcula_radicais(cliente, repo):
    corpo = cliente.get("/api/busca", params={"q": "faixa", "modo": "exato", "ordem": "data"}).json()
    assert repo.ultima_busca["modo"] == "exato"
    assert repo.ultima_busca["ordem"] == "data"
    assert corpo["radicais"] == []


def test_busca_so_com_palavras_comuns_cai_para_modo_exato(cliente, repo):
    corpo = cliente.get("/api/busca", params={"q": "De"}).json()
    assert corpo["modo"] == "exato"
    assert repo.ultima_busca["modo"] == "exato"


def test_busca_destaque_ignora_exclusoes(cliente):
    corpo = cliente.get("/api/busca", params={"q": 'onibus -paulista OR "faixa exclusiva"'}).json()
    assert corpo["radicais"] == ["onibus", "faixa", "exclus"]


@pytest.mark.parametrize("params", [{"modo": "fuzzy"}, {"ordem": "alfabetica"}])
def test_busca_rejeita_modo_ou_ordem_invalidos(cliente, params):
    assert cliente.get("/api/busca", params={"q": "ônibus", **params}).status_code == 422


@pytest.mark.parametrize("q", ["a", "x" * 201])
def test_busca_valida_tamanho_do_termo(cliente, q):
    assert cliente.get("/api/busca", params={"q": q}).status_code == 422


def test_busca_termo_so_com_aspas(cliente):
    assert cliente.get("/api/busca", params={"q": '"a"'}).status_code == 422


def test_mandato_inexistente(cliente):
    assert cliente.get("/api/mandatos/42").status_code == 404


def test_estatisticas(cliente):
    assert cliente.get("/api/estatisticas").json()["totais"]["reunioes"] == 91


def test_feedback_valido(cliente, repo):
    resp = cliente.post("/api/feedback", json={"nome": "  Ana ", "mensagem": " Muito útil! ", "avaliacao": 5})
    assert resp.status_code == 201
    assert repo.feedbacks == [("Ana", "Muito útil!", 5)]


def test_feedback_nome_vazio_vira_nulo(cliente, repo):
    cliente.post("/api/feedback", json={"nome": "   ", "mensagem": "Teste ok"})
    assert repo.feedbacks == [(None, "Teste ok", None)]


@pytest.mark.parametrize("corpo", [
    {"mensagem": "oi"},
    {"mensagem": "Mensagem válida", "avaliacao": 6},
    {"nome": "Ana"},
])
def test_feedback_invalido(cliente, corpo):
    assert cliente.post("/api/feedback", json=corpo).status_code == 422
