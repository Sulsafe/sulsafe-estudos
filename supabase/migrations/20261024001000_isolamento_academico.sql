-- ============================================================
-- ISOLAMENTO ACADEMICO E RPCs SEGUROS
-- ============================================================
-- Substitui as policies amplas "Leitura para autenticados" por
-- acesso baseado no proprietario/conteudo, revoga anon das tabelas
-- academicas e expoe leituras com joins por RPCs seguros.
--
-- Pre-requisitos:
-- - 20261022000000_direcionamento_conteudo.sql
-- - 20261023000000_certificados_cpf_revogado.sql
-- - 20261023100000_dossie_sistec.sql
-- - 20261024000000_seguranca_profiles.sql
--
-- Esta migration NAO deve ser aplicada automaticamente em producao.
-- ============================================================

begin;

-- ============================================================
-- 1. HELPERS
-- ============================================================

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
          and p.status = 'ativo'
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
    select public.sulsafe_conta_ativa()
       and exists (
           select 1
           from public.turmas t
           where t.id = p_turma_id
             and (
                 t.criado_por = auth.uid()
                 or public.sulsafe_is_admin()
             )
       );
$$;

create or replace function public.sulsafe_perfil_aluno(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = p_id
          and p.role::text = 'aluno'
    );
$$;

revoke all on function public.sulsafe_is_professor() from public;
revoke all on function public.sulsafe_gerencia_turma(uuid) from public;
revoke all on function public.sulsafe_perfil_aluno(uuid) from public;

grant execute on function public.sulsafe_is_professor() to authenticated, service_role;
grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_perfil_aluno(uuid) to authenticated, service_role;

-- ============================================================
-- 2. RPCs DE LEITURA SEGURA
-- ============================================================

