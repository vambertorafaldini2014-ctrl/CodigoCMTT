"""Área administrativa: login validado no Supabase (simulado), permissões e limite de envios."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app import autenticacao
from app.limite import LimiteDeEnvios
from app.main import app, get_repo
from test_api import RepoFalso


class RespostaFalsa:
    def __init__(self, status, corpo=None):
        self.status_code = status
        self._corpo = corpo or {}

    def json(self):
        return self._corpo


@pytest.fixture
def supabase(monkeypatch):
    """Simula o GET /auth/v1/user do Supabase: tokens conhecidos -> e-mail; resto -> 401."""
    usuarios = {"token-admin": "Admin@Exemplo.com", "token-comum": "visitante@exemplo.com"}
    chamadas = []

    def get_falso(url, headers, timeout):
        chamadas.append((url, headers))
        token = headers["Authorization"].removeprefix("Bearer ")
        if token in usuarios:
            return RespostaFalsa(200, {"email": usuarios[token]})
        return RespostaFalsa(401, {"msg": "invalid JWT"})

    monkeypatch.setattr(autenticacao.httpx, "get", get_falso)
    monkeypatch.setenv("ADMIN_EMAILS", "admin@exemplo.com, outra@exemplo.com")
    return chamadas


@pytest.fixture
def cliente():
    repo = RepoFalso()
    app.dependency_overrides[get_repo] = lambda: repo
    yield TestClient(app), repo
    app.dependency_overrides.clear()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_sem_token_retorna_401(cliente, supabase):
    resp = cliente[0].get("/api/admin/feedback")
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"
    assert supabase == []  # nem consulta o Supabase


def test_token_invalido_retorna_401(cliente, supabase):
    assert cliente[0].get("/api/admin/feedback", headers=auth("expirado")).status_code == 401


def test_usuario_que_nao_e_admin_retorna_403(cliente, supabase):
    resp = cliente[0].get("/api/admin/feedback", headers=auth("token-comum"))
    assert resp.status_code == 403


def test_admin_ve_feedbacks_com_filtro_e_paginacao(cliente, supabase):
    http, repo = cliente
    resp = http.get("/api/admin/feedback", params={"avaliacao": 5, "pagina": 2, "por_pagina": 10},
                    headers=auth("token-admin"))
    assert resp.status_code == 200
    assert resp.json()["media"] == 5.0
    assert repo.ultima_listagem == (5, 10, 10)
    url, headers = supabase[0]
    assert url.endswith("/auth/v1/user")
    assert headers["apikey"].startswith("sb_publishable_")


def test_admin_eu_e_email_normalizado(cliente, supabase):
    assert cliente[0].get("/api/admin/eu", headers=auth("token-admin")).json() == {"email": "admin@exemplo.com"}


def test_token_valido_fica_em_cache(cliente, supabase):
    for _ in range(3):
        cliente[0].get("/api/admin/eu", headers=auth("token-admin"))
    assert len(supabase) == 1


def test_supabase_fora_do_ar_retorna_503(cliente, monkeypatch):
    def falha(*args, **kwargs):
        raise httpx.ConnectError("sem rede")
    monkeypatch.setattr(autenticacao.httpx, "get", falha)
    assert cliente[0].get("/api/admin/eu", headers=auth("qualquer")).status_code == 503


def test_lista_de_admins_vazia_bloqueia_todos(cliente, supabase, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "")
    assert cliente[0].get("/api/admin/eu", headers=auth("token-admin")).status_code == 403


@pytest.mark.parametrize("avaliacao", [0, 6])
def test_filtro_de_avaliacao_invalido(cliente, supabase, avaliacao):
    resp = cliente[0].get("/api/admin/feedback", params={"avaliacao": avaliacao}, headers=auth("token-admin"))
    assert resp.status_code == 422


def test_feedback_limitado_a_5_envios_por_ip(cliente):
    http, repo = cliente
    corpo = {"mensagem": "Mensagem de teste"}
    for _ in range(5):
        assert http.post("/api/feedback", json=corpo, headers={"X-Forwarded-For": "1.2.3.4"}).status_code == 201
    resp = http.post("/api/feedback", json=corpo, headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.1"})
    assert resp.status_code == 429
    # Outro IP continua podendo enviar
    assert http.post("/api/feedback", json=corpo, headers={"X-Forwarded-For": "5.6.7.8"}).status_code == 201
    assert len(repo.feedbacks) == 6


def test_limite_libera_depois_da_janela():
    agora = [0.0]
    limite = LimiteDeEnvios(maximo=2, janela_segundos=60, relogio=lambda: agora[0])
    assert limite.permitir("ip") and limite.permitir("ip")
    assert not limite.permitir("ip")
    agora[0] = 61
    assert limite.permitir("ip")
