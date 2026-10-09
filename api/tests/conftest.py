import pytest

from app import autenticacao
from app.main import limite_feedback


@pytest.fixture(autouse=True)
def estado_limpo():
    """Cada teste começa sem histórico de envios e sem tokens em cache."""
    limite_feedback.limpar()
    autenticacao._cache.clear()
    yield
