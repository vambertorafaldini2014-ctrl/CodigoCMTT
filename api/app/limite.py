"""Limite simples de requisições por chave (ex.: IP), em memória, para evitar spam no feedback."""
import time
from collections import defaultdict, deque


class LimiteDeEnvios:
    def __init__(self, maximo: int, janela_segundos: float, relogio=time.monotonic):
        self.maximo = maximo
        self.janela = janela_segundos
        self.relogio = relogio
        self._registros: dict[str, deque] = defaultdict(deque)

    def permitir(self, chave: str) -> bool:
        """Registra uma tentativa e diz se ela está dentro do limite."""
        agora = self.relogio()
        fila = self._registros[chave]
        while fila and fila[0] <= agora - self.janela:
            fila.popleft()
        if len(fila) >= self.maximo:
            return False
        fila.append(agora)
        return True

    def limpar(self):
        self._registros.clear()