create or replace function public.sulsafe_listar_alunos()
returns table (
    id uuid,
    nome_completo text,
    email text,
    status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_is_professor() then
        raise exception 'Acesso restrito a professores e administradores.'
            using errcode = '42501';
    end if;

    return query
        select p.id, p.nome_completo, p.email, p.status
        from public.profiles p
        where p.role::text = 'aluno'
        order by p.nome_completo;
end;
$$;

create or replace function public.sulsafe_obter_perfil_publico(p_id uuid)
returns table (
    id uuid,
    nome_completo text,
    email text,
    cpf text,
    foto_url text,
    role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_role text;
    v_professor boolean;
begin
    if v_uid is null then
        raise exception 'Sessao invalida.' using errcode = '42501';
    end if;

    select p.role::text
    into v_role
    from public.profiles p
    where p.id = p_id;

    if v_role is null then
        raise exception 'Perfil nao encontrado.' using errcode = 'P0002';
    end if;

    v_professor := public.sulsafe_is_professor();

    if v_uid <> p_id and not v_professor then
        raise exception 'Acesso restrito ao proprio perfil.'
            using errcode = '42501';
    end if;

    return query
        select
            p.id,
            p.nome_completo,
            case
                when v_uid = p_id or (v_professor and v_role = 'aluno') then p.email
                else null
            end,
            case
                when v_uid = p_id or (v_professor and v_role = 'aluno')
                    then to_jsonb(p)->>'cpf'
                else null
            end,
            to_jsonb(p)->>'foto_url',
            v_role
        from public.profiles p
        where p.id = p_id;
end;
$$;

create or replace function public.sulsafe_listar_provas_pendentes()
returns table (
    id uuid,
    usuario_id uuid,
    nr_id integer,
    titulo text,
    arquivo_url text,
    status text,
    nota numeric,
    corrigido_em timestamptz,
    criado_em timestamptz,
    aluno_nome text,
    aluno_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_is_professor() then
        raise exception 'Acesso restrito a professores e administradores.'
            using errcode = '42501';
    end if;

    return query
        select
            pr.id,
            pr.usuario_id,
            pr.nr_id,
            pr.titulo,
            pr.arquivo_url,
            pr.status,
            pr.nota,
            pr.corrigido_em,
            pr.criado_em,
            p.nome_completo,
            p.email
        from public.provas pr
        left join public.profiles p on p.id = pr.usuario_id
        where pr.status = 'pendente'
        order by pr.criado_em asc;
end;
$$;

create or replace function public.sulsafe_listar_salas_ativas()
returns table (
    id uuid,
    topico text,
    meet_id text,
    criado_por uuid,
    ativa boolean,
    created_at timestamptz,
    criador_nome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessao invalida.' using errcode = '42501';
    end if;

    return query
        select
            s.id,
            s.topico,
            s.meet_id,
            s.criado_por,
            s.ativa,
            s.created_at,
            p.nome_completo
        from public.salas s
        left join public.profiles p on p.id = s.criado_por
        where s.ativa = true
        order by s.created_at desc;
end;
$$;

create or replace function public.sulsafe_listar_mensagens_forum(p_nr_id integer default null)
returns table (
    id uuid,
    usuario_id uuid,
    nr_id integer,
    topico text,
    mensagem text,
    status text,
    criado_em timestamptz,
    autor_nome text,
    autor_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessao invalida.' using errcode = '42501';
    end if;

    return query
        select
            m.id,
            m.usuario_id,
            m.nr_id,
            m.topico,
            m.mensagem,
            m.status,
            m.criado_em,
            p.nome_completo,
            p.role::text
        from public.mensagens_forum m
        left join public.profiles p on p.id = m.usuario_id
        where p_nr_id is null or m.nr_id = p_nr_id
        order by m.criado_em desc;
end;
$$;

revoke all on function public.sulsafe_listar_alunos() from public;
revoke all on function public.sulsafe_obter_perfil_publico(uuid) from public;
revoke all on function public.sulsafe_listar_provas_pendentes() from public;
revoke all on function public.sulsafe_listar_salas_ativas() from public;
revoke all on function public.sulsafe_listar_mensagens_forum(integer) from public;

grant execute on function public.sulsafe_listar_alunos() to authenticated, service_role;
grant execute on function public.sulsafe_obter_perfil_publico(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_listar_provas_pendentes() to authenticated, service_role;
grant execute on function public.sulsafe_listar_salas_ativas() to authenticated, service_role;
grant execute on function public.sulsafe_listar_mensagens_forum(integer) to authenticated, service_role;

-- ============================================================
-- 3. REMOCAO DAS POLICIES AMPLAS
-- ============================================================
-- As policies restritivas de direcionamento criadas em 20261022
-- sao preservadas de proposito.

do $$
declare
    r record;
begin
    for r in
        select tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = any (array[
              'certificados',
              'materiais',
              'mensagens_forum',
              'notas',
              'notificacoes',
              'progresso_aulas',
              'provas',
              'salas',
              'videoaulas'
          ])
          and policyname not in (
              'sulsafe_materiais_direcionamento',
              'sulsafe_videoaulas_direcionamento'
          )
    loop
        execute format(
            'drop policy %I on public.%I',
            r.policyname,
            r.tablename
        );
    end loop;
end $$;

alter table public.certificados enable row level security;
alter table public.materiais enable row level security;
alter table public.mensagens_forum enable row level security;
alter table public.notas enable row level security;
alter table public.notificacoes enable row level security;
alter table public.progresso_aulas enable row level security;
alter table public.provas enable row level security;
alter table public.salas enable row level security;
alter table public.videoaulas enable row level security;

-- ============================================================
-- 4. GATILHOS DE PROPRIEDADE
-- ============================================================

create or replace function public.sulsafe_proteger_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.role(), '') = 'service_role' then
        return new;
    end if;

    if not public.sulsafe_is_professor() then
        raise exception 'Apenas professores e administradores podem lancar notas.'
            using errcode = '42501';
    end if;

    if new.usuario_id is null or not public.sulsafe_perfil_aluno(new.usuario_id) then
        raise exception 'A nota deve pertencer a um aluno valido.'
            using errcode = '23514';
    end if;

    if tg_op = 'UPDATE' then
        if not public.sulsafe_is_admin()
           and new.usuario_id is distinct from old.usuario_id then
            raise exception 'O aluno da nota nao pode ser alterado.'
                using errcode = '42501';
        end if;

        if not public.sulsafe_is_admin() then
            new.professor_id := auth.uid();
        end if;
    elsif not public.sulsafe_is_admin() then
        new.professor_id := auth.uid();
    end if;

    return new;
end;
$$;

revoke all on function public.sulsafe_proteger_nota() from public;

drop trigger if exists trg_notas_protege on public.notas;
create trigger trg_notas_protege
before insert or update on public.notas
for each row execute function public.sulsafe_proteger_nota();

create or replace function public.sulsafe_proteger_prova()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.role(), '') = 'service_role' then
        return new;
    end if;

    if tg_op = 'INSERT' then
        if public.sulsafe_is_professor() then
            if new.usuario_id is null
               or not public.sulsafe_perfil_aluno(new.usuario_id) then
                raise exception 'A prova deve pertencer a um aluno valido.'
                    using errcode = '23514';
            end if;
        else
            if new.usuario_id is distinct from auth.uid() then
                raise exception 'O envio deve ser feito em nome do proprio aluno.'
                    using errcode = '42501';
            end if;

            if new.status is distinct from 'pendente'
               or new.nota is not null
               or new.corrigido_em is not null then
                raise exception 'O aluno nao pode definir nota ou status da prova.'
                    using errcode = '42501';
            end if;

            if nullif(btrim(coalesce(new.arquivo_url, '')), '') is null then
                raise exception 'O arquivo da prova e obrigatorio.'
                    using errcode = '23514';
            end if;
        end if;

        return new;
    end if;

    if not public.sulsafe_is_professor() then
        raise exception 'Apenas professores e administradores podem corrigir provas.'
            using errcode = '42501';
    end if;

    if not public.sulsafe_is_admin()
       and new.usuario_id is distinct from old.usuario_id then
        raise exception 'O aluno da prova nao pode ser alterado.'
            using errcode = '42501';
    end if;

    if new.usuario_id is null
       or not public.sulsafe_perfil_aluno(new.usuario_id) then
        raise exception 'A prova deve pertencer a um aluno valido.'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

revoke all on function public.sulsafe_proteger_prova() from public;

drop trigger if exists trg_provas_protege on public.provas;
create trigger trg_provas_protege
before insert or update on public.provas
for each row execute function public.sulsafe_proteger_prova();

create or replace function public.sulsafe_proteger_certificado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.role(), '') = 'service_role' then
        return new;
    end if;

    if not public.sulsafe_is_professor() then
        raise exception 'Apenas professores e administradores podem emitir certificados.'
            using errcode = '42501';
    end if;

    if new.usuario_id is null
       or not public.sulsafe_perfil_aluno(new.usuario_id) then
        raise exception 'O certificado deve pertencer a um aluno valido.'
            using errcode = '23514';
    end if;

    if tg_op = 'INSERT' then
        if not public.sulsafe_is_admin()
           and new.emitido_por is distinct from auth.uid() then
            raise exception 'O emissor do certificado deve ser o usuario autenticado.'
                using errcode = '42501';
        end if;
    elsif not public.sulsafe_is_admin()
          and (
              new.usuario_id is distinct from old.usuario_id
              or new.emitido_por is distinct from old.emitido_por
          ) then
        raise exception 'O aluno e o emissor do certificado nao podem ser alterados.'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

revoke all on function public.sulsafe_proteger_certificado() from public;

drop trigger if exists trg_certificados_protege on public.certificados;
create trigger trg_certificados_protege
before insert or update on public.certificados
for each row execute function public.sulsafe_proteger_certificado();

-- ============================================================
-- 5. POLICIES POR TABELA
-- ============================================================

-- ------------------------------------------------------------
-- notas
-- ------------------------------------------------------------
create policy "sulsafe_notas_select"
on public.notas
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (usuario_id = auth.uid() or public.sulsafe_is_professor())
);

create policy "sulsafe_notas_insert"
on public.notas
for insert
to authenticated
with check (
    public.sulsafe_is_professor()
    and usuario_id is not null
    and public.sulsafe_perfil_aluno(usuario_id)
);

create policy "sulsafe_notas_update"
on public.notas
for update
to authenticated
using (public.sulsafe_is_professor())
with check (
    public.sulsafe_is_professor()
    and usuario_id is not null
    and public.sulsafe_perfil_aluno(usuario_id)
);

create policy "sulsafe_notas_delete"
on public.notas
for delete
to authenticated
using (public.sulsafe_is_professor());

-- ------------------------------------------------------------
-- certificados
-- ------------------------------------------------------------
create policy "sulsafe_certificados_select"
on public.certificados
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (usuario_id = auth.uid() or public.sulsafe_is_professor())
);

create policy "sulsafe_certificados_insert"
on public.certificados
for insert
to authenticated
with check (public.sulsafe_is_professor());

create policy "sulsafe_certificados_update"
on public.certificados
for update
to authenticated
using (public.sulsafe_is_professor())
with check (public.sulsafe_is_professor());

create policy "sulsafe_certificados_delete"
on public.certificados
for delete
to authenticated
using (public.sulsafe_is_admin());

-- ------------------------------------------------------------
-- provas
-- ------------------------------------------------------------
create policy "sulsafe_provas_select"
on public.provas
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (usuario_id = auth.uid() or public.sulsafe_is_professor())
);

