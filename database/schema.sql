-- ==============================================================================
-- ESQUEMA DO BANCO DE DADOS (PostgreSQL / Supabase)
-- Executado automaticamente por scripts/carregar_supabase.py (idempotente).
-- ==============================================================================

create extension if not exists pg_trgm;

-- Mandatos (períodos de composição do Conselho)
create table if not exists mandatos (
    id          serial primary key,
    codigo      text unique not null,          -- ex: "2024mar 2026jan"
    inicio      date not null,
    fim         date not null
);

-- Cadeiras de cada mandato
create table if not exists cadeiras (
    id          serial primary key,
    mandato_id  int not null references mandatos(id) on delete cascade,
    segmento    text not null,
    orgao       text not null,
    cadeira     text
);

-- Pessoas que ocupam as cadeiras (titulares e suplentes)
create table if not exists conselheiros (
    id          serial primary key,
    cadeira_id  int not null references cadeiras(id) on delete cascade,
    nome        text not null,
    nome_norm   text not null,
    genero      char(1),
    funcao      text not null check (funcao in ('TITULAR', 'SUPLENTE'))
);
create index if not exists idx_conselheiros_nome on conselheiros using gin (nome_norm gin_trgm_ops);

-- Reuniões (uma por ata em PDF)
create table if not exists reunioes (
    id          serial primary key,
    arquivo     text unique not null,
    titulo      text not null,
    tipo        text not null,                 -- Ordinária | Extraordinária | Técnica
    data        date,
    ano         int,
    local       text,
    mandato_id  int references mandatos(id) on delete set null
);
create index if not exists idx_reunioes_ano on reunioes (ano);

-- Texto das atas, linha a linha (alimenta a busca)
create table if not exists linhas_ata (
    id          bigserial primary key,
    reuniao_id  int not null references reunioes(id) on delete cascade,
    ordem       int not null,
    texto       text not null,
    texto_norm  text not null                  -- minúsculo e sem acentos
);
create index if not exists idx_linhas_reuniao on linhas_ata (reuniao_id, ordem);
create index if not exists idx_linhas_trgm on linhas_ata using gin (texto_norm gin_trgm_ops);

-- Busca textual em português (radicais: "ciclovias" encontra "ciclovia"), calculada pelo
-- próprio Postgres a partir do texto já sem acentos.
alter table linhas_ata add column if not exists busca tsvector
    generated always as (to_tsvector('portuguese', texto_norm)) stored;
create index if not exists idx_linhas_busca on linhas_ata using gin (busca);

-- Temas identificados em cada reunião (análise de dados)
create table if not exists temas_reuniao (
    reuniao_id  int not null references reunioes(id) on delete cascade,
    tema        text not null,
    ocorrencias int not null,
    primary key (reuniao_id, tema)
);

-- Feedback enviado pelos usuários do site (única tabela com escrita pública via API)
create table if not exists feedback (
    id          serial primary key,
    criado_em   timestamptz not null default now(),
    nome        text check (char_length(nome) <= 100),
    mensagem    text not null check (char_length(mensagem) between 3 and 2000),
    avaliacao   int check (avaliacao between 1 and 5)
);

-- Segurança: o Supabase expõe o schema "public" pela API REST dele (chave anon).
-- Ativamos RLS sem políticas: ninguém acessa por ali. Nossa API (Render) conecta
-- direto no Postgres com o usuário dono das tabelas, que não é afetado pelo RLS.
alter table mandatos      enable row level security;
alter table cadeiras      enable row level security;
alter table conselheiros  enable row level security;
alter table reunioes      enable row level security;
alter table linhas_ata    enable row level security;
alter table temas_reuniao enable row level security;
alter table feedback      enable row level security;
