-- ============================================================
-- FASE 5 (ETAPA 1/8) — FUNDAÇÃO DO BANCO E DOS TIPOS DE I.A.
-- ============================================================
-- Escopo desta migration:
--   1. HITL em provas_direcionadas: publicado passa a nascer false.
--      Só são corrigidas linhas com origem = 'IA_TUTOR'; provas manuais
--      continua com o comportamento atual (publicadas pelo professor).
--   2. Checks de ia_jobs / ia_conteudos ampliados para PROVA e MODULO.
--   3. Tabela modulos_direcionados, com RLS por empresa e HITL por trigger.
--
-- Nenhuma chave de API participa destas funções. Esta migration NÃO altera
-- videoaulas, materiais, nem o fluxo do Tutor já homologado.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROVAS DIRECIONADAS — HITL E RASTREABILIDADE DA I.A.
-- ------------------------------------------------------------

alter table public.provas_direcionadas
    add column if not exists origem text not null default 'MANUAL'
        check (origem in ('MANUAL', 'IA_TUTOR')),
    add column if not exists ia_conteudo_id uuid
        references public.ia_conteudos (id) on delete set null,
    add column if not exists distribuido_por uuid
        references public.profiles (id) on delete set null,
    add column if not exists distribuido_em timestamptz;

alter table public.provas_direcionadas
    alter column publicado set default false;

comment on column public.provas_direcionadas.publicado is
    'Padrão false para garantir HITL. Provas manuais continuam podendo ser publicadas explicitamente pelo professor.';

-- Correção cirúrgica: nunca mexe nas provas criadas pelo fluxo manual atual.
update public.provas_direcionadas
   set publicado = false
 where origem = 'IA_TUTOR'
   and publicado is true;

create index if not exists provas_direcionadas_ia_conteudo_idx
    on public.provas_direcionadas (ia_conteudo_id)
    where ia_conteudo_id is not null;

-- ------------------------------------------------------------
-- 2. TIPOS ACEITOS PELA FILA DE I.A.
-- ------------------------------------------------------------

alter table public.ia_jobs
    drop constraint if exists ia_jobs_tipo_check;

alter table public.ia_jobs
    add constraint ia_jobs_tipo_check
    check (tipo in ('MATERIA', 'CURSO', 'PALESTRA', 'AVALIACAO', 'MATERIAL', 'PROVA', 'MODULO'));

alter table public.ia_conteudos
    drop constraint if exists ia_conteudos_tipo_check;

alter table public.ia_conteudos
    add constraint ia_conteudos_tipo_check
    check (tipo in ('MATERIA', 'CURSO', 'MODULO', 'AULA', 'QUESTAO', 'PALESTRA', 'MATERIAL', 'PROVA'));

-- ------------------------------------------------------------
-- 3. MÓDULOS DIRECIONADOS (NOVO)
-- ------------------------------------------------------------
--empresa_id não é coluna nova: o isolamento vem de ia_conteudos.empresa_id
--via ia_conteudo_id, conforme DEC-002 / D-TUTOR-01.

create table if not exists public.modulos_direcionados (
    id uuid primary key default gen_random_uuid(),
    ia_conteudo_id uuid not null unique
        references public.ia_conteudos (id) on delete restrict,
    titulo text not null check (length(btrim(titulo)) between 1 and 200),
    descricao text,
    nr_id integer check (nr_id between 1 and 38),
    origem text not null default 'IA_TUTOR'
        check (origem in ('IA_TUTOR', 'MANUAL')),
    destino text not null default 'INTERNO'
        check (destino in ('TURMA', 'ALUNO', 'CATALOGO', 'INTERNO')),
    turma_id uuid references public.turmas (id) on delete cascade,
    aluno_id uuid references public.profiles (id) on delete cascade,
    publico boolean not null default false,
    conteudo jsonb not null default '{}'::jsonb,
    criado_por uuid not null references public.profiles (id) on delete restrict,
    distribuido_por uuid references public.profiles (id) on delete set null,
    distribuido_em timestamptz,
    criado_em timestamptz not null default now(),
    -- O nome terminado em _destino_check já é usado automaticamente pelo CHECK
    -- da coluna destino; este constraint valida a coerência do alvo.
    constraint modulos_direcionados_alvo_check check (
        case destino
            when 'TURMA' then turma_id is not null and aluno_id is null
            when 'ALUNO' then aluno_id is not null and turma_id is null
            else turma_id is null and aluno_id is null
        end
    )
);

create index if not exists modulos_direcionados_turma_idx
    on public.modulos_direcionados (turma_id)
    where turma_id is not null;

create index if not exists modulos_direcionados_aluno_idx
    on public.modulos_direcionados (aluno_id)
    where aluno_id is not null;

create index if not exists modulos_direcionados_criado_por_idx
    on public.modulos_direcionados (criado_por);

