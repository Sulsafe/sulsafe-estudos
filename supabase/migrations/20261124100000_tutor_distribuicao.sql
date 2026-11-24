-- ============================================================
-- TUTOR-SULSAFE — DISTRIBUIÇÃO DO CONTEÚDO MATERIALIZADO
-- ============================================================
-- Antes desta migration o Tutor materializava o rascunho como
-- videoaula/material privado na NR, mas não dizia "para quem?".
--
-- Aqui:
--   1. A ementa completa (módulos e aulas) passa a acompanhar a descrição
--      do conteúdo materializado.
--   2. sulsafe_direcionar_conteudo_tutor vincula o conteúdo a turmas,
--      trilhas ou atendimentos individuais (tabela turma_materiais).
--   3. sulsafe_publicar_conteudo_tutor libera o conteúdo para o catálogo
--      da NR (publico = true) — decisão humana, registrada no rascunho.
--
-- O conteúdo continua privado até que uma dessas decisões seja tomada.
-- Nenhuma chave de API participa destas funções.
-- ============================================================

-- ------------------------------------------------------------
-- 1. MATERIALIZAÇÃO COM A EMENTA COMPLETA
-- ------------------------------------------------------------

create or replace function public.sulsafe_materializar_rascunho_tutor(
    p_conteudo_id uuid,
    p_nr_id integer,
    p_destino text,
    p_titulo text default null,
    p_descricao text default null,
    p_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conteudo public.ia_conteudos%rowtype;
    v_aprovador uuid;
    v_entidade_id uuid;
    v_titulo text;
    v_descricao text;
    v_url text;
    v_ementa text := '';
    v_modulo jsonb;
    v_aula jsonb;
    v_bloco text;
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem publicar conteúdo de I.A';
    end if;

    if p_nr_id is null or p_nr_id not between 1 and 38 then
        raise exception 'Informe uma NR válida (1 a 38)';
    end if;

    if p_destino not in ('VIDEOAULA', 'MATERIAL') then
        raise exception 'Destino inválido. Use VIDEOAULA ou MATERIAL';
    end if;

    select * into v_conteudo
      from public.ia_conteudos c
     where c.id = p_conteudo_id;

    if not found then
        raise exception 'Rascunho de I.A. não encontrado';
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

    v_aprovador := coalesce(v_conteudo.aprovado_por, auth.uid());
    v_titulo := coalesce(nullif(btrim(coalesce(p_titulo, '')), ''), v_conteudo.titulo);
    v_url := nullif(btrim(coalesce(p_url, '')), '');

    if length(v_titulo) not between 1 and 200 then
        raise exception 'Título inválido';
    end if;

    -- O texto livre do revisor tem prioridade. Caso contrário, mantemos a
    -- descrição da IA e anexamos a estrutura de módulos/aulas da ementa.
    if nullif(btrim(coalesce(p_descricao, '')), '') is not null then
        v_descricao := btrim(p_descricao);
    else
        v_descricao := coalesce(
            nullif(v_conteudo.conteudo ->> 'descricao', ''),
            'Conteúdo gerado pelo Tutor-Sulsafe. Revise e detalhe antes de publicar.'
        );

        for v_modulo in
            select modulo
              from jsonb_array_elements(
                  coalesce(v_conteudo.conteudo -> 'modulos', '[]'::jsonb)
              ) as md(modulo)
        loop
            v_bloco := format(
                'Módulo: %s',
                coalesce(nullif(v_modulo ->> 'titulo', ''), 'Sem título')
            );

            if coalesce(nullif(v_modulo ->> 'descricao', ''), '') <> '' then
                v_bloco := v_bloco || E'\n' || (v_modulo ->> 'descricao');
            end if;

            for v_aula in
                select aula
                  from jsonb_array_elements(
                      coalesce(v_modulo -> 'aulas', '[]'::jsonb)
                  ) as ad(aula)
            loop
                v_bloco := v_bloco || E'\n• ' || coalesce(nullif(v_aula ->> 'titulo', ''), 'Aula');
                if coalesce(nullif(v_aula ->> 'descricao', ''), '') <> '' then
                    v_bloco := v_bloco || ' — ' || (v_aula ->> 'descricao');
                end if;
            end loop;

            v_ementa := v_ementa || case when v_ementa = '' then '' else E'\n\n' end || v_bloco;
        end loop;

        if v_ementa <> '' then
            v_descricao := v_descricao || E'\n\nEmenta aprovada:\n' || v_ementa;
        end if;
    end if;

    if p_destino = 'VIDEOAULA' then
        insert into public.videoaulas (nr_id, titulo, descricao, url_video, ordem, publico)
        values (p_nr_id, v_titulo, v_descricao, v_url, 0, false)
        returning id into v_entidade_id;
    else
        if v_url is null then
            raise exception 'Material requer uma URL (p_url)';
        end if;

        insert into public.materiais (nr_id, titulo, descricao, url, tipo, criado_por, publico)
        values (p_nr_id, v_titulo, v_descricao, v_url, 'ia_tutor', v_aprovador, false)
        returning id into v_entidade_id;
    end if;

    update public.ia_conteudos c
       set conteudo = c.conteudo
            || jsonb_build_object(
                'materializado_tipo', p_destino,
                'materializado_id', v_entidade_id,
                'materializado_em', now(),
                'materializado_nr_id', p_nr_id,
                'materializado_por', auth.uid(),
                'materializado_destino', 'INTERNO'
            )
     where c.id = p_conteudo_id;

    return jsonb_build_object(
        'conteudo_id', p_conteudo_id,
        'destino', p_destino,
        'entidade_id', v_entidade_id,
        'nr_id', p_nr_id,
        'titulo', v_titulo,
        'publico', false,
        'materializado_em', now()
    );
end;
$$;

revoke all on function public.sulsafe_materializar_rascunho_tutor(uuid, integer, text, text, text, text)
    from public, anon;
grant execute on function public.sulsafe_materializar_rascunho_tutor(uuid, integer, text, text, text, text)
    to authenticated;

comment on function public.sulsafe_materializar_rascunho_tutor(uuid, integer, text, text, text, text) is
    'Transforma um rascunho aprovado do Tutor em videoaula/material com a ementa completa. Cria publico=false; a distribuição é uma decisão Posterior.';

-- ------------------------------------------------------------
-- 2. DIRECIONAMENTO PARA TURMA / TRILHA / ALUNO INDIVIDUAL
-- ------------------------------------------------------------

create or replace function public.sulsafe_direcionar_conteudo_tutor(
    p_conteudo_id uuid,
    p_turma_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conteudo public.ia_conteudos%rowtype;
    v_tipo text;
    v_entidade_id uuid;
    v_turma_id uuid;
    v_nome text;
    v_turmas jsonb := '[]'::jsonb;
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem direcionar conteúdo de I.A';
    end if;

    if coalesce(array_length(p_turma_ids, 1), 0) = 0 then
        raise exception 'Selecione ao menos uma turma, trilha ou atendimento individual';
    end if;

    select * into v_conteudo
      from public.ia_conteudos c
     where c.id = p_conteudo_id;

    if not found then
        raise exception 'Rascunho de I.A. não encontrado';
    end if;

    if not public.sulsafe_is_admin()
       and v_conteudo.empresa_id is distinct from public.sulsafe_empresa_id() then
        raise exception 'Este rascunho pertence a outra empresa';
    end if;

    v_tipo := nullif(v_conteudo.conteudo ->> 'materializado_tipo', '');
    v_entidade_id := nullif(v_conteudo.conteudo ->> 'materializado_id', '')::uuid;

    if v_tipo is null or v_entidade_id is null then
        raise exception 'Materialize o rascunho antes de direcioná-lo';
    end if;

    foreach v_turma_id in array coalesce(p_turma_ids, '{}'::uuid[])
    loop
        if not public.sulsafe_gerencia_turma(v_turma_id) then
            raise exception 'Turma inválida ou sem permissão para direcionar conteúdo';
        end if;

        insert into public.turma_materiais (turma_id, material_id, videoaula_id, professor_id)
        values (
            v_turma_id,
            case when v_tipo = 'MATERIAL' then v_entidade_id end,
            case when v_tipo = 'VIDEOAULA' then v_entidade_id end,
            auth.uid()
        )
        on conflict do nothing;

        select nome into v_nome from public.turmas where id = v_turma_id;
        v_turmas := v_turmas || jsonb_build_object(
            'id', v_turma_id,
            'nome', coalesce(v_nome, 'Turma')
        );
    end loop;

    update public.ia_conteudos c
       set conteudo = c.conteudo || jsonb_build_object(
            'materializado_destino', 'TURMA',
            'materializado_turmas', v_turmas,
            'direcionado_por', auth.uid(),
            'direcionado_em', now()
       )
     where c.id = p_conteudo_id;

    return jsonb_build_object(
        'conteudo_id', p_conteudo_id,
        'entidade_id', v_entidade_id,
        'destino', 'TURMA',
        'turmas', v_turmas
    );
end;
$$;

revoke all on function public.sulsafe_direcionar_conteudo_tutor(uuid, uuid[]) from public, anon;
grant execute on function public.sulsafe_direcionar_conteudo_tutor(uuid, uuid[]) to authenticated;

comment on function public.sulsafe_direcionar_conteudo_tutor(uuid, uuid[]) is
    ' vincula o conteúdo materializado pelo Tutor a turmas, trilhas ou atendimentos individuais. O conteúdo segue publico=false e aparece para os alunos em Meus Cursos/Trilhas.';

-- ------------------------------------------------------------
-- 3. PUBLICAÇÃO NO CATÁLOGO DA NR (LIBERAÇÃO PARA TODOS)
-- ------------------------------------------------------------

create or replace function public.sulsafe_publicar_conteudo_tutor(
    p_conteudo_id uuid,
    p_publico boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conteudo public.ia_conteudos%rowtype;
    v_tipo text;
    v_entidade_id uuid;
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem publicar conteúdo de I.A';
    end if;

    select * into v_conteudo
      from public.ia_conteudos c
     where c.id = p_conteudo_id;

    if not found then
        raise exception 'Rascunho de I.A. não encontrado';
    end if;

    if not public.sulsafe_is_admin()
       and v_conteudo.empresa_id is distinct from public.sulsafe_empresa_id() then
        raise exception 'Este rascunho pertence a outra empresa';
    end if;

    if not v_conteudo.aprovado or v_conteudo.rejeitado then
        raise exception 'Aprove o rascunho antes de publicá-lo';
    end if;

    v_tipo := nullif(v_conteudo.conteudo ->> 'materializado_tipo', '');
    v_entidade_id := nullif(v_conteudo.conteudo ->> 'materializado_id', '')::uuid;

    if v_tipo is null or v_entidade_id is null then
        raise exception 'Materialize o rascunho antes de publicá-lo';
    end if;

    if v_tipo = 'VIDEOAULA' then
        update public.videoaulas
           set publico = p_publico
         where id = v_entidade_id;
    else
        update public.materiais
           set publico = p_publico
         where id = v_entidade_id;
    end if;

    update public.ia_conteudos c
       set conteudo = c.conteudo || jsonb_build_object(
            'materializado_destino', case when p_publico then 'GLOBAL' else 'INTERNO' end,
            'publico', p_publico,
            'publicado_por_conteudo', auth.uid(),
            'publicado_em_conteudo', now()
       ),
       publicado = p_publico,
       publicado_por = case when p_publico then auth.uid() else null end,
       publicado_em = case when p_publico then now() else null end
     where c.id = p_conteudo_id;

    return jsonb_build_object(
        'conteudo_id', p_conteudo_id,
        'entidade_id', v_entidade_id,
        'destino', case when p_publico then 'GLOBAL' else 'INTERNO' end,
        'publico', p_publico
    );
end;
$$;

revoke all on function public.sulsafe_publicar_conteudo_tutor(uuid, boolean) from public, anon;
grant execute on function public.sulsafe_publicar_conteudo_tutor(uuid, boolean) to authenticated;

comment on function public.sulsafe_publicar_conteudo_tutor(uuid, boolean) is
    'Libera (ou reverte) no catálogo da NR o conteúdo materializado pelo Tutor. Só executa após aprovação humana e grava quem decidiu.';
