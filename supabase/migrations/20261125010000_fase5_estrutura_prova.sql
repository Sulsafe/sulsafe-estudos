-- ============================================================
-- FASE 5 (ETAPA 2/8) — ESTRUTURA DE PROVAS E PROGRESSO
-- ============================================================
-- Escopo desta migration:
--   1. Permitir rascunho de prova de I.A. sem destino (INTERNO), sem
--      alterar a regra das provas manuais (exatamente um destino).
--   2. Criar provas_questoes com gabarito protegido por privilégio de
--      coluna: aluno lê enunciado/alternativas; gabarito e justificativa
--      só saem pela RPC de correção (professor/admin) ou service_role.
--   3. Criar provas_progresso com enum de status e RLS por aluno/empresa.
--   4. Criar a RPC de materialização transacional da prova validada.
--
-- Nenhuma migration já aplicada é editada. Nenhuma chave de API participa
-- destas funções. Videoaulas, materiais e o Tutor atual não são alterados.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RASCUNHO INTERNO DE I.A. PODE FICAR SEM DESTINO
-- ------------------------------------------------------------
-- A constraint original continua valendo para prova manual. Somente uma
-- prova origem = 'IA_TUTOR' ainda não publicada pode ficar sem turma/aluno;
-- a distribuição (Etapa 4) é que vai escolher o destino.

alter table public.provas_direcionadas
    drop constraint if exists provas_direcionadas_um_destino_check;

alter table public.provas_direcionadas
    add constraint provas_direcionadas_um_destino_check
    check (
        num_nonnulls(turma_id, aluno_id) = 1
        or (
            origem = 'IA_TUTOR'
            and publicado = false
            and num_nonnulls(turma_id, aluno_id) = 0
        )
    );

-- ------------------------------------------------------------
-- 2. ENUM DE STATUS DO PROGRESSO
-- ------------------------------------------------------------

do $$
begin
    create type public.prova_progresso_status as enum ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA');
exception when duplicate_object then null;
end
$$;

-- ------------------------------------------------------------
-- 3. PROVAS_QUESTOES — ENUNCIADO PÚBLICO, GABARITO RESTRITO
-- ------------------------------------------------------------

create table if not exists public.provas_questoes (
    id uuid primary key default gen_random_uuid(),
    prova_id uuid not null
        references public.provas_direcionadas (id) on delete cascade,
    ordem integer not null check (ordem between 1 and 100),
    enunciado text not null check (length(btrim(enunciado)) between 1 and 1000),
    alternativas jsonb not null
        check (
            jsonb_typeof(alternativas) = 'array'
            and jsonb_array_length(alternativas) between 2 and 5
        ),
    -- Objeto: { "resposta_correta": "A", "justificativa": "..." }.
    -- Nunca é concedido em SELECT à role authenticated (ver grants abaixo).
    gabarito jsonb not null
        check (
            jsonb_typeof(gabarito) = 'object'
            and gabarito ? 'resposta_correta'
        ),
    peso numeric(4,2) not null default 1 check (peso > 0 and peso <= 10),
    criado_em timestamptz not null default now(),
    constraint provas_questoes_prova_ordem_key unique (prova_id, ordem)
);

create index if not exists provas_questoes_prova_idx
    on public.provas_questoes (prova_id, ordem);

comment on table public.provas_questoes is
    'Questões das provas geradas pelo Agente Direcionado. gabarito/justificativa são lidos somente pela RPC de correção ou por service_role.';

-- ------------------------------------------------------------
-- 4. PROVAS_PROGRESSO
-- ------------------------------------------------------------
-- Sem empresa_id: o isolamento vem de provas_direcionadas.ia_conteudo_id
-- (DEC-002 / D-TUTOR-01).

create table if not exists public.provas_progresso (
    id uuid primary key default gen_random_uuid(),
    prova_id uuid not null
        references public.provas_direcionadas (id) on delete cascade,
    aluno_id uuid not null
        references public.profiles (id) on delete cascade,
    status public.prova_progresso_status not null default 'PENDENTE',
    nota numeric(4,2) check (nota between 0 and 10),
    iniciado_em timestamptz,
    concluido_em timestamptz,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint provas_progresso_prova_aluno_key unique (prova_id, aluno_id),
    constraint provas_progresso_conclusao_check
        check (concluido_em is null or status = 'CONCLUIDA')
);

