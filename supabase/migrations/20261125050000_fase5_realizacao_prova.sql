-- ============================================================
-- FASE 5 (ETAPA 6/8) — REALIZAÇÃO E CORREÇÃO AUTOMÁTICA
-- ============================================================
-- Escopo desta migration (forward-only; nenhuma migration aplicada é editada):
--   1. RPC de leitura do cabeçalho e das questões, restrita a aluno com entrega
--      registrada na Etapa 5. Nenhuma coluna de gabarito é retornada.
--   2. RPC de submissão que valida aluno/empresa/distribuição, corrige com
--      peso por questão e grava nota em provas_progresso via SECURITY DEFINER.
--   3. Auditoria da submissão sem expor gabarito/justificativa no motivo.
--
-- O gabarito continua legível somente pela RPC de correção e por service_role.
-- Nenhuma chave de API participa destas funções.
-- ============================================================

-- ------------------------------------------------------------
-- 1. AUTORIZAÇÃO DO ALUNO (ENTREGA REAL DA ETAPA 5)
-- ------------------------------------------------------------

create or replace function public.sulsafe_prova_entregue_aluno_ia(p_prova_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_conta_ativa()
       and exists (
            select 1
              from public.profiles p
             where p.id = auth.uid()
               and p.role::text = 'aluno'
               and p.status = 'ativo'
       )
       and exists (
            select 1
              from public.provas_direcionadas pd
             where pd.id = p_prova_id
               and pd.publicado
               and public.sulsafe_prova_empresa_id(pd.id) is not null
               and public.sulsafe_prova_empresa_id(pd.id) = public.sulsafe_empresa_id()
               and exists (
                   select 1
                     from public.provas_distribuicoes d
                    where d.prova_id = pd.id
                      and d.aluno_id = auth.uid()
               )
       );
$$;

revoke all on function public.sulsafe_prova_entregue_aluno_ia(uuid) from public, anon;
grant execute on function public.sulsafe_prova_entregue_aluno_ia(uuid) to authenticated;

comment on function public.sulsafe_prova_entregue_aluno_ia(uuid) is
    'Etapa 6: somente aluno ativo, da empresa da prova, com vínculo real em provas_distribuicoes.';

-- ------------------------------------------------------------
-- 2. CABEÇALHO DE CONTEXTO (METADADOS, SEM QUESTÕES)
-- ------------------------------------------------------------

create or replace function public.sulsafe_carregar_cabecalho_prova_aluno_ia(p_prova_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    if not public.sulsafe_prova_entregue_aluno_ia(p_prova_id) then
        raise exception 'Somente alunos com prova distribuída podem visualizar esta avaliação';
    end if;

    select jsonb_build_object(
               'prova_id', pd.id,
               'titulo', pd.titulo,
               'aluno_nome', p.nome_completo,
               'data', to_char(coalesce(d.distribuido_em, now()), 'DD/MM/YYYY'),
               'tempo_estimado_minutos', coalesce(nullif(c.conteudo ->> 'tempo_estimado_minutos', '')::integer, 60),
               'nota_minima', nullif(c.conteudo ->> 'nota_minima', '')::numeric,
               'instrucoes', coalesce(
                   nullif(c.conteudo ->> 'instrucoes', ''),
                   format(
                       'Esta prova contém %s questões. Ao finalizar, sua nota será calculada automaticamente.',
                       (select count(*) from public.provas_questoes q where q.prova_id = pd.id)
                   )
               ),
               'quantidade_questoes', (select count(*)::integer from public.provas_questoes q where q.prova_id = pd.id)
           )
      into v_resultado
      from public.provas_direcionadas pd
      join public.profiles p on p.id = auth.uid()
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
      left join public.provas_distribuicoes d on d.prova_id = pd.id and d.aluno_id = auth.uid()
     where pd.id = p_prova_id
     limit 1;

    return v_resultado;
end;
$$;

revoke all on function public.sulsafe_carregar_cabecalho_prova_aluno_ia(uuid) from public, anon;
grant execute on function public.sulsafe_carregar_cabecalho_prova_aluno_ia(uuid) to authenticated;

comment on function public.sulsafe_carregar_cabecalho_prova_aluno_ia(uuid) is
    'Cabeçalho do aluno: título, aluno, data, tempo, nota mínima e instruções. Nunca inclui gabarito.';

-- ------------------------------------------------------------
-- 2b. LISTA DE AVALIAÇÕES DISPONÍVEIS PARA O ALUNO
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_provas_aluno_ia()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    if not public.sulsafe_conta_ativa()
       or not exists (
            select 1 from public.profiles p
             where p.id = auth.uid() and p.role::text = 'aluno' and p.status = 'ativo'
       ) then
        return '[]'::jsonb;
    end if;

    select coalesce(
               jsonb_agg(
                   jsonb_build_object(
                       'prova_id', pd.id,
                       'titulo', pd.titulo,
                       'descricao', pd.descricao,
                       'nr_id', pd.nr_id,
                       'distribuido_em', d.distribuido_em
                   )
                   order by d.distribuido_em desc
               ),
               '[]'::jsonb
           )
      into v_resultado
      from public.provas_distribuicoes d
      join public.provas_direcionadas pd on pd.id = d.prova_id
     where d.aluno_id = auth.uid()
       and pd.publicado
       and public.sulsafe_prova_empresa_id(pd.id) is not null
       and public.sulsafe_prova_empresa_id(pd.id) = public.sulsafe_empresa_id();

    return coalesce(v_resultado, '[]'::jsonb);
end;
$$;

revoke all on function public.sulsafe_listar_provas_aluno_ia() from public, anon;
grant execute on function public.sulsafe_listar_provas_aluno_ia() to authenticated;

comment on function public.sulsafe_listar_provas_aluno_ia() is
    'Lista só as avaliações entregues ao aluno. Nunca inclui questões, gabarito ou justificativa.';

-- ------------------------------------------------------------
-- 3. QUESTÕES SEM GABARITO
-- ------------------------------------------------------------

create or replace function public.sulsafe_carregar_prova_aluno_ia(p_prova_id uuid)
returns table (id uuid, ordem integer, enunciado text, alternativas jsonb, peso numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_prova_entregue_aluno_ia(p_prova_id) then
        raise exception 'Somente alunos com prova distribuída podem visualizar as questões';
    end if;

    return query
        select q.id, q.ordem, q.enunciado, q.alternativas, q.peso
          from public.provas_questoes q
         where q.prova_id = p_prova_id
         order by q.ordem;
end;
$$;

revoke all on function public.sulsafe_carregar_prova_aluno_ia(uuid) from public, anon;
grant execute on function public.sulsafe_carregar_prova_aluno_ia(uuid) to authenticated;

comment on function public.sulsafe_carregar_prova_aluno_ia(uuid) is
    'Leitura do aluno: apenas enunciado, alternativas, ordem e peso. gabarito/justificativa permanecem inacessíveis.';

-- ------------------------------------------------------------
-- 4. SUBMISSÃO E CORREÇÃO AUTOMÁTICA
-- ------------------------------------------------------------

create or replace function public.sulsafe_submeter_prova_aluno_ia(p_prova_id uuid, p_respostas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item jsonb;
    v_questao_id uuid;
    v_alternativa text;
    v_correta text;
    v_alternativas jsonb;
    v_peso numeric;
    v_vistas uuid[] := '{}'::uuid[];
    v_total numeric := 0;
    v_nota numeric := 0;
    v_acertos integer := 0;
    v_quantidade integer;
    v_status text;
begin
    if not public.sulsafe_prova_entregue_aluno_ia(p_prova_id) then
        raise exception 'Somente alunos com prova distribuída podem submeter respostas';
    end if;

    if jsonb_typeof(p_respostas) <> 'array' or jsonb_array_length(p_respostas) = 0 then
        raise exception 'Informe as respostas da prova';
    end if;

    select count(*)::integer into v_quantidade
      from public.provas_questoes q
     where q.prova_id = p_prova_id;

    for v_item in select value from jsonb_array_elements(p_respostas)
    loop
        if jsonb_typeof(v_item) <> 'object' then
            raise exception 'Resposta inválida';
        end if;

        v_questao_id := nullif(btrim(coalesce(v_item ->> 'questao_id', '')), '')::uuid;
        v_alternativa := upper(btrim(coalesce(v_item ->> 'alternativa', '')));

        if v_questao_id is null or v_alternativa not in ('A', 'B', 'C', 'D', 'E') then
            raise exception 'Questão ou alternativa inválida';
        end if;
        if v_questao_id = any(v_vistas) then
            raise exception 'Questão respondida mais de uma vez';
        end if;

        select q.peso, q.gabarito ->> 'resposta_correta', q.alternativas
          into v_peso, v_correta, v_alternativas
          from public.provas_questoes q
         where q.id = v_questao_id
           and q.prova_id = p_prova_id;

        if not found then
            raise exception 'Questão não pertence a esta prova';
        end if;
        if not exists (
            select 1
              from jsonb_array_elements(v_alternativas) a
             where a ->> 'chave' = v_alternativa
        ) then
            raise exception 'Alternativa inexistente para esta questão';
        end if;

        v_total := v_total + v_peso;
        if v_correta = v_alternativa then
            v_nota := v_nota + v_peso;
            v_acertos := v_acertos + 1;
        end if;
        v_vistas := v_vistas || v_questao_id;
    end loop;

    if cardinality(v_vistas) <> v_quantidade then
        raise exception 'Responda todas as questões antes de finalizar';
    end if;

    insert into public.provas_progresso (prova_id, aluno_id, status, nota)
    values (p_prova_id, auth.uid(), 'CONCLUIDA', v_nota)
    on conflict (prova_id, aluno_id) do update
        set status = 'CONCLUIDA',
            nota = excluded.nota,
            concluido_em = now(),
            atualizado_em = now();

    v_status := 'CONCLUIDA';

    insert into public.provas_revisao_auditoria (prova_id, conteudo_id, acao, motivo, actor_id)
    select pd.id, pd.ia_conteudo_id, 'SUBMETIDO',
           format('Correção automática: %s de %s pontos', v_nota, v_total), auth.uid()
      from public.provas_direcionadas pd
     where pd.id = p_prova_id;

    return jsonb_build_object(
        'nota', v_nota,
        'total', v_total,
        'acertos', v_acertos,
        'quantidade_questoes', v_quantidade,
        'status', v_status
    );
end;
$$;

revoke all on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) from public, anon;
grant execute on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) to authenticated;

comment on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) is
    'Corrige respostas objetivas por peso, grava nota/status em provas_progresso e devolve soma nota/acertos.';

-- ------------------------------------------------------------
-- 5. AUDITORIA: NOVA AÇÃO DE SUBMISSÃO
-- ------------------------------------------------------------

do $$
declare
    r record;
begin
    for r in
        select conname
          from pg_constraint
         where conrelid = 'public.provas_revisao_auditoria'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) like '%acao%'
    loop
        execute format('alter table public.provas_revisao_auditoria drop constraint %I', r.conname);
    end loop;
end;
$$;

alter table public.provas_revisao_auditoria
    add constraint provas_revisao_auditoria_acao_check
    check (acao in ('APROVADO', 'REJEITADO', 'EDITADO', 'DISTRIBUIDO', 'INTERNO', 'SUBMETIDO'));
