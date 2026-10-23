-- ============================================================
-- DIRECIONAMENTO DE CONTEÚDO E TURMAS
-- ============================================================
-- Mantém o conteúdo global existente e adiciona turmas/trilhas,
-- vínculo N:N de alunos e conteúdos, além de provas direcionadas.
-- Migration idempotente. Não remove dados existentes.
-- ============================================================

begin;

-- ============================================================
-- 1. CONTEÚDO GLOBAL X DIRECIONADO
-- ============================================================

alter table public.materiais
    add column if not exists publico boolean not null default true;

alter table public.videoaulas
    add column if not exists publico boolean not null default true;

-- ============================================================
-- 2. TURMAS / TRILHAS
-- ============================================================

create table if not exists public.turmas (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    descricao text,
    tipo text not null default 'turma'
        check (tipo in ('turma', 'individual', 'atualizacao')),
    criado_por uuid not null references public.profiles(id) on delete cascade,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create index if not exists turmas_criado_por_idx
    on public.turmas (criado_por);

create index if not exists turmas_tipo_idx
    on public.turmas (tipo);

-- ============================================================
-- 3. ALUNOS DA TURMA (N:N)
-- ============================================================

create table if not exists public.turma_alunos (
    turma_id uuid not null references public.turmas(id) on delete cascade,
    aluno_id uuid not null references public.profiles(id) on delete cascade,
    data_entrada timestamptz not null default now(),
    primary key (turma_id, aluno_id)
);

create index if not exists turma_alunos_aluno_idx
    on public.turma_alunos (aluno_id);

-- ============================================================
-- 4. CONTEÚDOS DA TURMA (N:N, vídeos e materiais)
-- ============================================================

create table if not exists public.turma_materiais (
    id uuid primary key default gen_random_uuid(),
    turma_id uuid not null references public.turmas(id) on delete cascade,
    material_id uuid references public.materiais(id) on delete cascade,
    videoaula_id uuid references public.videoaulas(id) on delete cascade,
    professor_id uuid not null references public.profiles(id) on delete cascade,
    data_vinculo timestamptz not null default now(),
    constraint turma_materiais_um_conteudo_check
        check (num_nonnulls(material_id, videoaula_id) = 1)
);

create unique index if not exists turma_materiais_material_uidx
    on public.turma_materiais (turma_id, material_id)
    where material_id is not null;

create unique index if not exists turma_materiais_videoaula_uidx
    on public.turma_materiais (turma_id, videoaula_id)
    where videoaula_id is not null;

create index if not exists turma_materiais_turma_idx
    on public.turma_materiais (turma_id);

create index if not exists turma_materiais_material_idx
    on public.turma_materiais (material_id)
    where material_id is not null;

create index if not exists turma_materiais_videoaula_idx
    on public.turma_materiais (videoaula_id)
    where videoaula_id is not null;

-- ============================================================
-- 5. PROVAS / TESTES DIRECIONADOS
-- ============================================================
-- A tabela public.provas continua sendo o envio/resposta do aluno.
-- Esta tabela representa a prova/teste criado pelo professor.

create table if not exists public.provas_direcionadas (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    descricao text,
    nr_id integer,
    tipo text not null default 'prova'
        check (tipo in ('prova', 'teste')),
    turma_id uuid references public.turmas(id) on delete cascade,
    aluno_id uuid references public.profiles(id) on delete cascade,
    arquivo_url text,
    prazo timestamptz,
    publicado boolean not null default true,
    criado_por uuid not null references public.profiles(id) on delete cascade,
    criado_em timestamptz not null default now(),
    constraint provas_direcionadas_um_destino_check
        check (num_nonnulls(turma_id, aluno_id) = 1)
);

create index if not exists provas_direcionadas_turma_idx
    on public.provas_direcionadas (turma_id)
    where turma_id is not null;

create index if not exists provas_direcionadas_aluno_idx
    on public.provas_direcionadas (aluno_id)
    where aluno_id is not null;

create index if not exists provas_direcionadas_criado_por_idx
    on public.provas_direcionadas (criado_por);

-- ============================================================
-- 6. HELPERS DE AUTORIZAÇÃO
-- ============================================================

create or replace function public.sulsafe_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text in ('admin', 'super_admin')
    );