create index if not exists provas_progresso_aluno_idx
    on public.provas_progresso (aluno_id);

create index if not exists provas_progresso_prova_idx
    on public.provas_progresso (prova_id);

comment on table public.provas_progresso is
    'Progresso do aluno em provas direcionadas. Aluno lê só o seu; professor/admin leem todos os alunos da mesma empresa.';

create or replace function public.sulsafe_provas_progresso_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        if new.status::text in ('EM_ANDAMENTO', 'CONCLUIDA') and new.iniciado_em is null then
            new.iniciado_em := now();
        end if;
        if new.status = 'CONCLUIDA' and new.concluido_em is null then
            new.concluido_em := now();
        end if;
    else
        if new.status::text in ('EM_ANDAMENTO', 'CONCLUIDA')
           and old.status = 'PENDENTE' and new.iniciado_em is null then
            new.iniciado_em := now();
        end if;
        if new.status = 'CONCLUIDA' and old.status <> 'CONCLUIDA'
           and new.concluido_em is null then
            new.concluido_em := now();
        end if;
        if new.status <> 'CONCLUIDA' then
            new.concluido_em := null;
        end if;
        new.atualizado_em := now();
    end if;

    return new;
end;
$$;

drop trigger if exists trg_provas_progresso_sync on public.provas_progresso;
create trigger trg_provas_progresso_sync
    before insert or update of status, iniciado_em, concluido_em
    on public.provas_progresso
    for each row execute function public.sulsafe_provas_progresso_sync();

revoke all on function public.sulsafe_provas_progresso_sync() from public, anon;
grant execute on function public.sulsafe_provas_progresso_sync() to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. HELPERS DE EMPRESA E VISIBILIDADE (SECURITY DEFINER)
-- ------------------------------------------------------------

