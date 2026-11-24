-- ============================================================
-- EXCLUSÃO ATÔMICA (blindagem antes da automação)
-- ============================================================
-- Objetivo: nenhuma exclusão pode terminar no meio e deixar órfãos.
-- Regra: filho primeiro, pai depois. Toda RPC roda em SECURITY DEFINER
-- com search_path vazio e valida auth.uid() + RBAC no servidor.
-- As tabelas de trabalhos abaixo não existiam no schema local; foram
-- criadas para dar suporte à RPC excluir_trabalho_completo.

-- ============================================================
-- 1. TABELAS DE TRABALHOS/SUBMISSÕES + LOG DE EXCLUSÃO
-- ============================================================

create table if not exists public.trabalhos (
    id uuid primary key default gen_random_uuid(),
    nr_id integer not null,
    professor_id uuid not null references public.profiles(id) on delete cascade,
    titulo text not null,
    descricao text,
    prazo timestamptz,
    criado_em timestamptz not null default now()
);

create table if not exists public.trabalhos_submissao (
    id uuid primary key default gen_random_uuid(),
    trabalho_id uuid not null references public.trabalhos(id) on delete cascade,
    aluno_id uuid not null references public.profiles(id) on delete cascade,
    resposta text,
    arquivo_url text,
    nota numeric(5,2),
    criado_em timestamptz not null default now(),
    constraint trabalhos_submissao_unico unique (trabalho_id, aluno_id)
);

create table if not exists public.exclusao_logs (
    id uuid primary key default gen_random_uuid(),
    entidade text not null,
    entidade_id uuid not null,
    operador uuid,
    criado_em timestamptz not null default now(),
    detalhes jsonb not null default '{}'::jsonb
);

create index if not exists trabalhos_nr_idx on public.trabalhos (nr_id);
create index if not exists trabalhos_submissao_trabalho_idx
    on public.trabalhos_submissao (trabalho_id);
create index if not exists exclusao_logs_entidade_idx
    on public.exclusao_logs (entidade, entidade_id);

alter table public.trabalhos enable row level security;
alter table public.trabalhos_submissao enable row level security;
alter table public.exclusao_logs enable row level security;

revoke all on public.trabalhos, public.trabalhos_submissao, public.exclusao_logs from anon;
revoke all on public.exclusao_logs from authenticated;
grant select on public.trabalhos, public.trabalhos_submissao to authenticated;
grant select on public.exclusao_logs to authenticated;

drop policy if exists "sulsafe_trabalhos_select" on public.trabalhos;
create policy "sulsafe_trabalhos_select" on public.trabalhos
    for select to authenticated
    using (
        public.sulsafe_is_admin()
        or (public.sulsafe_is_professor() and professor_id = auth.uid())
        or exists (
            select 1 from public.trabalhos_submissao ts
            where ts.trabalho_id = public.trabalhos.id and ts.aluno_id = auth.uid()
        )
    );

drop policy if exists "sulsafe_submissoes_select" on public.trabalhos_submissao;
create policy "sulsafe_submissoes_select" on public.trabalhos_submissao
    for select to authenticated
    using (
        public.sulsafe_is_admin()
        or aluno_id = auth.uid()
        or exists (
            select 1 from public.trabalhos t
            where t.id = public.trabalhos_submissao.trabalho_id
              and t.professor_id = auth.uid()
        )
    );

drop policy if exists "sulsafe_logs_select_admin" on public.exclusao_logs;
create policy "sulsafe_logs_select_admin" on public.exclusao_logs
    for select to authenticated
    using (public.sulsafe_is_admin());

-- ============================================================
-- 2. RPC: EXCLUIR TRABALHO COMPLETO
-- ============================================================

