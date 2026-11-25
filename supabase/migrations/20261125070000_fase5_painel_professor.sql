-- ============================================================
-- FASE 5 (ETAPA 7/8) — PAINEL DE ACOMPANHAMENTO DO PROFESSOR
-- ============================================================
-- Escopo desta migration (forward-only; nenhuma migration aplicada é editada):
--   1. Classificação explícita de questão objetiva/discursiva e tabela de
--      respostas do aluno, com RLS (somente leitura; toda escrita via RPC).
--   2. RPC de listagem de resultados por aluno (sem gabarito) e RPC de
--      detalhe com gabarito, restritas a professor/admin da empresa da prova.
--   3. Correção manual de discursiva com recálculo de nota, conclusão quando
--      todas as discursivas são corrigidas e auditoria sem expor gabarito.
--   4. Extensão da submissão da Etapa 6 para persistir respostas e manter
--      provas com discursiva em EM_ANDAMENTO até a correção manual.
--
-- Nenhuma chave de API participa destas funções. service_role não é usado
-- pelas rotas HTTP: o JWT do chamador é sempre propagado pelo cliente anônimo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TIPO DA QUESTÃO
-- ------------------------------------------------------------

alter table public.provas_questoes
    add column if not exists tipo text not null default 'OBJETIVA'
        check (tipo in ('OBJETIVA', 'DISCURSIVA'));

comment on column public.provas_questoes.tipo is
    'OBJETIVA: correção automática pelo gabarito. DISCURSIVA: texto livre corrigido manualmente pelo professor (Etapa 7).';

-- ------------------------------------------------------------
-- 2. RESPOSTAS DO ALUNO
-- ------------------------------------------------------------
-- Uma linha por (prova, aluno, questão). nota_manual só é preenchida pela
-- RPC de correção; o aluno nunca escreve diretamente nesta tabela.

create table if not exists public.provas_respostas_aluno (
    id uuid primary key default gen_random_uuid(),
    prova_id uuid not null
        references public.provas_direcionadas (id) on delete cascade,
    aluno_id uuid not null
        references public.profiles (id) on delete cascade,
    questao_id uuid not null
        references public.provas_questoes (id) on delete cascade,
    alternativa text check (alternativa in ('A', 'B', 'C', 'D', 'E')),
    texto_resposta text check (texto_resposta is null or length(btrim(texto_resposta)) <= 4000),
    nota_manual numeric(4,2)
        check (nota_manual is null or (nota_manual >= 0 and nota_manual <= 10)),
    corrigido_por uuid references public.profiles (id) on delete set null,
    corrigido_em timestamptz,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint provas_respostas_aluno_unica unique (prova_id, aluno_id, questao_id)
);

create index if not exists provas_respostas_aluno_prova_idx
    on public.provas_respostas_aluno (prova_id, aluno_id);

alter table public.provas_respostas_aluno enable row level security;

revoke all on public.provas_respostas_aluno from public, anon, authenticated;
grant select on public.provas_respostas_aluno to authenticated;

drop policy if exists "sulsafe_provas_respostas_aluno_select" on public.provas_respostas_aluno;
create policy "sulsafe_provas_respostas_aluno_select"
on public.provas_respostas_aluno
for select to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        public.sulsafe_prova_gerenciada(prova_id)
        or (
            aluno_id = auth.uid()
            and public.sulsafe_prova_empresa_id(prova_id) is not distinct from public.sulsafe_empresa_id()
        )
    )
);

comment on table public.provas_respostas_aluno is
    'Respostas enviadas pelo aluno. Escrita exclusiva via RPC de submissão/correção; nota_manual é atribuída só pelo professor.';

-- ------------------------------------------------------------
-- 3. AUDITORIA: AÇÃO DE CORREÇÃO MANUAL
-- ------------------------------------------------------------
-- A migration da Etapa 6 recria o CHECK de acao; aqui ele é ampliado uma
-- única vez, sem tocar em migration já aplicada.

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
    check (acao in (
        'APROVADO', 'REJEITADO', 'EDITADO', 'DISTRIBUIDO', 'INTERNO',
        'SUBMETIDO', 'CORRIGIDO_MANUAL'
    ));

