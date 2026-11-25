-- ============================================================
-- FASE 5 (ETAPA 3/8) — GERAÇÃO DE PROVAS/MÓDULOS PELO TUTOR
-- ============================================================
-- Escopo desta migration (forward-only; nenhuma migration aplicada é editada):
--   1. RPCs de job/rascunho aceitam os tipos PROVA e MODULO já presentes nos
--      CHECK das tabelas desde a Etapa 1.
--   2. sulsafe_materializar_prova_ia ganha modo RASCUNHO_IA: o worker
--      (service_role) materializa a prova aprovada por ninguém, mantendo
--      publicado = false. O modo padrão APROVADO continua exigindo revisão
--      humana, exatamente como na Etapa 2.
--   3. RPC de leitura da fila HITL: só admin/professor, só a própria empresa,
--      sem devolver conteudo, gabarito ou justificativa.
--
-- Nenhuma chave de API participa destas funções. Videoaulas, materiais e o
-- fluxo do Tutor homologado não são alterados.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CRIAÇÃO DE JOBS — novos tipos
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

    if p_tipo is null or p_tipo not in
        ('MATERIA', 'CURSO', 'PALESTRA', 'AVALIACAO', 'MATERIAL', 'PROVA', 'MODULO') then
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

revoke all on function public.sulsafe_criar_ia_job(text, text, text, uuid, text) from public, anon;
grant execute on function public.sulsafe_criar_ia_job(text, text, text, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 2. RASCUNHO — o worker pode salvar provas e módulos
-- ------------------------------------------------------------

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
    if p_tipo is null or p_tipo not in
        ('MATERIA', 'CURSO', 'MODULO', 'AULA', 'QUESTAO', 'PALESTRA', 'MATERIAL', 'PROVA') then
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

revoke all on function public.sulsafe_salvar_ia_conteudo(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.sulsafe_salvar_ia_conteudo(uuid, text, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- 3. MATERIALIZAÇÃO — modo RASCUNHO_IA exclusivo do worker
-- ------------------------------------------------------------
-- A assinatura antiga (uuid) é substituída por (uuid, text default 'APROVADO'),
-- preservando todas as chamadas existentes. No modo APROVADO nada muda em
-- relação à Etapa 2. No modo RASCUNHO_IA somente um JWT service_role pode
-- materializar, e a prova continua publicado = false aguardando revisão.

drop function if exists public.sulsafe_materializar_prova_ia(uuid);

create or replace function public.sulsafe_materializar_prova_ia(
    p_conteudo_id uuid,
    p_modo text default 'APROVADO'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_modo text := upper(coalesce(btrim(p_modo), 'APROVADO'));
    v_worker boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
    v_conteudo public.ia_conteudos%rowtype;
    v_prova_id uuid;
    v_questoes jsonb;
    v_questao jsonb;
    v_chaves jsonb;
    v_resposta text;
    v_nr_id integer;
    v_ordem integer := 0;
begin
    if v_modo not in ('APROVADO', 'RASCUNHO_IA') then
        raise exception 'Modo de materialização inválido';
    end if;

    if v_modo = 'RASCUNHO_IA' and not v_worker then
        raise exception 'A materialização de rascunho é exclusiva do worker';
    end if;

    if v_modo = 'APROVADO' then
        if not public.sulsafe_conta_ativa() then
            raise exception 'Conta inativa ou sessão inválida';
        end if;

        if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
            raise exception 'Somente administradores e professores podem materializar provas';
        end if;
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

    if v_modo = 'APROVADO' then
        if not public.sulsafe_is_admin()
           and v_conteudo.empresa_id is distinct from public.sulsafe_empresa_id() then
            raise exception 'Este rascunho pertence a outra empresa';
        end if;

        if not v_conteudo.aprovado or v_conteudo.rejeitado then
            raise exception 'Aprove o rascunho antes de materializá-lo';
        end if;
    else
        if v_conteudo.rejeitado then
            raise exception 'Rascunho rejeitado não pode ser materializado';
        end if;

        if coalesce(v_conteudo.conteudo ->> 'origem', '') is distinct from 'TUTOR_SULSAFE' then
            raise exception 'Somente rascunhos gerados pelo Tutor podem ser materializados pelo worker';
        end if;
    end if;

    if v_conteudo.conteudo ? 'materializado_id' then
        raise exception 'Este rascunho já foi materializado';
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
            coalesce(v_conteudo.aprovado_por, auth.uid(), v_conteudo.criado_por),
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
               'materializado_por', coalesce(auth.uid(), v_conteudo.criado_por)
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

revoke all on function public.sulsafe_materializar_prova_ia(uuid, text) from public, anon;
grant execute on function public.sulsafe_materializar_prova_ia(uuid, text) to authenticated, service_role;

comment on function public.sulsafe_materializar_prova_ia(uuid, text) is
    'Cria prova (publicado=false) e questões em uma transação. APROVADO exige revisão humana; RASCUNHO_IA é exclusivo do worker.';

-- ------------------------------------------------------------
-- 4. FILA HITL — somente metadados, nunca o conteudo/gabarito cru
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_provas_pendentes_ia()
returns table (
    conteudo_id uuid,
    prova_id uuid,
    job_id uuid,
    titulo text,
    descricao text,
    nr_id integer,
    quantidade_questoes integer,
    publicado boolean,
    aprovado boolean,
    rejeitado boolean,
    criado_em timestamptz
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
        raise exception 'Somente administradores e professores podem revisar provas';
    end if;

    return query
    select c.id,
           pd.id,
           c.job_id,
           c.titulo,
           nullif(c.conteudo ->> 'descricao', ''),
           nullif(c.conteudo ->> 'nr_id', '')::integer,
           jsonb_array_length(coalesce(c.conteudo -> 'questoes', '[]'::jsonb)),
           coalesce(pd.publicado, false),
           c.aprovado,
           c.rejeitado,
           c.criado_em
      from public.ia_conteudos c
      left join public.provas_direcionadas pd on pd.ia_conteudo_id = c.id
     where c.tipo = 'PROVA'
       and coalesce(c.conteudo ->> 'origem', '') = 'TUTOR_SULSAFE'
       and not c.aprovado
       and not c.rejeitado
       and (public.sulsafe_is_admin() or c.empresa_id is not distinct from public.sulsafe_empresa_id())
     order by c.criado_em desc;
end;
$$;

revoke all on function public.sulsafe_listar_provas_pendentes_ia() from public, anon;
grant execute on function public.sulsafe_listar_provas_pendentes_ia() to authenticated;

comment on function public.sulsafe_listar_provas_pendentes_ia() is
    'Fila de aprovação do HITL. Nunca devolve conteudo, gabarito ou justificativa.';

-- Fim da Etapa 3/8.
