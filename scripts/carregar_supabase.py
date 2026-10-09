"""
ETL: carrega no PostgreSQL (Supabase) os dados já processados pelo pipeline local.

Fontes (geradas pelos construtores do projeto):
  - dados/configs/.cache_corpus_atas.json  -> texto das atas (linhas_ata)
  - dados/configs/index_atas.json          -> datas, títulos e locais (reunioes)
  - dados/configs/AAAAmmm AAAAmmm.json     -> composição de cada mandato

Uso (na raiz do projeto, com DATABASE_URL no arquivo .env):
    python scripts/carregar_supabase.py

O script é idempotente: recria o esquema e recarrega tudo a cada execução,
mas preserva a tabela de feedback.
"""
import glob
import json
import os
import sys
from datetime import datetime

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(RAIZ, "api"))
sys.path.insert(0, RAIZ)

import psycopg  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from app.texto import contar_temas, normalizar, periodo_mandato, pessoas_da_cadeira, tipo_reuniao  # noqa: E402
from core.config_ambiente import DICIONARIO_TEMAS  # noqa: E402

CONFIGS = os.path.join(RAIZ, "dados", "configs")


def ler_json(nome):
    with open(os.path.join(CONFIGS, nome), encoding="utf-8") as f:
        return json.load(f)


def parse_data(texto):
    try:
        return datetime.strptime((texto or "").strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def main():
    load_dotenv(os.path.join(RAIZ, ".env"))
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("❌ DATABASE_URL não definida. Coloque-a no arquivo .env na raiz do projeto.")

    corpus = ler_json(".cache_corpus_atas.json")
    index = ler_json("index_atas.json")
    arquivos_mandato = sorted(glob.glob(os.path.join(CONFIGS, "[0-9][0-9][0-9][0-9]* *.json")))

    with psycopg.connect(url, prepare_threshold=None) as conn:
        print("🧱 Criando esquema...")
        with open(os.path.join(RAIZ, "database", "schema.sql"), encoding="utf-8") as f:
            conn.execute(f.read())
        conn.execute("truncate temas_reuniao, linhas_ata, reunioes, conselheiros, cadeiras, mandatos "
                     "restart identity cascade")

        print(f"👥 Carregando {len(arquivos_mandato)} mandatos...")
        mandatos = []  # (id, inicio, fim)
        for caminho in arquivos_mandato:
            dados = json.load(open(caminho, encoding="utf-8"))
            codigo = dados.get("arquivo_origem") or os.path.splitext(os.path.basename(caminho))[0]
            inicio, fim = periodo_mandato(codigo)
            mandato_id = conn.execute(
                "insert into mandatos (codigo, inicio, fim) values (%s, %s, %s) returning id",
                (codigo, inicio, fim)).fetchone()[0]
            mandatos.append((mandato_id, inicio, fim))
            for cad in dados["cadeiras"]:
                cadeira_id = conn.execute(
                    "insert into cadeiras (mandato_id, segmento, orgao, cadeira) values (%s, %s, %s, %s) returning id",
                    (mandato_id, cad["segmento"], cad["nome_orgao_exibicao"], cad.get("cadeira_padronizada"))
                ).fetchone()[0]
                with conn.cursor() as cur:
                    cur.executemany(
                        "insert into conselheiros (cadeira_id, nome, nome_norm, genero, funcao) values (%s, %s, %s, %s, %s)",
                        [(cadeira_id, p["nome"].strip(), normalizar(p["nome"]), (p.get("genero") or None), funcao)
                         for p, funcao in pessoas_da_cadeira(cad)])

        def mandato_da_data(data):
            for mandato_id, inicio, fim in mandatos:
                if data and inicio <= data <= fim:
                    return mandato_id
            return None

        print(f"📄 Carregando {len(corpus)} atas...")
        total_linhas = 0
        for doc in corpus:
            arquivo = doc["Fonte"]
            meta = index.get(arquivo, {})
            titulo = meta.get("titulo_reuniao") or doc.get("Reunião") or arquivo
            data = parse_data(meta.get("data_correta"))
            ano = data.year if data else (int(doc["Data"]) if str(doc.get("Data", "")).isdigit() else None)
            local = meta.get("local")
            if local and local.strip().lower() == "não informado":
                local = None

            reuniao_id = conn.execute(
                """insert into reunioes (arquivo, titulo, tipo, data, ano, local, mandato_id)
                   values (%s, %s, %s, %s, %s, %s, %s) returning id""",
                (arquivo, titulo, tipo_reuniao(titulo), data, ano, local, mandato_da_data(data))
            ).fetchone()[0]

            linhas = [l.strip() for l in doc["Linhas"] if l and l.strip()]
            with conn.cursor() as cur:
                with cur.copy("copy linhas_ata (reuniao_id, ordem, texto, texto_norm) from stdin") as copy:
                    for ordem, texto in enumerate(linhas, start=1):
                        copy.write_row((reuniao_id, ordem, texto, normalizar(texto)))
                cur.executemany(
                    "insert into temas_reuniao (reuniao_id, tema, ocorrencias) values (%s, %s, %s)",
                    [(reuniao_id, tema, n) for tema, n in contar_temas(linhas, DICIONARIO_TEMAS).items()])
            total_linhas += len(linhas)

        conn.execute("analyze")
        print(f"✅ Concluído: {len(corpus)} reuniões, {total_linhas} linhas, {len(mandatos)} mandatos.")


if __name__ == "__main__":
    main()
