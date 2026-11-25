-- ============================================================
-- FASE 5 (ETAPA 4/8) — HITL VISUAL DE APROVAÇÃO DE PROVAS
-- ============================================================
-- Escopo desta migration (forward-only; nenhuma migration aplicada é editada):
--   1. Uma prova I.A. aprovada pode continuar sem destino até a Etapa 5.
--      O CHECK da Etapa 2 exigia publicado = false para rascunhos sem
--      turma/aluno; aprovar, por decisão do proprietário, marca publicado =
--      true. O destino (turma/aluno/catálogo) ainda será escolhido na Etapa 5.
--   2. RPC única para a revisão (questões + gabarito), com autorização
--      reforçada: professor vê só a própria empresa; admin pode revisar.
--   3. RPCs de aprovar/rejeitar/editar com auditoria quem/quando/motivo.
--   4. Tabela de auditoria com RLS herdada da empresa da prova.
--
-- Nenhuma chave de API participa destas funções. Videoaulas, currículo e o
-- fluxo homologado do Tutor não são alterados. A distribuição a alunos e as
-- notificações pertencem à Etapa 5 e não são feitas aqui.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DESTINO AINDA PENDENTE APÓS A APROVAÇÃO
-- ------------------------------------------------------------

alter table public.provas_direcionadas
    drop constraint if exists provas_direcionadas_um_destino_check;

alter table public.provas_direcionadas
    add constraint provas_direcionadas_um_destino_check
    check (
        num_nonnulls(turma_id, aluno_id) = 1
        or (
            origem = 'IA_TUTOR'
            and num_nonnulls(turma_id, aluno_id) = 0
        )
    );

comment on constraint provas_direcionadas_um_destino_check on public.provas_direcionadas is
    'Provas I.A. aprovadas podem ficar sem destino até a Etapa 5; provas manuais continuam exigindo exatamente um destino.';

-- ------------------------------------------------------------
-- 2. AUTORIZAÇÃO ÚNICA DA REVISÃO
-- ------------------------------------------------------------

