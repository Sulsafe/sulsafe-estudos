-- ============================================================
-- TUTOR-SULSAFE — MATERIALIZAÇÃO HUMAN-IN-THE-LOOP
-- ============================================================
-- O Tutor gera rascunhos em ia_conteudos. Nada aparece para o aluno até que
-- um ADMIN/PROFESSOR aprove E materialize o rascunho em entidades reais da
-- SulSafe (videoaulas ou materiais), sempre com nr_id do catálogo de 38 NRs.
--
-- Não existe tabela "cursos" na SulSafe: o curso é a NR. Por isso a saída do
-- adaptador vira videoaula/material/prova direcionada, não um curso abstrato.
--
-- Decisões:
--   * A materialização é explícita e auditável (quando, por quem, para qual NR).
--   * Um conteúdo só pode ser materializado uma vez (evita duplicatas).
--   * A API recebe só o id do rascunho e o destino; o texto vem do banco.
--   * RLS + RPC SECURITY DEFINER com search_path ''.

-- ------------------------------------------------------------
-- 1. LEITURA DE RASCUNHOS PARA REVISÃO (ADMIN/PROFESSOR)
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_rascunhos_tutor(
    p_job_id uuid default null
)
returns table (
    id uuid,
    job_id uuid,
    tipo text,
    titulo text,
    conteudo jsonb,
    aprovado boolean,
    rejeitado boolean,
    publicado boolean,
    aprovado_por uuid,
    aprovado_em timestamptz,
    criado_por uuid,
    criado_em timestamptz,
    materializado_tipo text,
    materializado_id uuid,
    materializado_em timestamptz,
    materializado_nr_id integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou sessão inválida';
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem revisar rascunhos';
    end if;

    return query
    select c.id,
           c.job_id,
           c.tipo,
           c.titulo,
           c.conteudo,
           c.aprovado,
           c.rejeitado,
           c.publicado,
           c.aprovado_por,
           c.aprovado_em,
           c.criado_por,
           c.criado_em,
           c.conteudo ->> 'materializado_tipo' as materializado_tipo,
           nullif(c.conteudo ->> 'materializado_id', '')::uuid as materializado_id,
           nullif(c.conteudo ->> 'materializado_em', '')::timestamptz as materializado_em,
           nullif(c.conteudo ->> 'materializado_nr_id', '')::integer as materializado_nr_id
      from public.ia_conteudos c
     where (p_job_id is null or c.job_id = p_job_id)
       and (
            public.sulsafe_is_admin()
            or c.empresa_id is not distinct from public.sulsafe_empresa_id()
       )
     order by c.criado_em desc;
end;
$$;

revoke all on function public.sulsafe_listar_rascunhos_tutor(uuid) from public, anon;
grant execute on function public.sulsafe_listar_rascunhos_tutor(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. MATERIALIZAÇÃO
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
    v_descricao := coalesce(
        nullif(btrim(coalesce(p_descricao, '')), ''),
        nullif(v_conteudo.conteudo ->> 'descricao', ''),
        'Conteúdo gerado pelo Tutor-Sulsafe. Revise e detalhe antes de publicar.'
    );
    v_url := nullif(btrim(coalesce(p_url, '')), '');

    if length(v_titulo) not between 1 and 200 then
        raise exception 'Título inválido';
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
                'materializado_por', auth.uid()
            )
     where c.id = p_conteudo_id;
    -- Não marcamos `publicado` aqui: materializar cria a entidade como
    -- publico = false. A liberação para alunos continua sendo uma decisão
    -- humana explícita e separada (RPC de revisão / publicação).

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
    'Transforma um rascunho aprovado do Tutor-Sulsafe em videoaula/material. Cria com publico=false: a liberação para alunos é uma decisão humana posterior.';