$$;

create or replace function public.sulsafe_is_professor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text in ('professor', 'admin', 'super_admin')
    );
$$;

create or replace function public.sulsafe_gerencia_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.turmas t
        where t.id = p_turma_id
          and (
              t.criado_por = auth.uid()
              or public.sulsafe_is_admin()
          )
    );
$$;

revoke all on function public.sulsafe_is_admin() from public;
revoke all on function public.sulsafe_is_professor() from public;
revoke all on function public.sulsafe_gerencia_turma(uuid) from public;

grant execute on function public.sulsafe_is_admin() to authenticated, service_role;
grant execute on function public.sulsafe_is_professor() to authenticated, service_role;
grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, service_role;

-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.turmas enable row level security;
alter table public.turma_alunos enable row level security;
alter table public.turma_materiais enable row level security;
alter table public.provas_direcionadas enable row level security;

-- ------------------------------------------------------------
-- turmas
-- ------------------------------------------------------------

drop policy if exists "sulsafe_turmas_select" on public.turmas;
create policy "sulsafe_turmas_select"
on public.turmas
for select
to authenticated
using (
    criado_por = auth.uid()
    or public.sulsafe_is_admin()
    or exists (
        select 1
        from public.turma_alunos ta
        where ta.turma_id = turmas.id
          and ta.aluno_id = auth.uid()
    )
);

drop policy if exists "sulsafe_turmas_insert" on public.turmas;
create policy "sulsafe_turmas_insert"
on public.turmas
for insert
to authenticated
with check (
    public.sulsafe_is_professor()
    and criado_por = auth.uid()
);

drop policy if exists "sulsafe_turmas_update" on public.turmas;
create policy "sulsafe_turmas_update"
on public.turmas
for update
to authenticated
using (public.sulsafe_gerencia_turma(id))
with check (
    public.sulsafe_is_admin()
    or criado_por = auth.uid()
);

drop policy if exists "sulsafe_turmas_delete" on public.turmas;
create policy "sulsafe_turmas_delete"
on public.turmas
for delete
to authenticated
using (public.sulsafe_gerencia_turma(id));

-- ------------------------------------------------------------
-- turma_alunos
-- ------------------------------------------------------------

drop policy if exists "sulsafe_turma_alunos_select" on public.turma_alunos;
create policy "sulsafe_turma_alunos_select"
on public.turma_alunos
for select
to authenticated
using (
    aluno_id = auth.uid()
    or public.sulsafe_is_admin()
    or public.sulsafe_gerencia_turma(turma_id)
);

drop policy if exists "sulsafe_turma_alunos_insert" on public.turma_alunos;
create policy "sulsafe_turma_alunos_insert"
on public.turma_alunos
for insert
to authenticated
with check (public.sulsafe_gerencia_turma(turma_id));

drop policy if exists "sulsafe_turma_alunos_delete" on public.turma_alunos;
create policy "sulsafe_turma_alunos_delete"
on public.turma_alunos
for delete
to authenticated
using (public.sulsafe_gerencia_turma(turma_id));

-- ------------------------------------------------------------
-- turma_materiais
-- ------------------------------------------------------------

drop policy if exists "sulsafe_turma_materiais_select" on public.turma_materiais;
create policy "sulsafe_turma_materiais_select"
on public.turma_materiais
for select
to authenticated
using (
    public.sulsafe_is_admin()
    or public.sulsafe_gerencia_turma(turma_id)
    or exists (
        select 1
        from public.turma_alunos ta
        where ta.turma_id = turma_materiais.turma_id
          and ta.aluno_id = auth.uid()
    )
);

drop policy if exists "sulsafe_turma_materiais_insert" on public.turma_materiais;
create policy "sulsafe_turma_materiais_insert"
on public.turma_materiais
for insert
to authenticated
with check (
    public.sulsafe_gerencia_turma(turma_id)
    and professor_id = auth.uid()
);