create or replace function public.sulsafe_prova_revisavel(p_prova_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_conta_ativa()
       and (public.sulsafe_is_admin() or public.sulsafe_is_professor())
       and exists (
           select 1
             from public.provas_direcionadas pd
             join public.ia_conteudos c on c.id = pd.ia_conteudo_id
            where pd.id = p_prova_id
              and pd.origem = 'IA_TUTOR'
              and c.tipo = 'PROVA'
              and coalesce(c.conteudo ->> 'origem', '') = 'TUTOR_SULSAFE'
              and (
                  public.sulsafe_is_admin()
                  or c.empresa_id is not distinct from public.sulsafe_empresa_id()
              )
       );
$$;

revoke all on function public.sulsafe_prova_revisavel(uuid) from public, anon;
grant execute on function public.sulsafe_prova_revisavel(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. AUDITORIA DA DECISÃO HITL
-- ------------------------------------------------------------

create table if not exists public.provas_revisao_auditoria (
    id uuid primary key default gen_random_uuid(),
    prova_id uuid not null
        references public.provas_direcionadas (id) on delete cascade,
    conteudo_id uuid
        references public.ia_conteudos (id) on delete set null,
    questao_id uuid
        references public.provas_questoes (id) on delete set null,
    acao text not null check (acao in ('APROVADO', 'REJEITADO', 'EDITADO')),
    motivo text,
    actor_id uuid not null references public.profiles (id),
    criado_em timestamptz not null default now()
);

create index if not exists provas_revisao_auditoria_prova_idx
    on public.provas_revisao_auditoria (prova_id, criado_em);

alter table public.provas_revisao_auditoria enable row level security;

drop policy if exists "sulsafe_provas_revisao_auditoria_select" on public.provas_revisao_auditoria;
create policy "sulsafe_provas_revisao_auditoria_select"
on public.provas_revisao_auditoria
for select
to authenticated
using (public.sulsafe_prova_revisavel(prova_id));

revoke all on public.provas_revisao_auditoria from public, anon, authenticated;
grant select on public.provas_revisao_auditoria to authenticated;

comment on table public.provas_revisao_auditoria is
    'Registro imutável da revisão humana de provas geradas pelo Tutor: aprovação, rejeição e edição de questões.';

-- ------------------------------------------------------------
-- 4. LEITURA SEGURA DA REVISÃO (QUESTÕES + GABARITO)
-- ------------------------------------------------------------
-- A fila (Etapa 3) continua devolvendo somente metadados. Esta RPC é a única
-- fonte do modal: devolve enunciado/alternativas e, porque exige papel de
-- professor/admin, também o gabarito. Nunca é concedida a alunos.

create or replace function public.sulsafe_obter_revisao_prova_ia(p_prova_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_resultado jsonb;
begin
    if not public.sulsafe_prova_revisavel(p_prova_id) then
        raise exception 'Prova não disponível para revisão nesta conta';
    end if;

    select jsonb_build_object(
        'prova_id', pd.id,
        'conteudo_id', c.id,
        'titulo', c.titulo,
        'descricao', nullif(c.conteudo ->> 'descricao', ''),
        'nr_id', nullif(c.conteudo ->> 'nr_id', '')::integer,
        'publicado', coalesce(pd.publicado, false),
        'questoes', coalesce(
            (
                select jsonb_agg(
                           jsonb_build_object(
                               'id', q.id,
                               'ordem', q.ordem,
                               'enunciado', q.enunciado,
                               'alternativas', q.alternativas,
                               'peso', q.peso,
                               'gabarito', q.gabarito
                           )
                           order by q.ordem
                       )
                  from public.provas_questoes q
                 where q.prova_id = pd.id
            ),
            '[]'::jsonb
        )
    )
      into v_resultado
      from public.provas_direcionadas pd
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
     where pd.id = p_prova_id;

    if v_resultado is null then
        raise exception 'Prova não encontrada para revisão';
    end if;

    return v_resultado;
end;
$$;

revoke all on function public.sulsafe_obter_revisao_prova_ia(uuid) from public, anon;
grant execute on function public.sulsafe_obter_revisao_prova_ia(uuid) to authenticated;

comment on function public.sulsafe_obter_revisao_prova_ia(uuid) is
    'Modal de revisão HITL: questões e gabarito somente para admin/professor autorizado; nunca concedida a alunos.';

-- ------------------------------------------------------------
-- 5. EDIÇÃO DE QUESTÃO DURANTE A REVISÃO
-- ------------------------------------------------------------

create or replace function public.sulsafe_editar_questao_prova_ia(
    p_questao_id uuid,
    p_enunciado text,
    p_alternativas jsonb,
    p_gabarito jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_prova_id uuid;
    v_aprovado boolean;
    v_rejeitado boolean;
    v_publicado boolean;
    v_conteudo_id uuid;
begin
    if p_enunciado is null or length(btrim(p_enunciado)) not between 1 and 1000 then
        raise exception 'Informe um enunciado de 1 a 1000 caracteres';
    end if;

    if p_alternativas is null or jsonb_typeof(p_alternativas) <> 'array'
       or jsonb_array_length(p_alternativas) not between 2 and 5 then
        raise exception 'Informe de 2 a 5 alternativas';
    end if;

    if exists (
        select 1
          from jsonb_array_elements(p_alternativas) alt
         where coalesce(alt ->> 'chave', '') = ''
            or coalesce(alt ->> 'texto', '') = ''
    ) then
        raise exception 'Toda alternativa precisa de chave e texto';
    end if;

    if p_gabarito is null or jsonb_typeof(p_gabarito) <> 'object'
       or coalesce(p_gabarito ->> 'resposta_correta', '') = ''
       or coalesce(p_gabarito ->> 'justificativa', '') = '' then
        raise exception 'O gabarito precisa de resposta_correta e justificativa';
    end if;

    if not exists (
        select 1
          from jsonb_array_elements(p_alternativas) alt
         where alt ->> 'chave' = p_gabarito ->> 'resposta_correta'
    ) then
        raise exception 'A resposta correta deve ser uma das alternativas';
    end if;

    select q.prova_id into v_prova_id
      from public.provas_questoes q
     where q.id = p_questao_id;

    if v_prova_id is null or not public.sulsafe_prova_revisavel(v_prova_id) then
        raise exception 'Questão não disponível para edição nesta conta';
    end if;

    select c.id, c.aprovado, c.rejeitado, coalesce(pd.publicado, false)
      into v_conteudo_id, v_aprovado, v_rejeitado, v_publicado
      from public.provas_direcionadas pd
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
     where pd.id = v_prova_id;

    if v_aprovado or v_rejeitado or v_publicado then
        raise exception 'Uma prova já decidida não pode ser editada';
    end if;

    update public.provas_questoes q
       set enunciado = btrim(p_enunciado),
           alternativas = p_alternativas,
           gabarito = p_gabarito
     where q.id = p_questao_id
       and q.prova_id = v_prova_id;

    insert into public.provas_revisao_auditoria
        (prova_id, conteudo_id, questao_id, acao, motivo, actor_id)
    values
        (v_prova_id, v_conteudo_id, p_questao_id, 'EDITADO',
         'Edição da questão durante a revisão', auth.uid());

    return jsonb_build_object(
        'questao_id', p_questao_id,
        'prova_id', v_prova_id,
        'editado_por', auth.uid(),
        'editado_em', now()
    );
end;
$$;

revoke all on function public.sulsafe_editar_questao_prova_ia(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.sulsafe_editar_questao_prova_ia(uuid, text, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 6. APROVAÇÃO
-- ------------------------------------------------------------
-- publicado = true aqui significa "aprovada e pronta para distribuição".
-- Nenhum vínculo com turma/aluno é criado: distribuido_por/distribuido_em
-- continuam nulos até a Etapa 5.

create or replace function public.sulsafe_aprovar_prova_ia(
    p_prova_id uuid,
    p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_agora timestamptz := now();
    v_conteudo_id uuid;
    v_aprovado boolean;
    v_rejeitado boolean;
    v_publicado boolean;
    v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
begin
    if not public.sulsafe_prova_revisavel(p_prova_id) then
        raise exception 'Prova não disponível para aprovação nesta conta';
    end if;

    select c.id, c.aprovado, c.rejeitado, coalesce(pd.publicado, false)
      into v_conteudo_id, v_aprovado, v_rejeitado, v_publicado
      from public.provas_direcionadas pd
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
     where pd.id = p_prova_id;

    if v_rejeitado then
        raise exception 'Uma prova rejeitada não pode ser aprovada';
    end if;

    if v_aprovado or v_publicado then
        raise exception 'Esta prova já foi aprovada';
    end if;

    update public.provas_direcionadas
       set publicado = true
     where id = p_prova_id;

    update public.ia_conteudos
       set aprovado = true,
           aprovado_por = auth.uid(),
           aprovado_em = v_agora,
           publicado = true,
           publicado_por = auth.uid(),
           publicado_em = v_agora,
           observacao = v_motivo,
           atualizado_em = v_agora
     where id = v_conteudo_id;

    insert into public.provas_revisao_auditoria
        (prova_id, conteudo_id, acao, motivo, actor_id)
    values
        (p_prova_id, v_conteudo_id, 'APROVADO', v_motivo, auth.uid());

    return jsonb_build_object(
        'prova_id', p_prova_id,
        'publicado', true,
        'aprovado_por', auth.uid(),
        'aprovado_em', v_agora
    );
end;
$$;

revoke all on function public.sulsafe_aprovar_prova_ia(uuid, text) from public, anon;
grant execute on function public.sulsafe_aprovar_prova_ia(uuid, text) to authenticated;

comment on function public.sulsafe_aprovar_prova_ia(uuid, text) is
    'HITL: aprova a prova I.A., marca publicado = true e registra auditoria. Não distribui a alunos.';

-- ------------------------------------------------------------
-- 7. REJEIÇÃO
-- ------------------------------------------------------------

create or replace function public.sulsafe_rejeitar_prova_ia(
    p_prova_id uuid,
    p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_agora timestamptz := now();
    v_conteudo_id uuid;
    v_aprovado boolean;
    v_rejeitado boolean;
    v_publicado boolean;
    v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
begin
    if not public.sulsafe_prova_revisavel(p_prova_id) then
        raise exception 'Prova não disponível para rejeição nesta conta';
    end if;

    select c.id, c.aprovado, c.rejeitado, coalesce(pd.publicado, false)
      into v_conteudo_id, v_aprovado, v_rejeitado, v_publicado
      from public.provas_direcionadas pd
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
     where pd.id = p_prova_id;

    if v_aprovado or v_publicado then
        raise exception 'Uma prova já aprovada não pode ser rejeitada';
    end if;

    if v_rejeitado then
        raise exception 'Esta prova já foi rejeitada';
    end if;

    update public.provas_direcionadas
       set publicado = false
     where id = p_prova_id;

    update public.ia_conteudos
       set rejeitado = true,
           rejeitado_por = auth.uid(),
           rejeitado_em = v_agora,
           observacao = v_motivo,
           publicado = false,
           atualizado_em = v_agora
     where id = v_conteudo_id;

    insert into public.provas_revisao_auditoria
        (prova_id, conteudo_id, acao, motivo, actor_id)
    values
        (p_prova_id, v_conteudo_id, 'REJEITADO', v_motivo, auth.uid());

    return jsonb_build_object(
        'prova_id', p_prova_id,
        'rejeitada', true,
        'rejeitado_por', auth.uid(),
        'rejeitado_em', v_agora
    );
end;
$$;

revoke all on function public.sulsafe_rejeitar_prova_ia(uuid, text) from public, anon;
grant execute on function public.sulsafe_rejeitar_prova_ia(uuid, text) to authenticated;

comment on function public.sulsafe_rejeitar_prova_ia(uuid, text) is
    'HITL: rejeita a prova I.A. com motivo opcional, mantém publicado = false e registra auditoria.';

-- Fim da Etapa 4/8.