create policy "sulsafe_provas_insert"
on public.provas
for insert
to authenticated
with check (
    public.sulsafe_conta_ativa()
    and (
        usuario_id = auth.uid()
        or public.sulsafe_is_professor()
    )
);

create policy "sulsafe_provas_update"
on public.provas
for update
to authenticated
using (public.sulsafe_is_professor())
with check (public.sulsafe_is_professor());

create policy "sulsafe_provas_delete"
on public.provas
for delete
to authenticated
using (public.sulsafe_is_admin());

-- ------------------------------------------------------------
-- progresso_aulas
-- ------------------------------------------------------------
create policy "sulsafe_progresso_select"
on public.progresso_aulas
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (user_id = auth.uid() or public.sulsafe_is_professor())
);

create policy "sulsafe_progresso_insert"
on public.progresso_aulas
for insert
to authenticated
with check (
    public.sulsafe_conta_ativa()
    and user_id = auth.uid()
);

create policy "sulsafe_progresso_update"
on public.progresso_aulas
for update
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and user_id = auth.uid())
)
with check (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and user_id = auth.uid())
);

create policy "sulsafe_progresso_delete"
on public.progresso_aulas
for delete
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and user_id = auth.uid())
);

-- ------------------------------------------------------------
-- notificacoes
-- ------------------------------------------------------------
create policy "sulsafe_notificacoes_select"
on public.notificacoes
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (usuario_id = auth.uid() or public.sulsafe_is_admin())
);