drop policy if exists "sulsafe_turma_materiais_delete" on public.turma_materiais;
create policy "sulsafe_turma_materiais_delete"
on public.turma_materiais
for delete
to authenticated
using (public.sulsafe_gerencia_turma(turma_id));

-- ------------------------------------------------------------
-- provas_direcionadas
-- ------------------------------------------------------------

drop policy if exists "sulsafe_provas_direcionadas_select" on public.provas_direcionadas;
create policy "sulsafe_provas_direcionadas_select"
on public.provas_direcionadas
for select
to authenticated
using (
    public.sulsafe_is_admin()
    or criado_por = auth.uid()
    or public.sulsafe_gerencia_turma(turma_id)
    or (
        publicado = true
        and (
            aluno_id = auth.uid()
            or exists (
                select 1
                from public.turma_alunos ta
                where ta.turma_id = provas_direcionadas.turma_id
                  and ta.aluno_id = auth.uid()
            )
        )
    )
);

drop policy if exists "sulsafe_provas_direcionadas_insert" on public.provas_direcionadas;
create policy "sulsafe_provas_direcionadas_insert"
on public.provas_direcionadas
for insert
to authenticated
with check (
    public.sulsafe_is_professor()
    and criado_por = auth.uid()
    and (
        aluno_id is not null
        or public.sulsafe_gerencia_turma(turma_id)
    )
);

drop policy if exists "sulsafe_provas_direcionadas_update" on public.provas_direcionadas;
create policy "sulsafe_provas_direcionadas_update"
on public.provas_direcionadas
for update
to authenticated
using (
    public.sulsafe_is_admin()
    or criado_por = auth.uid()
)
with check (
    public.sulsafe_is_admin()
    or criado_por = auth.uid()
);

drop policy if exists "sulsafe_provas_direcionadas_delete" on public.provas_direcionadas;
create policy "sulsafe_provas_direcionadas_delete"
on public.provas_direcionadas
for delete
to authenticated
using (
    public.sulsafe_is_admin()
    or criado_por = auth.uid()
);

-- ------------------------------------------------------------
-- Conteúdo: global continua público; direcionado exige vínculo
-- ------------------------------------------------------------
-- Políticas restritivas garantem que, mesmo que exista uma policy
-- permissiva antiga de SELECT, um aluno não acesse conteúdo de
-- outra turma apenas alterando o ID na API.

drop policy if exists "sulsafe_materiais_direcionamento" on public.materiais;
create policy "sulsafe_materiais_direcionamento"
on public.materiais
as restrictive
for select
to anon, authenticated
using (
    publico = true
    or public.sulsafe_is_professor()
    or exists (
        select 1
        from public.turma_materiais tm
        join public.turma_alunos ta
          on ta.turma_id = tm.turma_id
        where tm.material_id = materiais.id
          and ta.aluno_id = auth.uid()
    )
);

drop policy if exists "sulsafe_videoaulas_direcionamento" on public.videoaulas;
create policy "sulsafe_videoaulas_direcionamento"
on public.videoaulas
as restrictive
for select
to anon, authenticated
using (
    publico = true
    or public.sulsafe_is_professor()
    or exists (
        select 1
        from public.turma_materiais tm
        join public.turma_alunos ta
          on ta.turma_id = tm.turma_id
        where tm.videoaula_id = videoaulas.id
          and ta.aluno_id = auth.uid()
    )
);

-- ============================================================
-- 8. PERMISSÕES
-- ============================================================

grant select, insert, update, delete on public.turmas to authenticated;
grant select, insert, delete on public.turma_alunos to authenticated;
grant select, insert, delete on public.turma_materiais to authenticated;
grant select, insert, update, delete on public.provas_direcionadas to authenticated;

grant all on public.turmas to service_role;
grant all on public.turma_alunos to service_role;
grant all on public.turma_materiais to service_role;
grant all on public.provas_direcionadas to service_role;

notify pgrst, 'reload schema';

commit;