create or replace function public.excluir_trabalho_completo(p_trabalho_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_professor_id uuid;
    v_submissoes integer;
begin
    if auth.uid() is null or not public.sulsafe_conta_ativa() then
        raise exception 'Sessão inválida ou conta inativa';
    end if;

    select t.professor_id into v_professor_id
    from public.trabalhos t
    where t.id = p_trabalho_id;

    if v_professor_id is null then
        raise exception 'Trabalho não encontrado';
    end if;

    if not public.sulsafe_is_admin()
       and not (public.sulsafe_is_professor() and v_professor_id = auth.uid()) then
        raise exception 'Sem permissão para excluir este trabalho';
    end if;

    select count(*) into v_submissoes
    from public.trabalhos_submissao ts
    where ts.trabalho_id = p_trabalho_id;

    -- Bloco com EXCEPTION: qualquer falha aborta a transação inteira.
    begin
        delete from public.trabalhos_submissao where trabalho_id = p_trabalho_id;
        delete from public.trabalhos where id = p_trabalho_id;

        insert into public.exclusao_logs (entidade, entidade_id, operador, detalhes)
        values (
            'trabalhos',
            p_trabalho_id,
            auth.uid(),
            jsonb_build_object('submissoes', v_submissoes)
        );
    exception when others then
        raise exception 'Falha ao excluir trabalho (nada foi alterado): %', sqlerrm;
    end;
end;
$$;

-- ============================================================
-- 3. RPC: EXCLUIR CURSO/NR COMPLETO
-- ============================================================

create or replace function public.excluir_curso_completo(p_nr_id integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_materiais integer;
begin
    if auth.uid() is null or not public.sulsafe_is_admin() then
        raise exception 'Somente administradores podem excluir um curso completo';
    end if;

    select count(*) into v_materiais
    from public.materiais where nr_id = p_nr_id;

    begin
        -- Filhos primeiro.
        delete from public.trabalhos_submissao
        where trabalho_id in (select id from public.trabalhos where nr_id = p_nr_id);
        delete from public.trabalhos where nr_id = p_nr_id;

        delete from public.provas_direcionadas where nr_id = p_nr_id;
        delete from public.turma_materiais
        where material_id in (select id from public.materiais where nr_id = p_nr_id)
           or videoaula_id in (select id from public.videoaulas where nr_id = p_nr_id);

        delete from public.progresso_aulas
        where aula_id in (select id from public.videoaulas where nr_id = p_nr_id);
        delete from public.notas where nr_id = p_nr_id;
        delete from public.provas where nr_id = p_nr_id;
        delete from public.certificados where nr_id = p_nr_id;
        delete from public.mensagens_forum where nr_id = p_nr_id;

        -- Pais por último.
        delete from public.videoaulas where nr_id = p_nr_id;
        delete from public.materiais where nr_id = p_nr_id;

        insert into public.exclusao_logs (entidade, entidade_id, operador, detalhes)
        values (
            'cursos',
            gen_random_uuid(),
            auth.uid(),
            jsonb_build_object('nr_id', p_nr_id, 'materiais', v_materiais)
        );
    exception when others then
        raise exception 'Falha ao excluir curso (nada foi alterado): %', sqlerrm;
    end;
end;
$$;

-- ============================================================
-- 4. RPC: EXCLUIR TURMA COMPLETA
-- ============================================================

create or replace function public.excluir_turma_completo(p_turma_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.sulsafe_conta_ativa() then
        raise exception 'Sessão inválida ou conta inativa';
    end if;

    if not public.sulsafe_is_admin()
       and not public.sulsafe_gerencia_turma(p_turma_id) then
        raise exception 'Sem permissão para excluir esta turma';
    end if;

    begin
        delete from public.provas_direcionadas where turma_id = p_turma_id;
        delete from public.turma_materiais where turma_id = p_turma_id;
        delete from public.turma_alunos where turma_id = p_turma_id;
        delete from public.turmas where id = p_turma_id;

        insert into public.exclusao_logs (entidade, entidade_id, operador, detalhes)
        values ('turmas', p_turma_id, auth.uid(), jsonb_build_object('metodo', 'rpc'));
    exception when others then
        raise exception 'Falha ao excluir turma (nada foi alterado): %', sqlerrm;
    end;
end;
$$;

-- ============================================================
-- 5. RPC: EXCLUIR MATERIAL, NOTA E APAGAR TUDO
-- ============================================================

create or replace function public.excluir_material_completo(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_criado_por uuid;
begin
    if auth.uid() is null or not public.sulsafe_conta_ativa() then
        raise exception 'Sessão inválida ou conta inativa';
    end if;

    select m.criado_por into v_criado_por
    from public.materiais m where m.id = p_material_id;

    if v_criado_por is null then
        raise exception 'Material não encontrado';
    end if;

    if not public.sulsafe_is_admin()
       and not (public.sulsafe_is_professor() and v_criado_por = auth.uid()) then
        raise exception 'Sem permissão para excluir este material';
    end if;

    begin
        delete from public.turma_materiais where material_id = p_material_id;
        delete from public.materiais where id = p_material_id;

        insert into public.exclusao_logs (entidade, entidade_id, operador, detalhes)
        values ('materiais', p_material_id, auth.uid(), jsonb_build_object('metodo', 'rpc'));
    exception when others then
        raise exception 'Falha ao excluir material (nada foi alterado): %', sqlerrm;
    end;
end;
$$;

create or replace function public.excluir_nota_completo(p_nota_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_professor_id uuid;
begin
    if auth.uid() is null or not public.sulsafe_conta_ativa() then
        raise exception 'Sessão inválida ou conta inativa';
    end if;

    select n.professor_id into v_professor_id
    from public.notas n where n.id = p_nota_id;

    if v_professor_id is null then
        raise exception 'Nota não encontrada';
    end if;

    if not public.sulsafe_is_admin()
       and not (public.sulsafe_is_professor() and v_professor_id = auth.uid()) then
        raise exception 'Sem permissão para excluir esta nota';
    end if;

    begin
        delete from public.notas where id = p_nota_id;

        insert into public.exclusao_logs (entidade, entidade_id, operador, detalhes)
        values ('notas', p_nota_id, auth.uid(), jsonb_build_object('metodo', 'rpc'));
    exception when others then
        raise exception 'Falha ao excluir nota (nada foi alterado): %', sqlerrm;
    end;
end;
$$;

-- Substitui a sequência de 7 deletes soltos do painel admin.
create or replace function public.sulsafe_apagar_tudo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.sulsafe_is_admin() then
        raise exception 'Somente administradores podem apagar todos os dados';
    end if;

    begin
        delete from public.trabalhos_submissao;
        delete from public.trabalhos;

        delete from public.provas_direcionadas;
        delete from public.turma_materiais;
        delete from public.turma_alunos;
        delete from public.turmas;

        delete from public.notas;
        delete from public.provas;
        delete from public.certificados;
        delete from public.progresso_aulas;
        delete from public.mensagens_forum;
        delete from public.notificacoes;
        delete from public.salas;
        delete from public.videoaulas;
        delete from public.materiais;

        -- documentos_aluno, dossie_auditoria e exclusao_logs NÃO são apagados.
        insert into public.exclusao_logs (entidade, entidade_id, operador, detalhes)
        values ('plataforma', gen_random_uuid(), auth.uid(), jsonb_build_object('metodo', 'apagar_tudo'));
    exception when others then
        raise exception 'Falha ao apagar tudo (nada foi alterado): %', sqlerrm;
    end;
end;
$$;

-- ============================================================
-- 6. PERMISSÕES DE EXECUÇÃO
-- ============================================================

revoke all on function public.excluir_trabalho_completo(uuid) from public, anon;
revoke all on function public.excluir_curso_completo(integer) from public, anon;
revoke all on function public.excluir_turma_completo(uuid) from public, anon;
revoke all on function public.excluir_material_completo(uuid) from public, anon;
revoke all on function public.excluir_nota_completo(uuid) from public, anon;
revoke all on function public.sulsafe_apagar_tudo() from public, anon;

grant execute on function public.excluir_trabalho_completo(uuid) to authenticated;
grant execute on function public.excluir_curso_completo(integer) to authenticated;
grant execute on function public.excluir_turma_completo(uuid) to authenticated;
grant execute on function public.excluir_material_completo(uuid) to authenticated;
grant execute on function public.excluir_nota_completo(uuid) to authenticated;
grant execute on function public.sulsafe_apagar_tudo() to authenticated;