create policy "sulsafe_notificacoes_insert"
on public.notificacoes
for insert
to authenticated
with check (
    public.sulsafe_conta_ativa()
    and (usuario_id = auth.uid() or public.sulsafe_is_professor())
);

create policy "sulsafe_notificacoes_update"
on public.notificacoes
for update
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and usuario_id = auth.uid())
)
with check (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and usuario_id = auth.uid())
);

create policy "sulsafe_notificacoes_delete"
on public.notificacoes
for delete
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and usuario_id = auth.uid())
);

-- ------------------------------------------------------------
-- mensagens_forum
-- ------------------------------------------------------------
create policy "sulsafe_forum_select"
on public.mensagens_forum
for select
to authenticated
using (public.sulsafe_conta_ativa());

create policy "sulsafe_forum_insert"
on public.mensagens_forum
for insert
to authenticated
with check (
    public.sulsafe_conta_ativa()
    and usuario_id = auth.uid()
);

create policy "sulsafe_forum_update"
on public.mensagens_forum
for update
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and usuario_id = auth.uid())
)
with check (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and usuario_id = auth.uid())
);

create policy "sulsafe_forum_delete"
on public.mensagens_forum
for delete
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_conta_ativa() and usuario_id = auth.uid())
);

-- ------------------------------------------------------------
-- salas
-- ------------------------------------------------------------
create policy "sulsafe_salas_select"
on public.salas
for select
to authenticated
using (public.sulsafe_conta_ativa());

create policy "sulsafe_salas_insert"
on public.salas
for insert
to authenticated
with check (
    public.sulsafe_is_professor()
    and criado_por = auth.uid()
);

create policy "sulsafe_salas_update"
on public.salas
for update
to authenticated
using (public.sulsafe_is_professor())
with check (public.sulsafe_is_professor());

create policy "sulsafe_salas_delete"
on public.salas
for delete
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_is_professor() and criado_por = auth.uid())
);

-- ------------------------------------------------------------
-- materiais (a policy restritiva de direcionamento continua ativa)
-- ------------------------------------------------------------
create policy "sulsafe_materiais_select"
on public.materiais
for select
to authenticated
using (public.sulsafe_conta_ativa());

create policy "sulsafe_materiais_insert"
on public.materiais
for insert
to authenticated
with check (
    public.sulsafe_is_professor()
    and criado_por = auth.uid()
);

create policy "sulsafe_materiais_update"
on public.materiais
for update
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_is_professor() and criado_por = auth.uid())
)
with check (
    public.sulsafe_is_admin()
    or (public.sulsafe_is_professor() and criado_por = auth.uid())
);

