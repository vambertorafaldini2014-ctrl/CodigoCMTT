"""
API REST do Buscador CMTT (FastAPI).
Documentação interativa gerada automaticamente em /docs (Swagger) e /redoc.
"""
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .texto import padrao_like

GITHUB_USUARIO = os.getenv("GITHUB_USUARIO", "vambertorafaldini2014-ctrl")
GITHUB_REPO = os.getenv("GITHUB_REPO", "CodigoCMTT")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

_repo = None  # instanciado no startup quando DATABASE_URL existe


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    global _repo
    url = os.getenv("DATABASE_URL")
    pool = None
    if url:
        from psycopg_pool import ConnectionPool
        from .repositorio import Repositorio

        # prepare_threshold=None: compatível com o pooler do Supabase (pgbouncer)
        pool = ConnectionPool(url, min_size=1, max_size=5, open=True,
                              kwargs={"prepare_threshold": None}, check=ConnectionPool.check_connection)
        _repo = Repositorio(pool)
    yield
    if pool:
        pool.close()


app = FastAPI(
    title="API Buscador CMTT",
    description="Consulta às atas, à composição e às estatísticas do Conselho Municipal "
                "de Trânsito e Transporte de São Paulo (Projeto Integrador UNIVESP).",
    version="1.0.0",
    lifespan=ciclo_de_vida,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_repo():
    if _repo is None:
        raise HTTPException(503, "Banco de dados não configurado (defina DATABASE_URL).")
    return _repo


def url_pdf(arquivo: str) -> str:
    return (f"https://raw.githubusercontent.com/{GITHUB_USUARIO}/{GITHUB_REPO}/"
            f"{GITHUB_BRANCH}/dados/base_dados/pdf_atas_pleno/{arquivo}")


def _com_pdf(item: dict) -> dict:
    item["url_pdf"] = url_pdf(item["arquivo"])
    return item


# ------------------------------------------------------------------------- rotas
@app.get("/", include_in_schema=False)
def raiz():
    return {"servico": "API Buscador CMTT", "documentacao": "/docs"}


@app.get("/api/saude", tags=["Sistema"], summary="Verifica se a API e o banco estão no ar")
def saude():
    banco = False
    if _repo is not None:
        try:
            banco = _repo.ping()
        except Exception:
            banco = False
    return {"status": "ok", "banco": banco}


@app.get("/api/anos", tags=["Reuniões"], summary="Anos que possuem atas")
def anos(repo=Depends(get_repo)) -> list[int]:
    return repo.anos()


@app.get("/api/reunioes", tags=["Reuniões"], summary="Lista as reuniões do Conselho Pleno")
def listar_reunioes(
    ano: int | None = Query(None, ge=2000, le=2100),
    tipo: str | None = Query(None, pattern="^(Ordinária|Extraordinária|Técnica)$"),
    repo=Depends(get_repo),
):
    return [_com_pdf(r) for r in repo.listar_reunioes(ano, tipo)]


@app.get("/api/reunioes/{reuniao_id}", tags=["Reuniões"], summary="Detalhes e texto de uma ata")
def obter_reuniao(reuniao_id: int, repo=Depends(get_repo)):
    reuniao = repo.obter_reuniao(reuniao_id)
    if not reuniao:
        raise HTTPException(404, "Reunião não encontrada.")
    return _com_pdf(reuniao)


@app.get("/api/busca", tags=["Busca"], summary="Busca textual em todas as atas")
def buscar(
    q: str = Query(..., min_length=2, max_length=200, description='Palavras-chave ou "frase exata"'),
    ano: int | None = Query(None, ge=2000, le=2100),
    pagina: int = Query(1, ge=1, le=1000),
    por_pagina: int = Query(50, ge=1, le=200),
    repo=Depends(get_repo),
):
    padrao = padrao_like(q)
    if not padrao:
        raise HTTPException(422, "Digite ao menos 2 caracteres válidos.")
    res = repo.buscar(padrao, ano, por_pagina, (pagina - 1) * por_pagina)
    res["resultados"] = [_com_pdf(r) for r in res["resultados"]]
    return {"termo": q, "pagina": pagina, "por_pagina": por_pagina, **res}


@app.get("/api/mandatos", tags=["Conselho"], summary="Lista os mandatos do Conselho")
def listar_mandatos(repo=Depends(get_repo)):
    return repo.listar_mandatos()


@app.get("/api/mandatos/{mandato_id}", tags=["Conselho"], summary="Composição (cadeiras) de um mandato")
def obter_mandato(mandato_id: int, repo=Depends(get_repo)):
    mandato = repo.obter_mandato(mandato_id)
    if not mandato:
        raise HTTPException(404, "Mandato não encontrado.")
    return mandato


@app.get("/api/conselheiros", tags=["Conselho"], summary="Histórico de uma pessoa no Conselho")
def buscar_conselheiros(q: str = Query(..., min_length=2, max_length=100), repo=Depends(get_repo)):
    padrao = padrao_like(q)
    if not padrao:
        raise HTTPException(422, "Digite ao menos 2 caracteres válidos.")
    return repo.buscar_conselheiros(padrao)


@app.get("/api/estatisticas", tags=["Análise de dados"], summary="Indicadores para o painel")
def estatisticas(repo=Depends(get_repo)):
    return repo.estatisticas()


class Feedback(BaseModel):
    nome: str | None = Field(None, max_length=100)
    mensagem: str = Field(..., min_length=3, max_length=2000)
    avaliacao: int | None = Field(None, ge=1, le=5)


@app.post("/api/feedback", status_code=201, tags=["Feedback"], summary="Envia uma sugestão ou avaliação")
def enviar_feedback(dados: Feedback, repo=Depends(get_repo)):
    nome = dados.nome.strip() if dados.nome and dados.nome.strip() else None
    novo_id = repo.salvar_feedback(nome, dados.mensagem.strip(), dados.avaliacao)
    return {"id": novo_id, "mensagem": "Obrigado pelo seu feedback!"}