comment on table public.modulos_direcionados is
    'Módulos gerados pelo Agente Direcionado. publico=false até decisão humana; empresa herdada de ia_conteudos.';

-- HITL no nível da tabela: publico=true exige rascunho aprovado e não rejeitado.
create or replace function public.sulsafe_modulos_hitl()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.publico and not exists (
        select 1
          from public.ia_conteudos c
         where c.id = new.ia_conteudo_id
           and c.aprovado
           and not c.rejeitado
    ) then
        raise exception 'Aprove o rascunho antes de tornar o módulo público';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_modulos_direcionados_hitl on public.modulos_direcionados;
create trigger trg_modulos_direcionados_hitl
    before insert or update of publico, ia_conteudo_id
    on public.modulos_direcionados
    for each row execute function public.sulsafe_modulos_hitl();

revoke all on function public.sulsafe_modulos_hitl() from public, anon;
grant execute on function public.sulsafe_modulos_hitl() to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. RLS — EMPRESA, RBAC E VISIBILIDADE DO ALUNO
-- ------------------------------------------------------------

alter table public.modulos_direcionados enable row level security;

revoke all on public.modulos_direcionados from anon, authenticated;
grant select, insert, update, delete on public.modulos_direcionados to authenticated;
grant all on public.modulos_direcionados to service_role;

drop policy if exists "sulsafe_modulos_direcionados_select" on public.modulos_direcionados;
create policy "sulsafe_modulos_direcionados_select"
on public.modulos_direcionados
for select to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        public.sulsafe_is_admin()
        or (
            public.sulsafe_is_professor()
            and (turma_id is null or public.sulsafe_gerencia_turma(turma_id))
            and exists (
                select 1 from public.ia_conteudos c
                 where c.id = ia_conteudo_id
                   and c.empresa_id is not distinct from public.sulsafe_empresa_id()
            )
        )
        or (
            publico
            and exists (
                select 1 from public.ia_conteudos c
                 where c.id = ia_conteudo_id
                   and c.empresa_id is not distinct from public.sulsafe_empresa_id()
            )
            and (
                (destino = 'ALUNO' and aluno_id = auth.uid())
                or (
                    destino = 'TURMA'
                    and exists (
                        select 1 from public.turma_alunos ta
                         where ta.turma_id = modulos_direcionados.turma_id
                           and ta.aluno_id = auth.uid()
                    )
                )
                or destino = 'CATALOGO'
            )
        )
    )
);

drop policy if exists "sulsafe_modulos_direcionados_insert" on public.modulos_direcionados;
create policy "sulsafe_modulos_direcionados_insert"
on public.modulos_direcionados
for insert to authenticated
with check (
    public.sulsafe_conta_ativa()
    and (public.sulsafe_is_admin() or public.sulsafe_is_professor())
    and criado_por = auth.uid()
    and not publico
    and exists (
        select 1 from public.ia_conteudos c
         where c.id = ia_conteudo_id
           and c.aprovado
           and not c.rejeitado
           and (public.sulsafe_is_admin()
                or c.empresa_id is not distinct from public.sulsafe_empresa_id())
    )
);

drop policy if exists "sulsafe_modulos_direcionados_update" on public.modulos_direcionados;
create policy "sulsafe_modulos_direcionados_update"
on public.modulos_direcionados
for update to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        public.sulsafe_is_admin()
        or (
            public.sulsafe_is_professor()
            and (turma_id is null or public.sulsafe_gerencia_turma(turma_id))
            and exists (
                select 1 from public.ia_conteudos c
                 where c.id = ia_conteudo_id
                   and c.empresa_id is not distinct from public.sulsafe_empresa_id()
            )
        )
    )
)
with check (
    public.sulsafe_conta_ativa()
    and (public.sulsafe_is_admin() or public.sulsafe_is_professor())
    and exists (
        select 1 from public.ia_conteudos c
         where c.id = ia_conteudo_id
           and c.aprovado
           and not c.rejeitado
           and (public.sulsafe_is_admin()
                or c.empresa_id is not distinct from public.sulsafe_empresa_id())
    )
);

drop policy if exists "sulsafe_modulos_direcionados_delete" on public.modulos_direcionados;
create policy "sulsafe_modulos_direcionados_delete"
on public.modulos_direcionados
for delete to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        public.sulsafe_is_admin()
        or (
            public.sulsafe_is_professor()
            and criado_por = auth.uid()
            and not publico
            and exists (
                select 1 from public.ia_conteudos c
                 where c.id = ia_conteudo_id
                   and c.empresa_id is not distinct from public.sulsafe_empresa_id()
            )
        )
    )
);

-- Fim da Etapa 1/8. As RPCs de distribuição e o dispatcher vêm nas etapas seguintes.
