"""Funções puras de tratamento de texto, compartilhadas pela API e pela carga de dados."""
import re
import unicodedata
from datetime import date


def normalizar(texto: str) -> str:
    """Minúsculas, sem acentos e com espaços simples. Ex: ' Ônibus  São ' -> 'onibus sao'."""
    if not texto:
        return ""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", sem_acento).strip().lower()


def padrao_like(termo: str) -> str | None:
    """
    Converte a busca em um padrão LIKE equivalente à "busca flexível" do app original:
    as palavras precisam aparecer na mesma linha, nesta ordem, com qualquer coisa entre elas.
    Termos entre aspas viram uma frase exata. Retorna None se não sobrar nada para buscar.
    """
    termo = (termo or "").strip()
    exato = len(termo) >= 2 and termo[0] == termo[-1] == '"'
    termo = normalizar(termo.strip('"'))
    if len(termo) < 2:
        return None
    # Escapa os curingas do LIKE para que o usuário não injete % ou _
    termo = termo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    if exato:
        return f"%{termo}%"
    return "%" + "%".join(termo.split(" ")) + "%"


MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
         "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}


def periodo_mandato(codigo: str) -> tuple[date, date]:
    """'2013ago 2014mai' -> (2013-08-01, 2014-05-31)."""
    m = re.fullmatch(r"(\d{4})([a-z]{3})\s+(\d{4})([a-z]{3})", codigo.strip().lower())
    if not m:
        raise ValueError(f"Código de mandato inválido: {codigo!r}")
    ano_i, mes_i, ano_f, mes_f = int(m[1]), MESES[m[2]], int(m[3]), MESES[m[4]]
    inicio = date(ano_i, mes_i, 1)
    # último dia do mês final
    prox = date(ano_f + (mes_f == 12), mes_f % 12 + 1, 1)
    fim = date.fromordinal(prox.toordinal() - 1)
    return inicio, fim


def tipo_reuniao(titulo: str) -> str:
    t = normalizar(titulo)
    if "extraordin" in t:
        return "Extraordinária"
    if "tecnica" in t:
        return "Técnica"
    return "Ordinária"


def pessoas_da_cadeira(cadeira: dict) -> list[tuple[dict, str]]:
    """
    Titulares e suplentes de uma cadeira, sem repetições: a planilha às vezes lista a mesma
    pessoa duas vezes na mesma função (ou com grafia diferente só nos acentos).
    """
    vistos, resultado = set(), []
    for funcao, chave in (("TITULAR", "titulares"), ("SUPLENTE", "suplentes")):
        for pessoa in cadeira.get(chave) or []:
            nome = (pessoa.get("nome") or "").strip()
            if not nome:
                continue
            identidade = (funcao, normalizar(nome))
            if nome != "VAGO" and identidade in vistos:
                continue
            vistos.add(identidade)
            resultado.append((pessoa, funcao))
    return resultado


def contar_temas(linhas: list[str], dicionario: dict[str, list[str]]) -> dict[str, int]:
    """Conta quantas vezes os termos de cada tema aparecem no texto (início de palavra)."""
    texto = "\n".join(linhas).lower()
    contagem = {}
    for tema, padroes in dicionario.items():
        total = sum(len(re.findall(r"\b" + p, texto)) for p in padroes)
        if total:
            contagem[tema] = total
    return contagem
