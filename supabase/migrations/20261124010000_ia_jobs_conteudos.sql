-- ============================================================
-- PROFESSOR I.A — FASE 1: CONTRATO DE DADOS (JOBS E CONTEÚDOS)
-- ============================================================
-- Decisões aplicadas:
--   * DEC-002 (Opção C): empresa_id em ia_jobs/ia_conteudos; o catálogo das
--     38 NRs permanece global. A empresa do usuário vem do claim
--     app_metadata.empresa_id do JWT — nenhuma coluna nova em profiles.
--   * ROADMAP_SULSAFE Fase 1: tabela de jobs com status e tabela de conteúdos
--     gerados com aprovado/publicado. Nada é publicado sem revisão humana.
--   * A MR é referência de desenho (job → ementa → entidades), mas NÃO é
--     copiada a infra: sem Docker, Next.js, Redis, OpenMAIC local ou fila externa.
--
-- Segurança: RLS + REVOKE explícito; RPCs SECURITY DEFINER com search_path '';
-- chaves de API continuam apenas no Vault (migration 20261027000000).

-- ------------------------------------------------------------
-- 1. IDENTIDADE DA EMPRESA (DEC-002 / OPÇÃO C)
-- ------------------------------------------------------------

create or replace function public.sulsafe_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid;
$$;

comment on function public.sulsafe_empresa_id() is
    'Empresa do usuário a partir do claim app_metadata.empresa_id do JWT (DEC-002, Opção C). NULL significa conta sem empresa vinculada.';

revoke all on function public.sulsafe_empresa_id() from public, anon;
grant execute on function public.sulsafe_empresa_id() to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. TABELAS
-- ------------------------------------------------------------

