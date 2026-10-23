-- ============================================================
-- ESCOPO DE LEITURA DO PROFESSOR POR TURMA
-- ============================================================
-- Um professor deixa de enxergar todos os alunos, notas, provas e
-- certificados. O acesso passa a ser limitado as turmas que ele criou
-- ou nas quais foi vinculado como professor em turma_materiais.
-- Administradores continuam com acesso amplo.
-- ============================================================

begin;

create or replace function public.sulsafe_acessa_turma(p_turma_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_is_professor()
       and (
           public.sulsafe_is_admin()
           or exists (
               select 1
               from public.turmas t
               where t.id = p_turma_id
                 and t.criado_por = auth.uid()
           )
           or exists (
               select 1
               from public.turma_materiais tm
               where tm.turma_id = p_turma_id
                 and tm.professor_id = auth.uid()
           )
       );
$$;

create or replace function public.sulsafe_acessa_aluno(p_aluno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_is_professor()
       and (
           public.sulsafe_is_admin()
           or exists (
               select 1
               from public.turma_alunos ta
               where ta.aluno_id = p_aluno_id
                 and public.sulsafe_acessa_turma(ta.turma_id)
           )
       );
$$;

revoke all on function public.sulsafe_acessa_turma(uuid) from public, anon;
revoke all on function public.sulsafe_acessa_aluno(uuid) from public, anon;
grant execute on function public.sulsafe_acessa_turma(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_acessa_aluno(uuid) to authenticated, service_role;

-- ============================================================
-- RPCs DE LEITURA
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
          and public.sulsafe_acessa_aluno(p.id)
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
    v_acessa_aluno boolean;
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
    v_acessa_aluno := public.sulsafe_acessa_aluno(p_id);

    if v_uid <> p_id then
        if not v_professor then
            raise exception 'Acesso restrito ao proprio perfil.'
                using errcode = '42501';
        end if;

        if v_role = 'aluno' and not v_acessa_aluno then
            raise exception 'Acesso restrito aos alunos das suas turmas.'
                using errcode = '42501';
        end if;
    end if;

    return query
        select
            p.id,
            p.nome_completo,
            case
                when v_uid = p_id
                     or (v_professor and v_role = 'aluno' and v_acessa_aluno)
                    then p.email
                else null
            end,
            case
                when v_uid = p_id
                     or (v_professor and v_role = 'aluno' and v_acessa_aluno)
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
          and public.sulsafe_acessa_aluno(pr.usuario_id)
        order by pr.criado_em asc;
end;
$$;

revoke all on function public.sulsafe_listar_alunos() from public, anon;
revoke all on function public.sulsafe_obter_perfil_publico(uuid) from public, anon;
revoke all on function public.sulsafe_listar_provas_pendentes() from public, anon;

grant execute on function public.sulsafe_listar_alunos() to authenticated, service_role;
grant execute on function public.sulsafe_obter_perfil_publico(uuid) to authenticated, service_role;
grant execute on function public.sulsafe_listar_provas_pendentes() to authenticated, service_role;

-- ============================================================
-- TURMAS: LEITURA PARA PROFESSORES VINCULADOS
-- ============================================================

drop policy if exists "sulsafe_turmas_select" on public.turmas;
create policy "sulsafe_turmas_select"
on public.turmas
for select
to authenticated
using (
    public.sulsafe_acessa_turma(id)
    or exists (
        select 1
        from public.turma_alunos ta
        where ta.turma_id = turmas.id
          and ta.aluno_id = auth.uid()
    )
);

drop policy if exists "sulsafe_turma_alunos_select" on public.turma_alunos;
create policy "sulsafe_turma_alunos_select"
on public.turma_alunos
for select
to authenticated
using (
    aluno_id = auth.uid()
    or public.sulsafe_acessa_turma(turma_id)
);

drop policy if exists "sulsafe_turma_materiais_select" on public.turma_materiais;
create policy "sulsafe_turma_materiais_select"
on public.turma_materiais
for select
to authenticated
using (
    public.sulsafe_acessa_turma(turma_id)
    or exists (
        select 1
        from public.turma_alunos ta
        where ta.turma_id = turma_materiais.turma_id
          and ta.aluno_id = auth.uid()
    )
);

drop policy if exists "sulsafe_provas_direcionadas_select" on public.provas_direcionadas;
create policy "sulsafe_provas_direcionadas_select"
on public.provas_direcionadas
for select
to authenticated
using (
    public.sulsafe_is_admin()
    or public.sulsafe_acessa_turma(turma_id)
    or criado_por = auth.uid()
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
        (
            aluno_id is not null
            and public.sulsafe_perfil_aluno(aluno_id)
            and public.sulsafe_acessa_aluno(aluno_id)
        )
        or (
            turma_id is not null
            and public.sulsafe_acessa_turma(turma_id)
        )
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
    or (
        criado_por = auth.uid()
        and (
            (
                aluno_id is not null
                and public.sulsafe_perfil_aluno(aluno_id)
                and public.sulsafe_acessa_aluno(aluno_id)
            )
            or (
                turma_id is not null
                and public.sulsafe_acessa_turma(turma_id)
            )
        )
    )
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

-- ============================================================
-- NOTAS
-- ============================================================

drop policy if exists "sulsafe_notas_select" on public.notas;
create policy "sulsafe_notas_select"
on public.notas
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        usuario_id = auth.uid()
        or public.sulsafe_acessa_aluno(usuario_id)
    )
);

drop policy if exists "sulsafe_notas_insert" on public.notas;
create policy "sulsafe_notas_insert"
on public.notas
for insert
to authenticated
with check (
    public.sulsafe_acessa_aluno(usuario_id)
    and usuario_id is not null
    and public.sulsafe_perfil_aluno(usuario_id)
);

drop policy if exists "sulsafe_notas_update" on public.notas;
create policy "sulsafe_notas_update"
on public.notas
for update
to authenticated
using (public.sulsafe_acessa_aluno(usuario_id))
with check (
    public.sulsafe_acessa_aluno(usuario_id)
    and usuario_id is not null
    and public.sulsafe_perfil_aluno(usuario_id)
);

drop policy if exists "sulsafe_notas_delete" on public.notas;
create policy "sulsafe_notas_delete"
on public.notas
for delete
to authenticated
using (public.sulsafe_acessa_aluno(usuario_id));

-- ============================================================
-- PROVAS
-- ============================================================

drop policy if exists "sulsafe_provas_select" on public.provas;
create policy "sulsafe_provas_select"
on public.provas
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        usuario_id = auth.uid()
        or public.sulsafe_acessa_aluno(usuario_id)
    )
);

