"""Camada de acesso ao banco (PostgreSQL no Supabase). Todo SQL da API mora aqui."""
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


class Repositorio:
    def __init__(self, pool: ConnectionPool):
        self.pool = pool

    def _todos(self, sql: str, params=None) -> list[dict]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def _um(self, sql: str, params=None) -> dict | None:
        linhas = self._todos(sql, params)
        return linhas[0] if linhas else None

    # ---------------------------------------------------------------- saúde
    def ping(self) -> bool:
        return self._um("select 1 as ok")["ok"] == 1

    # ---------------------------------------------------------------- reuniões
    def anos(self) -> list[int]:
        return [r["ano"] for r in self._todos(
            "select distinct ano from reunioes where ano is not null order by ano desc")]

    def listar_reunioes(self, ano: int | None = None, tipo: str | None = None) -> list[dict]:
        return self._todos(
            """
            select r.id, r.arquivo, r.titulo, r.tipo, r.data, r.ano, r.local,
                   (select count(*) from linhas_ata l where l.reuniao_id = r.id) as total_linhas,
                   (select t.tema from temas_reuniao t where t.reuniao_id = r.id
                     order by t.ocorrencias desc limit 1) as tema_principal
              from reunioes r
             where (%(ano)s::int is null or r.ano = %(ano)s)
               and (%(tipo)s::text is null or r.tipo = %(tipo)s)
             order by r.data desc nulls last, r.id desc
            """,
            {"ano": ano, "tipo": tipo},
        )

    def obter_reuniao(self, reuniao_id: int) -> dict | None:
        reuniao = self._um(
            """
            select r.id, r.arquivo, r.titulo, r.tipo, r.data, r.ano, r.local, m.codigo as mandato
              from reunioes r left join mandatos m on m.id = r.mandato_id
             where r.id = %s
            """,
            (reuniao_id,),
        )
        if not reuniao:
            return None
        reuniao["temas"] = self._todos(
            "select tema, ocorrencias from temas_reuniao where reuniao_id = %s order by ocorrencias desc",
            (reuniao_id,),
        )
        reuniao["linhas"] = [r["texto"] for r in self._todos(
            "select texto from linhas_ata where reuniao_id = %s order by ordem", (reuniao_id,))]
        return reuniao

    # ---------------------------------------------------------------- busca
    def consulta_valida(self, consulta: str) -> bool:
        """False quando a busca inteligente não sobra nada (ex.: só palavras como "de", "a", "o")."""
        return self._um("select numnode(websearch_to_tsquery('portuguese', %s)) > 0 as ok", (consulta,))["ok"]

    def radicais(self, palavras: str) -> list[str]:
        """Radicais em português das palavras (ex.: "ciclovias" -> "ciclov"), para destacar no site."""
        return [r["lexema"] for r in self._todos(
            "select distinct unnest(tsvector_to_array(to_tsvector('portuguese', %s))) as lexema", (palavras,))]

    def buscar(self, *, modo: str, consulta: str, padrao: str | None, ordem: str,
               ano: int | None, limite: int, deslocamento: int) -> dict:
        """
        modo "inteligente": busca por radicais em português (websearch_to_tsquery);
        modo "exato": o texto digitado aparece na linha (LIKE, ignorando acentos).
        ordem "relevancia" (ts_rank_cd) ou "data" (mais recentes primeiro).
        """
        condicao = ("l.busca @@ websearch_to_tsquery('portuguese', %(consulta)s)" if modo == "inteligente"
                    else "l.texto_norm like %(padrao)s")
        filtro = f"""
              from linhas_ata l join reunioes r on r.id = l.reuniao_id
             where {condicao}
               and (%(ano)s::int is null or r.ano = %(ano)s)
        """
        ordenacao = "r.data desc nulls last, l.ordem"
        if ordem == "relevancia":
            ordenacao = ("ts_rank_cd(l.busca, websearch_to_tsquery('portuguese', %(consulta)s)) desc, "
                         + ordenacao)
        params = {"consulta": consulta, "padrao": padrao, "ano": ano,
                  "limite": limite, "deslocamento": deslocamento}
        total = self._um("select count(*) as total " + filtro, params)["total"]
        por_ano = self._todos(
            "select r.ano, count(*) as ocorrencias " + filtro + " group by r.ano order by r.ano", params)
        resultados = self._todos(
            """
            select r.id as reuniao_id, r.arquivo, r.titulo, r.data, r.ano, l.ordem, l.texto
            """ + filtro + f"""
             order by {ordenacao}
             limit %(limite)s offset %(deslocamento)s
            """,
            params,
        )
        return {"total": total, "por_ano": por_ano, "resultados": resultados}

    # ---------------------------------------------------------------- conselho
    def listar_mandatos(self) -> list[dict]:
        return self._todos(
            """
            select m.id, m.codigo, m.inicio, m.fim,
                   count(distinct c.id) as cadeiras,
                   count(distinct p.nome_norm) filter (where p.nome <> 'VAGO') as conselheiros,
                   (select count(*) from reunioes r where r.mandato_id = m.id) as reunioes
              from mandatos m
              left join cadeiras c on c.mandato_id = m.id
              left join conselheiros p on p.cadeira_id = c.id
             group by m.id order by m.inicio desc
            """
        )

    def obter_mandato(self, mandato_id: int) -> dict | None:
        mandato = self._um("select id, codigo, inicio, fim from mandatos where id = %s", (mandato_id,))
        if not mandato:
            return None
        linhas = self._todos(
            """
            select c.id, c.segmento, c.orgao, c.cadeira, p.nome, p.genero, p.funcao
              from cadeiras c left join conselheiros p on p.cadeira_id = c.id
             where c.mandato_id = %s
             order by c.segmento, c.orgao, p.funcao desc, p.nome
            """,
            (mandato_id,),
        )
        cadeiras: dict[int, dict] = {}
        for l in linhas:
            cad = cadeiras.setdefault(l["id"], {
                "segmento": l["segmento"], "orgao": l["orgao"], "cadeira": l["cadeira"],
                "titulares": [], "suplentes": []})
            if l["nome"]:
                chave = "titulares" if l["funcao"] == "TITULAR" else "suplentes"
                cad[chave].append({"nome": l["nome"], "genero": l["genero"]})
        mandato["cadeiras"] = list(cadeiras.values())
        return mandato

    def buscar_conselheiros(self, padrao: str) -> list[dict]:
        return self._todos(
            """
            select p.nome, p.funcao, c.orgao, c.segmento, m.codigo as mandato, m.inicio
              from conselheiros p
              join cadeiras c on c.id = p.cadeira_id
              join mandatos m on m.id = c.mandato_id
             where p.nome_norm like %s and p.nome <> 'VAGO'
             order by p.nome, m.inicio
             limit 200
            """,
            (padrao,),
        )

    # ---------------------------------------------------------------- análise de dados
    def estatisticas(self) -> dict:
        return {
            "totais": self._um(
                """
                select (select count(*) from reunioes) as reunioes,
                       (select count(*) from linhas_ata) as linhas,
                       (select count(*) from mandatos) as mandatos,
                       (select count(distinct nome_norm) from conselheiros where nome <> 'VAGO') as pessoas
                """
            ),
            "reunioes_por_ano": self._todos(
                """
                select ano,
                       count(*) filter (where tipo = 'Ordinária') as ordinarias,
                       count(*) filter (where tipo <> 'Ordinária') as extraordinarias
                  from reunioes where ano is not null group by ano order by ano
                """
            ),
            "temas": self._todos(
                """
                select tema, sum(ocorrencias)::int as ocorrencias, count(*) as reunioes
                  from temas_reuniao group by tema order by ocorrencias desc
                """
            ),
            "temas_por_ano": self._todos(
                """
                select r.ano, t.tema, sum(t.ocorrencias)::int as ocorrencias
                  from temas_reuniao t join reunioes r on r.id = t.reuniao_id
                 group by r.ano, t.tema order by r.ano
                """
            ),
            # Conta PESSOAS distintas (não registros): quem foi titular e suplente,
            # ou ocupou duas cadeiras no mesmo mandato, conta uma vez só.
            "genero_por_mandato": self._todos(
                """
                select m.codigo as mandato,
                       count(distinct p.nome_norm) filter (where p.genero = 'F') as feminino,
                       count(distinct p.nome_norm) filter (where p.genero = 'M') as masculino,
                       count(distinct p.nome_norm) filter (where p.genero is null) as nao_informado,
                       (select count(*) from cadeiras c2 where c2.mandato_id = m.id) as cadeiras
                  from mandatos m
                  join cadeiras c on c.mandato_id = m.id
                  join conselheiros p on p.cadeira_id = c.id and p.nome <> 'VAGO'
                 group by m.id order by m.inicio
                """
            ),
            "segmentos_mandato_atual": self._todos(
                """
                select c.segmento, count(*) as cadeiras
                  from cadeiras c
                 where c.mandato_id = (select id from mandatos order by inicio desc limit 1)
                 group by c.segmento order by cadeiras desc
                """
            ),
        }

    # ---------------------------------------------------------------- feedback
    def salvar_feedback(self, nome: str | None, mensagem: str, avaliacao: int | None) -> int:
        with self.pool.connection() as conn:
            cur = conn.execute(
                "insert into feedback (nome, mensagem, avaliacao) values (%s, %s, %s) returning id",
                (nome, mensagem, avaliacao),
            )
            return cur.fetchone()[0]

    def listar_feedback(self, avaliacao: int | None, limite: int, deslocamento: int) -> dict:
        """Resumo geral (total, média, distribuição das notas) e a página de mensagens pedida."""
        params = {"nota": avaliacao, "limite": limite, "deslocamento": deslocamento}
        filtro = "where (%(nota)s::int is null or avaliacao = %(nota)s)"
        resumo = self._um(
            "select count(*) as total, round(avg(avaliacao), 2)::float as media from feedback")
        return {
            **resumo,
            "distribuicao": self._todos(
                "select avaliacao, count(*) as total from feedback group by avaliacao order by avaliacao nulls last"),
            "total_filtrado": self._um(f"select count(*) as total from feedback {filtro}", params)["total"],
            "itens": self._todos(
                f"""select id, criado_em, nome, mensagem, avaliacao from feedback {filtro}
                     order by criado_em desc limit %(limite)s offset %(deslocamento)s""", params),
        }