-- ------------------------------------------------------------
-- 4. LISTAGEM DE RESULTADOS (PROFESSOR/ADMIN DA EMPRESA)
-- ------------------------------------------------------------
-- Sem gabarito, sem justificativa e sem alternativas: o painel só precisa
-- de identificação, status, nota e data de conclusão.

create or replace function public.sulsafe_listar_resultados_prova_ia(p_prova_id uuid)
returns table (
    aluno_id uuid,
    nome_completo text,
    status text,
    nota numeric,
    concluido_em timestamptz,
    possui_discursiva boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    -- Falha fechada: prova de outra empresa/devolutiva sem vínculo => lista vazia.
    if not public.sulsafe_prova_gerenciada(p_prova_id) then
        return;
    end if;

    return query
        select d.aluno_id,
               coalesce(p.nome_completo, '')::text as nome_completo,
               coalesce(pr.status::text, 'PENDENTE')::text as status,
               pr.nota,
               pr.concluido_em,
               exists (
                   select 1
                     from public.provas_questoes q
                    where q.prova_id = d.prova_id
                      and q.tipo = 'DISCURSIVA'
               ) as possui_discursiva
          from public.provas_distribuicoes d
          join public.profiles p on p.id = d.aluno_id
          left join public.provas_progresso pr
                 on pr.prova_id = d.prova_id
                and pr.aluno_id = d.aluno_id
         where d.prova_id = p_prova_id
         order by coalesce(p.nome_completo, ''), d.aluno_id;
end;
$$;

revoke all on function public.sulsafe_listar_resultados_prova_ia(uuid) from public, anon;
grant execute on function public.sulsafe_listar_resultados_prova_ia(uuid) to authenticated;

comment on function public.sulsafe_listar_resultados_prova_ia(uuid) is
    'Etapa 7: resultados da prova para professor/admin da mesma empresa, sem gabarito nem justificativa.';

-- ------------------------------------------------------------
-- 5. DETALHE DO ALUNO (GABARITO SOMENTE PARA O PROFESSOR)
-- ------------------------------------------------------------

create or replace function public.sulsafe_detalhe_resultado_prova_ia(
    p_prova_id uuid,
    p_aluno_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_resultado jsonb;
    v_status text;
    v_nota numeric;
    v_concluido_em timestamptz;
begin
    if not public.sulsafe_prova_gerenciada(p_prova_id)
       or not public.sulsafe_acessa_aluno(p_aluno_id)
       or not exists (
            select 1
              from public.provas_distribuicoes d
             where d.prova_id = p_prova_id
               and d.aluno_id = p_aluno_id
       ) then
        raise exception 'Sem permissão para visualizar o resultado deste aluno';
    end if;

    select coalesce(pr.status::text, 'PENDENTE'), pr.nota, pr.concluido_em
      into v_status, v_nota, v_concluido_em
      from public.provas_progresso pr
     where pr.prova_id = p_prova_id
       and pr.aluno_id = p_aluno_id;

    select jsonb_build_object(
               'prova_id', p_prova_id,
               'aluno_id', p_aluno_id,
               'aluno_nome', (
                   select coalesce(p.nome_completo, '')
                     from public.profiles p
                    where p.id = p_aluno_id
               ),
               'status', coalesce(v_status, 'PENDENTE'),
               'nota', v_nota,
               'concluido_em', v_concluido_em,
               'possui_discursiva', exists (
                   select 1 from public.provas_questoes q
                    where q.prova_id = p_prova_id and q.tipo = 'DISCURSIVA'
               ),
               'questoes', coalesce((
                   select jsonb_agg(
                              jsonb_build_object(
                                  'id', q.id,
                                  'ordem', q.ordem,
                                  'enunciado', q.enunciado,
                                  'tipo', q.tipo,
                                  'peso', q.peso,
                                  'alternativas', q.alternativas,
                                  'resposta_aluno', case
                                      when q.tipo = 'DISCURSIVA'
                                          then coalesce(r.texto_resposta, '')
                                      else coalesce(r.alternativa, '')
                                  end,
                                  'nota_manual', r.nota_manual,
                                  'gabarito', q.gabarito
                              )
                              order by q.ordem
                          )
                     from public.provas_questoes q
                     left join public.provas_respostas_aluno r
                            on r.questao_id = q.id
                           and r.prova_id = q.prova_id
                           and r.aluno_id = p_aluno_id
                    where q.prova_id = p_prova_id
               ), '[]'::jsonb)
           )
      into v_resultado;

    return v_resultado;
end;
$$;

revoke all on function public.sulsafe_detalhe_resultado_prova_ia(uuid, uuid) from public, anon;
grant execute on function public.sulsafe_detalhe_resultado_prova_ia(uuid, uuid) to authenticated;

comment on function public.sulsafe_detalhe_resultado_prova_ia(uuid, uuid) is
    'Etapa 7: respostas, nota e gabarito do aluno somente para professor/admin da empresa da prova.';

-- ------------------------------------------------------------
-- 6. CORREÇÃO MANUAL DE DISCURSIVA
-- ------------------------------------------------------------

create or replace function public.sulsafe_corrigir_resposta_discursiva_ia(
    p_prova_id uuid,
    p_aluno_id uuid,
    p_questao_id uuid,
    p_nota numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_peso numeric;
    v_nota_final numeric;
    v_status public.prova_progresso_status;
    v_total_discursivas integer;
    v_corrigidas integer;
begin
    if not public.sulsafe_prova_gerenciada(p_prova_id)
       or not public.sulsafe_acessa_aluno(p_aluno_id)
       or not exists (
            select 1
              from public.provas_distribuicoes d
             where d.prova_id = p_prova_id
               and d.aluno_id = p_aluno_id
       ) then
        raise exception 'Sem permissão para corrigir este aluno';
    end if;

    select q.peso
      into v_peso
      from public.provas_questoes q
     where q.id = p_questao_id
       and q.prova_id = p_prova_id
       and q.tipo = 'DISCURSIVA';

    if not found then
        raise exception 'Questão discursiva inválida para esta prova';
    end if;

    if p_nota is null or p_nota < 0 or p_nota > v_peso then
        raise exception 'Nota inválida para esta questão';
    end if;

    insert into public.provas_respostas_aluno (
        prova_id, aluno_id, questao_id, nota_manual, corrigido_por, corrigido_em, atualizado_em
    )
    values (
        p_prova_id, p_aluno_id, p_questao_id, p_nota, auth.uid(), now(), now()
    )
    on conflict (prova_id, aluno_id, questao_id) do update
        set nota_manual = excluded.nota_manual,
            corrigido_por = excluded.corrigido_por,
            corrigido_em = excluded.corrigido_em,
            atualizado_em = now();

    select count(*)::integer
      into v_total_discursivas
      from public.provas_questoes q
     where q.prova_id = p_prova_id
       and q.tipo = 'DISCURSIVA';

    select count(*)::integer
      into v_corrigidas
      from public.provas_respostas_aluno r
      join public.provas_questoes q on q.id = r.questao_id
     where r.prova_id = p_prova_id
       and r.aluno_id = p_aluno_id
       and q.tipo = 'DISCURSIVA'
       and r.nota_manual is not null;

    select round(
               coalesce(sum(
                   case
                       when q.tipo = 'OBJETIVA' and r.alternativa = q.gabarito ->> 'resposta_correta'
                           then q.peso
                       else 0
                   end
               ), 0)
               + coalesce(sum(
                   case
                       when q.tipo = 'DISCURSIVA' then coalesce(r.nota_manual, 0)
                       else 0
                   end
               ), 0),
               2
           )
      into v_nota_final
      from public.provas_questoes q
      left join public.provas_respostas_aluno r
             on r.questao_id = q.id
            and r.prova_id = q.prova_id
            and r.aluno_id = p_aluno_id
     where q.prova_id = p_prova_id;

    v_status := case
        when v_corrigidas >= v_total_discursivas then 'CONCLUIDA'::public.prova_progresso_status
        else 'EM_ANDAMENTO'::public.prova_progresso_status
    end;

    insert into public.provas_progresso (prova_id, aluno_id, status, nota)
    values (p_prova_id, p_aluno_id, v_status, v_nota_final)
    on conflict (prova_id, aluno_id) do update
        set status = excluded.status,
            nota = excluded.nota,
            atualizado_em = now();

    insert into public.provas_revisao_auditoria (prova_id, conteudo_id, acao, motivo, actor_id)
    select pd.id, pd.ia_conteudo_id, 'CORRIGIDO_MANUAL',
           format('Questão %s corrigida com nota %s', p_questao_id, p_nota), auth.uid()
      from public.provas_direcionadas pd
     where pd.id = p_prova_id;

    return jsonb_build_object(
        'nota', v_nota_final,
        'status', v_status::text,
        'questao_id', p_questao_id,
        'nota_manual', p_nota
    );
end;
$$;

revoke all on function public.sulsafe_corrigir_resposta_discursiva_ia(uuid, uuid, uuid, numeric)
    from public, anon;
grant execute on function public.sulsafe_corrigir_resposta_discursiva_ia(uuid, uuid, uuid, numeric)
    to authenticated;

comment on function public.sulsafe_corrigir_resposta_discursiva_ia(uuid, uuid, uuid, numeric) is
    'Etapa 7: atribui nota manual à discursiva, recalcula a nota final e registra auditoria sem gabarito.';

-- ------------------------------------------------------------
-- 7. SUBMISSÃO COMPATÍVEL COM DISCURSIVAS (ETAPA 6 PRESERVADA)
-- ------------------------------------------------------------
-- Para provas só com objetivas, o comportamento homologado na Etapa 6
-- permanece idêntico (nota automática + CONCLUIDA). Com discursiva, a nota
-- parcial das objetivas é gravada e o status fica EM_ANDAMENTO até a correção.

create or replace function public.sulsafe_submeter_prova_aluno_ia(
    p_prova_id uuid,
    p_respostas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item jsonb;
    v_questao_id uuid;
    v_alternativa text;
    v_texto text;
    v_correta text;
    v_alternativas jsonb;
    v_peso numeric;
    v_tipo text;
    v_vistas uuid[] := '{}'::uuid[];
    v_total numeric := 0;
    v_nota numeric := 0;
    v_acertos integer := 0;
    v_quantidade integer;
    v_discursivas integer;
    v_status public.prova_progresso_status;
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

        if v_questao_id is null then
            raise exception 'Questão ou alternativa inválida';
        end if;
        if v_questao_id = any(v_vistas) then
            raise exception 'Questão respondida mais de uma vez';
        end if;

        select q.peso, q.gabarito ->> 'resposta_correta', q.alternativas, q.tipo
          into v_peso, v_correta, v_alternativas, v_tipo
          from public.provas_questoes q
         where q.id = v_questao_id
           and q.prova_id = p_prova_id;

        if not found then
            raise exception 'Questão não pertence a esta prova';
        end if;

        v_total := v_total + v_peso;
        v_alternativa := null;
        v_texto := null;

        if v_tipo = 'DISCURSIVA' then
            v_texto := nullif(btrim(coalesce(v_item ->> 'texto_resposta', '')), '');
            if v_texto is null then
                raise exception 'Informe a resposta discursiva';
            end if;
        else
            v_alternativa := upper(btrim(coalesce(v_item ->> 'alternativa', '')));
            if v_alternativa not in ('A', 'B', 'C', 'D', 'E') then
                raise exception 'Questão ou alternativa inválida';
            end if;
            if not exists (
                select 1
                  from jsonb_array_elements(v_alternativas) a
                 where a ->> 'chave' = v_alternativa
            ) then
                raise exception 'Alternativa inexistente para esta questão';
            end if;

            if v_correta = v_alternativa then
                v_nota := v_nota + v_peso;
                v_acertos := v_acertos + 1;
            end if;
        end if;

        insert into public.provas_respostas_aluno (
            prova_id, aluno_id, questao_id, alternativa, texto_resposta,
            nota_manual, corrigido_por, corrigido_em
        )
        values (
            p_prova_id, auth.uid(), v_questao_id, v_alternativa, v_texto,
            null, null, null
        )
        on conflict (prova_id, aluno_id, questao_id) do update
            set alternativa = excluded.alternativa,
                texto_resposta = excluded.texto_resposta,
                nota_manual = null,
                corrigido_por = null,
                corrigido_em = null,
                atualizado_em = now();

        v_vistas := v_vistas || v_questao_id;
    end loop;

    if cardinality(v_vistas) <> v_quantidade then
        raise exception 'Responda todas as questões antes de finalizar';
    end if;

    select count(*)::integer into v_discursivas
      from public.provas_questoes q
     where q.prova_id = p_prova_id
       and q.tipo = 'DISCURSIVA';

    v_status := case
        when v_discursivas > 0 then 'EM_ANDAMENTO'::public.prova_progresso_status
        else 'CONCLUIDA'::public.prova_progresso_status
    end;

    insert into public.provas_progresso (prova_id, aluno_id, status, nota)
    values (p_prova_id, auth.uid(), v_status, v_nota)
    on conflict (prova_id, aluno_id) do update
        set status = excluded.status,
            nota = excluded.nota,
            atualizado_em = now();

    insert into public.provas_revisao_auditoria (prova_id, conteudo_id, acao, motivo, actor_id)
    select pd.id, pd.ia_conteudo_id, 'SUBMETIDO',
           format(
               '%s: %s de %s pontos%s',
               case when v_discursivas > 0 then 'Correção parcial' else 'Correção automática' end,
               v_nota, v_total,
               case when v_discursivas > 0 then ' (aguarda correção manual)' else '' end
           ),
           auth.uid()
      from public.provas_direcionadas pd
     where pd.id = p_prova_id;

    return jsonb_build_object(
        'nota', v_nota,
        'total', v_total,
        'acertos', v_acertos,
        'quantidade_questoes', v_quantidade,
        'status', v_status::text
    );
end;
$$;

revoke all on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) from public, anon;
grant execute on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) to authenticated;

comment on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) is
    'Etapa 6 + Etapa 7: persiste respostas e corrige objetivas; provas com discursiva ficam EM_ANDAMENTO.';

-- ------------------------------------------------------------
-- 8. LEITURA DO ALUNO: TIPO DA QUESTÃO SEM GABARITO
-- ------------------------------------------------------------
-- O aluno precisa saber qual questão é de texto livre para preencher o
-- campo correto. Nenhuma coluna protegida entra nesta RPC: tipo é apenas
-- classificação, e gabarito/justificativa continuam inacessíveis.
-- Postgres não permite CREATE OR REPLACE quando a coluna de retorno muda;
-- o DROP abaixo está restrito a esta assinatura e é imediatamente seguido
-- da recriação com os mesmos grants, sem editar a migration da Etapa 6.

drop function if exists public.sulsafe_carregar_prova_aluno_ia(uuid);

create or replace function public.sulsafe_carregar_prova_aluno_ia(p_prova_id uuid)
returns table (id uuid, ordem integer, enunciado text, tipo text, alternativas jsonb, peso numeric)
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
        select q.id, q.ordem, q.enunciado, q.tipo, q.alternativas, q.peso
          from public.provas_questoes q
         where q.prova_id = p_prova_id
         order by q.ordem;
end;
$$;

revoke all on function public.sulsafe_carregar_prova_aluno_ia(uuid) from public, anon;
grant execute on function public.sulsafe_carregar_prova_aluno_ia(uuid) to authenticated;

comment on function public.sulsafe_carregar_prova_aluno_ia(uuid) is
    'Etapa 6 + Etapa 7: enunciado, tipo, alternativas, ordem e peso para o aluno; gabarito/justificativa permanecem inacessíveis.';