create or replace function public.sulsafe_prova_empresa_id(p_prova_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select c.empresa_id
      from public.provas_direcionadas pd
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
     where pd.id = p_prova_id
     limit 1;
$$;

create or replace function public.sulsafe_prova_gerenciada(p_prova_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_conta_ativa()
       and (public.sulsafe_is_admin() or public.sulsafe_is_professor())
       and public.sulsafe_prova_empresa_id(p_prova_id) is not null
       and public.sulsafe_prova_empresa_id(p_prova_id) = public.sulsafe_empresa_id();
$$;

create or replace function public.sulsafe_prova_aluno_valida(p_prova_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_conta_ativa()
       and exists (
           select 1
             from public.provas_direcionadas pd
            where pd.id = p_prova_id
              and pd.publicado
              and (
                  pd.aluno_id = auth.uid()
                  or exists (
                      select 1
                        from public.turma_alunos ta
                       where ta.turma_id = pd.turma_id
                         and ta.aluno_id = auth.uid()
                  )
              )
       )
       and public.sulsafe_prova_empresa_id(p_prova_id) is not null
       and public.sulsafe_prova_empresa_id(p_prova_id) = public.sulsafe_empresa_id();
$$;

revoke all on function public.sulsafe_prova_empresa_id(uuid) from public, anon;
revoke all on function public.sulsafe_prova_gerenciada(uuid) from public, anon;
revoke all on function public.sulsafe_prova_aluno_valida(uuid) from public, anon;
grant execute on function public.sulsafe_prova_empresa_id(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_prova_gerenciada(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_prova_aluno_valida(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. RLS E PRIVILÉGIOS DE COLUNA
-- ------------------------------------------------------------

alter table public.provas_questoes enable row level security;

revoke all on public.provas_questoes from anon, authenticated;
-- REVOKE + GRANT de coluna: nem SELECT * nem SELECT gabarito são possíveis
-- para authenticated. justificativa também fica de fora porque revela a
-- resposta. service_role (servidor, momento da correção) lê tudo.
grant select (id, prova_id, ordem, enunciado, alternativas, peso, criado_em)
    on public.provas_questoes to authenticated;
grant all on public.provas_questoes to service_role;

drop policy if exists "sulsafe_provas_questoes_select" on public.provas_questoes;
create policy "sulsafe_provas_questoes_select"
on public.provas_questoes
for select to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        public.sulsafe_prova_gerenciada(prova_id)
        or public.sulsafe_prova_aluno_valida(prova_id)
    )
);

alter table public.provas_progresso enable row level security;

revoke all on public.provas_progresso from anon, authenticated;
grant select on public.provas_progresso to authenticated;
grant all on public.provas_progresso to service_role;

drop policy if exists "sulsafe_provas_progresso_select" on public.provas_progresso;
create policy "sulsafe_provas_progresso_select"
on public.provas_progresso
for select to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        (
            aluno_id = auth.uid()
            and public.sulsafe_prova_aluno_valida(prova_id)
        )
        or public.sulsafe_prova_gerenciada(prova_id)
    )
);

-- ------------------------------------------------------------
-- 7. LEITURA SEGURA DAS QUESTÕES
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_questoes_prova(p_prova_id uuid)
returns table (id uuid, ordem integer, enunciado text, alternativas jsonb, peso numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (
        public.sulsafe_prova_gerenciada(p_prova_id)
        or public.sulsafe_prova_aluno_valida(p_prova_id)
    ) then
        raise exception 'Prova não disponível para este usuário';
    end if;

    return query
    select q.id, q.ordem, q.enunciado, q.alternativas, q.peso
      from public.provas_questoes q
     where q.prova_id = p_prova_id
     order by q.ordem;
end;
$$;

create or replace function public.sulsafe_listar_gabarito_prova(p_prova_id uuid)
returns table (questao_id uuid, ordem integer, gabarito jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem ver o gabarito';
    end if;

    if not public.sulsafe_prova_gerenciada(p_prova_id) then
        raise exception 'Esta prova pertence a outra empresa ou não está disponível';
    end if;

    return query
    select q.id, q.ordem, q.gabarito
      from public.provas_questoes q
     where q.prova_id = p_prova_id
     order by q.ordem;
end;
$$;

revoke all on function public.sulsafe_listar_questoes_prova(uuid) from public, anon;
revoke all on function public.sulsafe_listar_gabarito_prova(uuid) from public, anon;
grant execute on function public.sulsafe_listar_questoes_prova(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_listar_gabarito_prova(uuid) to authenticated, service_role;

comment on function public.sulsafe_listar_gabarito_prova(uuid) is
    'Única via de leitura do gabarito para admin/professor. Nunca concedida a alunos; a correção em servidor usa service_role.';

-- ------------------------------------------------------------
-- 8. MATERIALIZAÇÃO TRANACIONAL DA PROVA
-- ------------------------------------------------------------
-- O JSON já foi validado pelo núcleo Zod da Etapa 1 e gravado em
-- ia_conteudos.conteudo. A RPC relê esse rascunho, valida a estrutura
-- novamente no banco e grava prova + questões em UMA transação: qualquer
-- questão inválida faz a função inteira falhar, sem prova órfã.

create or replace function public.sulsafe_materializar_prova_ia(p_conteudo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conteudo public.ia_conteudos%rowtype;
    v_prova_id uuid;
    v_questoes jsonb;
    v_questao jsonb;
    v_chaves jsonb;
    v_resposta text;
    v_nr_id integer;
    v_ordem integer := 0;
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem materializar provas';
    end if;

    select * into v_conteudo
      from public.ia_conteudos c
     where c.id = p_conteudo_id;

    if not found then
        raise exception 'Rascunho de I.A. não encontrado';
    end if;

    if v_conteudo.tipo is distinct from 'PROVA' then
        raise exception 'O rascunho não é uma prova';
    end if;

    if not public.sulsafe_is_admin()
       and v_conteudo.empresa_id is distinct from public.sulsafe_empresa_id() then
        raise exception 'Este rascunho pertence a outra empresa';
    end if;

    if v_conteudo.conteudo ? 'materializado_id' then
        raise exception 'Este rascunho já foi materializado';
    end if;

    if not v_conteudo.aprovado or v_conteudo.rejeitado then
        raise exception 'Aprove o rascunho antes de materializá-lo';
    end if;

    v_questoes := coalesce(v_conteudo.conteudo -> 'questoes', '[]'::jsonb);

    if jsonb_typeof(v_questoes) <> 'array' or jsonb_array_length(v_questoes) = 0 then
        raise exception 'A prova não contém questões válidas';
    end if;

    if jsonb_array_length(v_questoes) > 50 then
        raise exception 'A prova excede o limite de 50 questões';
    end if;

    v_nr_id := nullif(v_conteudo.conteudo ->> 'nr_id', '')::integer;

    if v_nr_id is not null and v_nr_id not between 1 and 38 then
        raise exception 'Informe uma NR válida (1 a 38)';
    end if;

    insert into public.provas_direcionadas
        (titulo, descricao, nr_id, tipo, publicado, origem, ia_conteudo_id, criado_por, criado_em)
    values
        (
            coalesce(nullif(btrim(coalesce(v_conteudo.titulo, '')), ''), 'Prova gerada por I.A.'),
            nullif(v_conteudo.conteudo ->> 'descricao', ''),
            v_nr_id,
            'prova',
            false,
            'IA_TUTOR',
            p_conteudo_id,
            coalesce(v_conteudo.aprovado_por, auth.uid()),
            now()
        )
    returning id into v_prova_id;

    for v_questao in
        select t.valor from jsonb_array_elements(v_questoes) as t(valor)
    loop
        v_ordem := v_ordem + 1;

        if coalesce(length(btrim(coalesce(v_questao ->> 'enunciado', ''))), 0) = 0 then
            raise exception 'Enunciado inválido na questão %', v_ordem;
        end if;

        if jsonb_typeof(v_questao -> 'alternativas') <> 'array'
           or jsonb_array_length(v_questao -> 'alternativas') not between 2 and 5 then
            raise exception 'Alternativas inválidas na questão %', v_ordem;
        end if;

        v_chaves := coalesce(
            (
                select jsonb_agg(a.item ->> 'chave')
                  from jsonb_array_elements(v_questao -> 'alternativas') as a(item)
            ),
            '[]'::jsonb
        );
        v_resposta := upper(coalesce(v_questao ->> 'resposta_correta', ''));

        if not (v_chaves ? v_resposta) then
            raise exception 'Gabarito inválido na questão %', v_ordem;
        end if;

        insert into public.provas_questoes
            (prova_id, ordem, enunciado, alternativas, gabarito, peso)
        values
            (
                v_prova_id,
                v_ordem,
                v_questao ->> 'enunciado',
                v_questao -> 'alternativas',
                jsonb_build_object(
                    'resposta_correta', v_resposta,
                    'justificativa', v_questao -> 'justificativa'
                ),
                coalesce((v_questao ->> 'peso')::numeric, 1)
            );
    end loop;

    update public.ia_conteudos c
       set conteudo = c.conteudo || jsonb_build_object(
               'materializado_tipo', 'PROVA',
               'materializado_id', v_prova_id,
               'materializado_em', now(),
               'materializado_por', auth.uid()
           )
     where c.id = p_conteudo_id;

    return jsonb_build_object(
        'conteudo_id', p_conteudo_id,
        'prova_id', v_prova_id,
        'questoes', v_ordem,
        'publicado', false,
        'materializado_em', now()
    );
end;
$$;

revoke all on function public.sulsafe_materializar_prova_ia(uuid) from public, anon;
grant execute on function public.sulsafe_materializar_prova_ia(uuid) to authenticated, service_role;

comment on function public.sulsafe_materializar_prova_ia(uuid) is
    'Cria prova (publicado=false) e todas as questões em uma transação. Uma questão inválida desfaz a prova inteira.';

-- Fim da Etapa 2/8. Distribuição, notificação e Edge Function vêm nas etapas seguintes.
