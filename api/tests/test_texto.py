from datetime import date

import pytest

from app.texto import contar_temas, normalizar, padrao_like, periodo_mandato, pessoas_da_cadeira, tipo_reuniao


def test_normalizar_remove_acentos_e_espacos():
    assert normalizar("  Ônibus   na  Praça da Sé ") == "onibus na praca da se"


def test_normalizar_vazio():
    assert normalizar("") == ""
    assert normalizar(None) == ""


def test_padrao_like_flexivel_respeita_ordem_das_palavras():
    assert padrao_like("Ciclovia Paulista") == "%ciclovia%paulista%"


def test_padrao_like_frase_exata_entre_aspas():
    assert padrao_like('"faixa exclusiva"') == "%faixa exclusiva%"


def test_padrao_like_escapa_curingas():
    assert padrao_like("100%_ok") == "%100\\%\\_ok%"


@pytest.mark.parametrize("termo", ["", " ", "a", '""', '"x"'])
def test_padrao_like_termo_curto_retorna_none(termo):
    assert padrao_like(termo) is None


def test_periodo_mandato():
    assert periodo_mandato("2013ago 2014mai") == (date(2013, 8, 1), date(2014, 5, 31))
    assert periodo_mandato("2024mar 2026jan") == (date(2024, 3, 1), date(2026, 1, 31))


def test_periodo_mandato_dezembro():
    assert periodo_mandato("2020jan 2021dez")[1] == date(2021, 12, 31)


def test_periodo_mandato_invalido():
    with pytest.raises(ValueError):
        periodo_mandato("mandato qualquer")


@pytest.mark.parametrize("titulo,esperado", [
    ("12ª Reunião Ordinária", "Ordinária"),
    ("Reunião Extraordinária", "Extraordinária"),
    ("Reunião Técnica Ordinária", "Técnica"),
])
def test_tipo_reuniao(titulo, esperado):
    assert tipo_reuniao(titulo) == esperado


def test_pessoas_da_cadeira_remove_repeticoes_na_mesma_funcao():
    cadeira = {
        "titulares": [{"nome": "Monique Garrido"}, {"nome": "Monique Garrido"}, {"nome": "André Luis Pina"},
                      {"nome": "André Luís Pina"}],
        "suplentes": [{"nome": "Monique Garrido"}, {"nome": "VAGO"}, {"nome": "VAGO"}, {"nome": "  "}],
    }
    resultado = [(p["nome"], funcao) for p, funcao in pessoas_da_cadeira(cadeira)]
    assert resultado == [
        ("Monique Garrido", "TITULAR"),
        ("André Luis Pina", "TITULAR"),
        ("Monique Garrido", "SUPLENTE"),  # mesma pessoa em outra função continua registrada
        ("VAGO", "SUPLENTE"),
        ("VAGO", "SUPLENTE"),             # vagas não são pessoas: cada uma é mantida
    ]


def test_pessoas_da_cadeira_sem_listas():
    assert pessoas_da_cadeira({"titulares": None}) == []


def test_contar_temas():
    dicionario = {"Ônibus": [r"ônibus", r"onibus"], "Bicicleta": [r"ciclovia"], "Vazio": [r"zzz"]}
    linhas = ["O ônibus atrasou", "Nova CICLOVIA e outra ciclovia", "Mais um onibus"]
    assert contar_temas(linhas, dicionario) == {"Ônibus": 2, "Bicicleta": 2}