create policy "sulsafe_materiais_delete"
on public.materiais
for delete
to authenticated
using (
    public.sulsafe_is_admin()
    or (public.sulsafe_is_professor() and criado_por = auth.uid())
);

-- ------------------------------------------------------------
-- videoaulas (a policy restritiva de direcionamento continua ativa)
-- ------------------------------------------------------------
create policy "sulsafe_videoaulas_select"
on public.videoaulas
for select
to authenticated
using (public.sulsafe_conta_ativa());

create policy "sulsafe_videoaulas_insert"
on public.videoaulas
for insert
to authenticated
with check (public.sulsafe_is_professor());

create policy "sulsafe_videoaulas_update"
on public.videoaulas
for update
to authenticated
using (public.sulsafe_is_professor())
with check (public.sulsafe_is_professor());

create policy "sulsafe_videoaulas_delete"
on public.videoaulas
for delete
to authenticated
using (public.sulsafe_is_professor());

-- ------------------------------------------------------------
-- turmas e provas direcionadas: bloqueia conta inativa
-- ------------------------------------------------------------
drop policy if exists "sulsafe_turmas_conta_ativa" on public.turmas;
create policy "sulsafe_turmas_conta_ativa"
on public.turmas
as restrictive
for all
to authenticated
using (public.sulsafe_conta_ativa())
with check (public.sulsafe_conta_ativa());

drop policy if exists "sulsafe_turma_alunos_conta_ativa" on public.turma_alunos;
create policy "sulsafe_turma_alunos_conta_ativa"
on public.turma_alunos
as restrictive
for all
to authenticated
using (public.sulsafe_conta_ativa())
with check (public.sulsafe_conta_ativa());

drop policy if exists "sulsafe_turma_materiais_conta_ativa" on public.turma_materiais;
create policy "sulsafe_turma_materiais_conta_ativa"
on public.turma_materiais
as restrictive
for all
to authenticated
using (public.sulsafe_conta_ativa())
with check (public.sulsafe_conta_ativa());

drop policy if exists "sulsafe_provas_direcionadas_conta_ativa" on public.provas_direcionadas;
create policy "sulsafe_provas_direcionadas_conta_ativa"
on public.provas_direcionadas
as restrictive
for all
to authenticated
using (public.sulsafe_conta_ativa())
with check (public.sulsafe_conta_ativa());

-- ============================================================
-- 6. VIEWS
-- ============================================================

alter view public.view_dashboard_admin set (security_invoker = true);
alter view public.view_medias_nrs set (security_invoker = true);
alter view public.view_ranking_alunos set (security_invoker = true);

revoke all on public.view_dashboard_admin from anon, authenticated;
revoke all on public.view_medias_nrs from anon, authenticated;
revoke all on public.view_ranking_alunos from anon, authenticated;

grant select on public.view_dashboard_admin to authenticated;
grant select on public.view_medias_nrs to authenticated;
grant select on public.view_ranking_alunos to authenticated;

-- ============================================================
-- 7. GRANTS
-- ============================================================

revoke all on public.certificados from anon, authenticated;
revoke all on public.materiais from anon, authenticated;
revoke all on public.mensagens_forum from anon, authenticated;
revoke all on public.notas from anon, authenticated;
revoke all on public.notificacoes from anon, authenticated;
revoke all on public.progresso_aulas from anon, authenticated;
revoke all on public.provas from anon, authenticated;
revoke all on public.salas from anon, authenticated;
revoke all on public.videoaulas from anon, authenticated;

grant select, insert, update, delete on public.certificados to authenticated;
grant select, insert, update, delete on public.materiais to authenticated;
grant select, insert, update, delete on public.mensagens_forum to authenticated;
grant select, insert, update, delete on public.notas to authenticated;
grant select, insert, update, delete on public.notificacoes to authenticated;
grant select, insert, update, delete on public.progresso_aulas to authenticated;
grant select, insert, update, delete on public.provas to authenticated;
grant select, insert, update, delete on public.salas to authenticated;
grant select, insert, update, delete on public.videoaulas to authenticated;

grant all on public.certificados to service_role;
grant all on public.materiais to service_role;
grant all on public.mensagens_forum to service_role;
grant all on public.notas to service_role;
grant all on public.notificacoes to service_role;
grant all on public.progresso_aulas to service_role;
grant all on public.provas to service_role;
grant all on public.salas to service_role;
grant all on public.videoaulas to service_role;

notify pgrst, 'reload schema';

commit;