drop policy if exists "sulsafe_provas_insert" on public.provas;
create policy "sulsafe_provas_insert"
on public.provas
for insert
to authenticated
with check (
    public.sulsafe_conta_ativa()
    and (
        usuario_id = auth.uid()
        or public.sulsafe_acessa_aluno(usuario_id)
    )
);

drop policy if exists "sulsafe_provas_update" on public.provas;
create policy "sulsafe_provas_update"
on public.provas
for update
to authenticated
using (public.sulsafe_acessa_aluno(usuario_id))
with check (public.sulsafe_acessa_aluno(usuario_id));

-- ============================================================
-- CERTIFICADOS
-- ============================================================

drop policy if exists "sulsafe_certificados_select" on public.certificados;
create policy "sulsafe_certificados_select"
on public.certificados
for select
to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        usuario_id = auth.uid()
        or public.sulsafe_acessa_aluno(usuario_id)
    )
);

drop policy if exists "sulsafe_certificados_insert" on public.certificados;
create policy "sulsafe_certificados_insert"
on public.certificados
for insert
to authenticated
with check (public.sulsafe_acessa_aluno(usuario_id));

drop policy if exists "sulsafe_certificados_update" on public.certificados;
create policy "sulsafe_certificados_update"
on public.certificados
for update
to authenticated
using (public.sulsafe_acessa_aluno(usuario_id))
with check (public.sulsafe_acessa_aluno(usuario_id));

notify pgrst, 'reload schema';

commit;