create table if not exists public.ia_jobs (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid,
    criado_por uuid not null references public.profiles (id) on delete restrict,
    tipo text not null check (tipo in ('MATERIA', 'CURSO', 'PALESTRA', 'AVALIACAO', 'MATERIAL')),
    titulo text not null check (length(btrim(titulo)) between 1 and 160),
    prompt text not null check (length(btrim(prompt)) between 1 and 8000),
    provedor text check (provedor in ('sulsafe_api', 'openai', 'gemini', 'anthropic', 'custom')),
    status text not null default 'PENDENTE'
        check (status in ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO', 'CANCELADO')),
    tentativas integer not null default 0 check (tentativas >= 0),
    erro_mensagem text,
    resultado jsonb,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    iniciado_em timestamptz,
    concluido_em timestamptz
);

comment on table public.ia_jobs is
    'Fila de geração do Professor I.A. Empresa isolada por RLS; status PENDENTE → PROCESSANDO → CONCLUIDO/ERRO.';

create table if not exists public.ia_conteudos (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.ia_jobs (id) on delete restrict,
    empresa_id uuid,
    criado_por uuid not null references public.profiles (id) on delete restrict,
    tipo text not null check (tipo in ('MATERIA', 'CURSO', 'MODULO', 'AULA', 'QUESTAO', 'PALESTRA', 'MATERIAL')),
    titulo text not null check (length(btrim(titulo)) between 1 and 200),
    conteudo jsonb not null default '{}'::jsonb,
    aprovado boolean not null default false,
    aprovado_por uuid references public.profiles (id) on delete set null,
    aprovado_em timestamptz,
    rejeitado boolean not null default false,
    rejeitado_por uuid references public.profiles (id) on delete set null,
    rejeitado_em timestamptz,
    observacao text,
    publicado boolean not null default false,
    publicado_por uuid references public.profiles (id) on delete set null,
    publicado_em timestamptz,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint ia_conteudos_aprovado_publicado check (not publicado or aprovado),
    constraint ia_conteudos_aprovado_rejeitado check (not (aprovado and rejeitado))
);

comment on table public.ia_conteudos is
    'Rascunhos gerados pelo Professor I.A. Human-in-the-Loop: publicado exige aprovado = true; aluno só lê publicado.';

-- ------------------------------------------------------------
-- 3. TRIGGERS DE INTEGRIDADE
-- ------------------------------------------------------------

create or replace function public.sulsafe_ia_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;

drop trigger if exists trg_ia_jobs_touch on public.ia_jobs;
create trigger trg_ia_jobs_touch
before update on public.ia_jobs
for each row execute function public.sulsafe_ia_touch();

drop trigger if exists trg_ia_conteudos_touch on public.ia_conteudos;
create trigger trg_ia_conteudos_touch
before update on public.ia_conteudos
for each row execute function public.sulsafe_ia_touch();

-- A empresa do conteúdo é sempre a do job: o worker não escolhe tenant.
create or replace function public.sulsafe_ia_conteudo_herda_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    select j.empresa_id into new.empresa_id
    from public.ia_jobs j
    where j.id = new.job_id;

    if not found then
        raise exception 'Job de I.A. não encontrado';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_ia_conteudos_empresa on public.ia_conteudos;
create trigger trg_ia_conteudos_empresa
before insert or update of job_id on public.ia_conteudos
for each row execute function public.sulsafe_ia_conteudo_herda_empresa();

-- ------------------------------------------------------------
-- 4. RLS E GRANTS
-- ------------------------------------------------------------

alter table public.ia_jobs enable row level security;
alter table public.ia_conteudos enable row level security;

revoke all on public.ia_jobs from anon, authenticated;
revoke all on public.ia_conteudos from anon, authenticated;

grant select on public.ia_jobs to authenticated;
grant select on public.ia_conteudos to authenticated;
grant all on public.ia_jobs to service_role;
grant all on public.ia_conteudos to service_role;

create policy sulsafe_ia_jobs_select on public.ia_jobs
    for select to authenticated
    using (
        public.sulsafe_is_admin()
        or empresa_id is not distinct from public.sulsafe_empresa_id()
    );

-- Administradores e professores revisam rascunhos da própria empresa;
-- alunos e demais perfis só veem o que já foi publicado.
create policy sulsafe_ia_conteudos_select on public.ia_conteudos
    for select to authenticated
    using (
        public.sulsafe_is_admin()
        or (
            empresa_id is not distinct from public.sulsafe_empresa_id()
            and (
                (public.sulsafe_is_admin() or public.sulsafe_is_professor())
                or publicado
            )
        )
    );

-- ------------------------------------------------------------
-- 5. RPC DE CRIAÇÃO DO JOB (ADMIN/PROFESSOR)
-- ------------------------------------------------------------

create or replace function public.sulsafe_criar_ia_job(
    p_titulo text,
    p_prompt text,
    p_tipo text default 'CURSO',
    p_empresa_id uuid default null,
    p_provedor text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
    v_id uuid;
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem gerar conteúdo com I.A';
    end if;

    if p_tipo is null or p_tipo not in ('MATERIA', 'CURSO', 'PALESTRA', 'AVALIACAO', 'MATERIAL') then
        raise exception 'Tipo de geração inválido';
    end if;

    if p_titulo is null or length(btrim(p_titulo)) not between 1 and 160 then
        raise exception 'Informe um título de 1 a 160 caracteres';
    end if;

    if p_prompt is null or length(btrim(p_prompt)) not between 1 and 8000 then
        raise exception 'Informe um pedido de 1 a 8000 caracteres';
    end if;

    if p_provedor is not null and p_provedor not in
        ('sulsafe_api', 'openai', 'gemini', 'anthropic', 'custom') then
        raise exception 'Provedor inválido';
    end if;

    v_empresa := public.sulsafe_empresa_id();

    if public.sulsafe_is_admin() then
        v_empresa := coalesce(p_empresa_id, v_empresa);
    elsif p_empresa_id is not null and p_empresa_id is distinct from v_empresa then
        raise exception 'Você não pode gerar conteúdo para outra empresa';
    end if;

    insert into public.ia_jobs (empresa_id, criado_por, tipo, titulo, prompt, provedor)
    values (v_empresa, auth.uid(), p_tipo, btrim(p_titulo), btrim(p_prompt), p_provedor)
    returning id into v_id;

    return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. RPCs DO WORKER (SERVICE_ROLE)
-- ------------------------------------------------------------

create or replace function public.sulsafe_atualizar_status_ia_job(
    p_job_id uuid,
    p_status text,
    p_erro_mensagem text default null,
    p_resultado jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_status is null or p_status not in
        ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO', 'CANCELADO') then
        raise exception 'Status de job inválido';
    end if;

    update public.ia_jobs j
       set status = p_status,
           tentativas = case when p_status = 'PROCESSANDO' then j.tentativas + 1 else j.tentativas end,
           erro_mensagem = case when p_status = 'ERRO' then nullif(btrim(coalesce(p_erro_mensagem, '')), '') else null end,
           resultado = coalesce(p_resultado, j.resultado),
           iniciado_em = coalesce(case when p_status = 'PROCESSANDO' then now() end, j.iniciado_em),
           concluido_em = coalesce(case when p_status in ('CONCLUIDO', 'ERRO', 'CANCELADO') then now() end, j.concluido_em),
           atualizado_em = now()
     where j.id = p_job_id;

    if not found then
        raise exception 'Job de I.A. não encontrado';
    end if;
end;
$$;

create or replace function public.sulsafe_salvar_ia_conteudo(
    p_job_id uuid,
    p_tipo text,
    p_titulo text,
    p_conteudo jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_job public.ia_jobs%rowtype;
    v_id uuid;
begin
    if p_tipo is null or p_tipo not in ('MATERIA', 'CURSO', 'MODULO', 'AULA', 'QUESTAO', 'PALESTRA', 'MATERIAL') then
        raise exception 'Tipo de conteúdo inválido';
    end if;

    if p_titulo is null or length(btrim(p_titulo)) not between 1 and 200 then
        raise exception 'Informe um título de 1 a 200 caracteres';
    end if;

    if p_conteudo is null or jsonb_typeof(p_conteudo) <> 'object' then
        raise exception 'O conteúdo gerado deve ser um objeto JSON';
    end if;

    select * into v_job from public.ia_jobs j where j.id = p_job_id;
    if not found then
        raise exception 'Job de I.A. não encontrado';
    end if;

    if v_job.status not in ('PROCESSANDO', 'CONCLUIDO') then
        raise exception 'O job não está em etapa de geração';
    end if;

    insert into public.ia_conteudos (job_id, criado_por, tipo, titulo, conteudo)
    values (p_job_id, v_job.criado_por, p_tipo, btrim(p_titulo), p_conteudo)
    returning id into v_id;

    return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 7. RPCs DE REVISÃO HUMANA (HUMAN-IN-THE-LOOP)
-- ------------------------------------------------------------

create or replace function public.sulsafe_revisar_ia_conteudo(
    p_id uuid,
    p_decisao text,
    p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conteudo public.ia_conteudos%rowtype;
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem revisar conteúdo de I.A';
    end if;

    if p_decisao not in ('APROVAR', 'REJEITAR', 'PUBLICAR') then
        raise exception 'Decisão de revisão inválida';
    end if;

    select * into v_conteudo from public.ia_conteudos c where c.id = p_id;
    if not found then
        raise exception 'Conteúdo de I.A. não encontrado';
    end if;

    if not public.sulsafe_is_admin()
       and v_conteudo.empresa_id is distinct from public.sulsafe_empresa_id() then
        raise exception 'Este conteúdo pertence a outra empresa';
    end if;

    if p_decisao = 'APROVAR' then
        update public.ia_conteudos c
           set aprovado = true, rejeitado = false,
               aprovado_por = auth.uid(), aprovado_em = now(),
               observacao = nullif(btrim(coalesce(p_observacao, '')), '')
         where c.id = p_id;
    elsif p_decisao = 'REJEITAR' then
        if p_observacao is null or length(btrim(p_observacao)) < 3 then
            raise exception 'Informe o motivo da rejeição';
        end if;

        update public.ia_conteudos c
           set aprovado = false, rejeitado = true, publicado = false,
               rejeitado_por = auth.uid(), rejeitado_em = now(),
               publicado_por = null, publicado_em = null,
               observacao = btrim(p_observacao)
         where c.id = p_id;
    else
        if not v_conteudo.aprovado or v_conteudo.rejeitado then
            raise exception 'Somente conteúdo aprovado pode ser publicado';
        end if;

        update public.ia_conteudos c
           set publicado = true, publicado_por = auth.uid(), publicado_em = now(),
               observacao = coalesce(nullif(btrim(coalesce(p_observacao, '')), ''), c.observacao)
         where c.id = p_id;
    end if;
end;
$$;

-- ------------------------------------------------------------
-- 8. PERMISSÕES DAS RPCs
-- ------------------------------------------------------------

revoke all on function public.sulsafe_criar_ia_job(text, text, text, uuid, text) from public, anon;
revoke all on function public.sulsafe_atualizar_status_ia_job(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sulsafe_salvar_ia_conteudo(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sulsafe_revisar_ia_conteudo(uuid, text, text) from public, anon;

grant execute on function public.sulsafe_criar_ia_job(text, text, text, uuid, text) to authenticated;
grant execute on function public.sulsafe_atualizar_status_ia_job(uuid, text, text, jsonb) to service_role;
grant execute on function public.sulsafe_salvar_ia_conteudo(uuid, text, text, jsonb) to service_role;
grant execute on function public.sulsafe_revisar_ia_conteudo(uuid, text, text) to authenticated;
