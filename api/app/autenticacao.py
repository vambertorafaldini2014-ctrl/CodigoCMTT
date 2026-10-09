"""
Autenticação da área administrativa com o Supabase Auth.

O site faz o login direto no Supabase e envia o token de acesso (JWT) no cabeçalho
"Authorization: Bearer ...". A API confirma o token perguntando ao próprio Supabase quem é o
usuário (GET /auth/v1/user) e só libera quem estiver na lista ADMIN_EMAILS.
"""
import hashlib
import os
import time

import httpx
from fastapi import Header, HTTPException

# Valores públicos do projeto (a chave "publishable" pode ficar no navegador; o banco é protegido por RLS)
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://aigencggrhljwzibbbfo.supabase.co")
SUPABASE_CHAVE_PUBLICA = os.getenv("SUPABASE_CHAVE_PUBLICA", "sb_publishable_8IJgdwxPw12UbWkTqNZNdQ_4_Hlt-Ja")

_CACHE_SEGUNDOS = 60
_cache: dict[str, tuple[str, float]] = {}  # hash do token -> (e-mail, validade)


def emails_admin() -> set[str]:
    return {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}


def email_do_token(token: str) -> str | None:
    """E-mail do usuário dono do token, ou None se o token for inválido/expirado."""
    chave = hashlib.sha256(token.encode()).hexdigest()
    agora = time.monotonic()
    if chave in _cache and _cache[chave][1] > agora:
        return _cache[chave][0]
    try:
        resposta = httpx.get(f"{SUPABASE_URL}/auth/v1/user", timeout=10, headers={
            "apikey": SUPABASE_CHAVE_PUBLICA, "Authorization": f"Bearer {token}"})
    except httpx.HTTPError:
        raise HTTPException(503, "Serviço de login indisponível. Tente novamente.")
    if resposta.status_code != 200:
        return None
    email = (resposta.json().get("email") or "").lower()
    if len(_cache) > 1000:
        _cache.clear()
    _cache[chave] = (email, agora + _CACHE_SEGUNDOS)
    return email


def exigir_admin(authorization: str | None = Header(None)) -> str:
    """Dependência do FastAPI: devolve o e-mail do administrador ou interrompe com 401/403."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Faça login para acessar.", headers={"WWW-Authenticate": "Bearer"})
    email = email_do_token(authorization[7:].strip())
    if not email:
        raise HTTPException(401, "Sessão inválida ou expirada. Faça login novamente.",
                            headers={"WWW-Authenticate": "Bearer"})
    if email not in emails_admin():
        raise HTTPException(403, "Este usuário não tem permissão de administrador.")
    return email
