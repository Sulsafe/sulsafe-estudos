-- ============================================================
-- FASE 5.3 — NOTIFICAÇÕES ALUNO → PROFESSOR E GATE HITL DA NOTA
-- ============================================================
-- Migration nova e forward-only. Não edita migrations já aplicadas.
--
-- Objetivos:
--   * notificar professores/admins da empresa quando o aluno conclui
--     videoaula, finaliza prova I.A. ou envia PDF para correção;
--   * deduplicar por chave lógica (recarregar a página não duplica);
--   * manter a nota calculada pela I.A., mas impedir que o aluno a veja
--     antes da revisão/liberação do professor;
--   * publicar a nota liberada no boletim e notificar o aluno;
--   * expor uma RPC única para a tela "Progresso dos Alunos".
--
-- DEC-002 (Opção C): empresa vem sempre de app_metadata.empresa_id do JWT
-- (ou do registro auth.users para destinatários). Nenhuma coluna nova em
-- profiles. Todas as rotinas são SECURITY DEFINER com search_path vazio.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS DE GATE EM PROVAS_PROGRESSO
-- ------------------------------------------------------------
-- nota permanece como a nota vigente (a que o professor vê e ajusta).
-- nota_ia guarda o cálculo automático original para auditoria.
-- liberado=false é o estado padrão: aluno nunca vê nota automaticamente.

alter table public.provas_progresso
    add column if not exists liberado boolean not null default false;

alter table public.provas_progresso
    add column if not exists liberado_por uuid references public.profiles(id) on delete set null;

alter table public.provas_progresso
    add column if not exists liberado_em timestamptz;

alter table public.provas_progresso
    add column if not exists nota_ia numeric(4,2) check (nota_ia between 0 and 10);

create index if not exists provas_progresso_liberado_idx
    on public.provas_progresso (aluno_id, liberado)
    where liberado = false;

comment on column public.provas_progresso.liberado is
    'Gate HITL: somente true depois que professor/admin revisa e libera a nota.';

-- ------------------------------------------------------------
-- 2. DEDUPLICAÇÃO DE EVENTOS
-- ------------------------------------------------------------
-- A chave lógica é estável por (evento, ator, recurso). ON CONFLICT
-- torna a operação idempotente mesmo com reprocessamento/reload.

create table if not exists public.notificacoes_eventos (
    chave text primary key,
    empresa_id uuid,
    usuario_id uuid references public.profiles(id) on delete cascade,
   titulo text,
    link text,
    criado_em timestamptz not null default now()
);

alter table public.notificacoes_eventos enable row level security;

revoke all on public.notificacoes_eventos from anon, authenticated;
grant all on public.notificacoes_eventos to service_role;

drop policy if exists "sulsafe_notificacoes_eventos_service" on public.notificacoes_eventos;
create policy "sulsafe_notificacoes_eventos_service"
on public.notificacoes_eventos
for all to service_role
using (true) with check (true);

comment on table public.notificacoes_eventos is
    'Chaves lógicas de eventos Aluno → Professor. Cada chave gera no máximo uma notificação.';

-- ------------------------------------------------------------
-- 3. IDENTIDADE DA EMPRESA POR USUÁRIO (DEC-002 / OPÇÃO C)
-- ------------------------------------------------------------
-- Usado para descobrir de qual empresa é o aluno que originou o evento e
-- para conferir se o destinatário pertence à mesma empresa.

create or replace function public.sulsafe_usuario_empresa_id(p_usuario_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select nullif(u.raw_app_meta_data ->> 'empresa_id', '')::uuid
      from auth.users u
     where u.id = p_usuario_id
     limit 1;
$$;

revoke all on function public.sulsafe_usuario_empresa_id(uuid) from public, anon, authenticated;
grant execute on function public.sulsafe_usuario_empresa_id(uuid) to service_role;

comment on function public.sulsafe_usuario_empresa_id(uuid) is
    'Empresa do usuário a partir de auth.users.raw_app_meta_data (DEC-002, Opção C). Uso interno de SECURITY DEFINER.';

-- ------------------------------------------------------------
-- 4. NOTIFICAÇÃO COM DEDUPE
-- ------------------------------------------------------------
-- Qualquer usuário ativo da empresa pode notificar professores/admins da
-- mesma empresa (eventos do aluno). Professor/admin também pode notificar
-- alunos da empresa (liberação de nota). Nunca permite cruzar empresas.

create or replace function public.sulsafe_notificar_evento(
    p_empresa_id uuid,
    p_chave text,
    p_usuario_id uuid,
    p_titulo text,
    p_mensagem text,
    p_link text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_dest_empresa uuid;
    v_chamador_professor boolean;
    v_inserido integer;
begin
    if p_empresa_id is null
       or nullif(btrim(coalesce(p_chave, '')), '') is null
       or nullif(btrim(coalesce(p_titulo, '')), '') is null
       or p_usuario_id is null then
        raise exception 'Evento de notificação inválido';
    end if;

    if not public.sulsafe_conta_ativa()
       or p_empresa_id <> public.sulsafe_empresa_id() then
        raise exception 'Sem permissão para notificar usuários desta empresa';
    end if;

    select public.sulsafe_usuario_empresa_id(p_usuario_id) into v_dest_empresa;
    if v_dest_empresa is null or v_dest_empresa <> p_empresa_id then
        raise exception 'Destinatário fora da empresa do evento';
    end if;

    v_chamador_professor := public.sulsafe_is_professor();

    if not v_chamador_professor then
        if not exists (
            select 1
              from public.profiles p
             where p.id = p_usuario_id
               and p.status = 'ativo'
               and p.role in ('professor', 'admin', 'super_admin')
        ) then
            raise exception 'Alunos só podem notificar professores e administradores';
        end if;
    end if;

    insert into public.notificacoes_eventos
        (chave, empresa_id, usuario_id, titulo, link)
    values (p_chave, p_empresa_id, p_usuario_id, p_titulo, p_link)
    on conflict (chave) do nothing;

    get diagnostics v_inserido = row_count;
    if v_inserido = 0 then
        return false;
    end if;

    insert into public.notificacoes
        (usuario_id, titulo, mensagem, link, lida, criado_em)
    values
        (p_usuario_id, p_titulo, p_mensagem, p_link, false, now());

    return true;
end;
$$;

revoke all on function public.sulsafe_notificar_evento(uuid, text, uuid, text, text, text) from public, anon;
grant execute on function public.sulsafe_notificar_evento(uuid, text, uuid, text, text, text) to authenticated;

comment on function public.sulsafe_notificar_evento(uuid, text, uuid, text, text, text) is
    'Cria no máximo uma notificação por chave lógica, restrita à empresa do chamador.';

-- ------------------------------------------------------------
-- 5. NOTIFICAÇÃO: CONCLUSÃO DE VIDEOAULA
-- ------------------------------------------------------------

create or replace function public.sulsafe_notificar_aula_concluida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
    v_titulo text;
    v_dest record;
begin
    if new."concluído" is not true then
        return null;
    end if;

    select public.sulsafe_usuario_empresa_id(new.user_id) into v_empresa;
    if v_empresa is null then
        return null;
    end if;

    select coalesce(v.titulo, 'Videoaula') into v_titulo
      from public.videoaulas v
     where v.id = new.aula_id;

    for v_dest in
        select p.id
          from public.profiles p
         where p.status = 'ativo'
           and p.role in ('professor', 'admin', 'super_admin')
           and public.sulsafe_usuario_empresa_id(p.id) = v_empresa
    loop
        perform public.sulsafe_notificar_evento(
            v_empresa,
            format('aula_concluida:%s:%s:%s', new.user_id, new.aula_id, v_dest.id),
            v_dest.id,
            'Videoaula concluída',
            format('O aluno %s concluiu a videoaula %s.',
                   coalesce((select p.nome_completo from public.profiles p where p.id = new.user_id), 'Aluno'),
                   v_titulo),
            'progresso-alunos'
        );
    end loop;

    return null;
end;
$$;

drop trigger if exists trg_notificar_aula_concluida on public.progresso_aulas;
create trigger trg_notificar_aula_concluida
    after insert or update of "concluído"
    on public.progresso_aulas
    for each row
    when (new."concluído" is true)
    execute function public.sulsafe_notificar_aula_concluida();

revoke all on function public.sulsafe_notificar_aula_concluida() from public, anon;
grant execute on function public.sulsafe_notificar_aula_concluida() to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. NOTIFICAÇÃO: PDF ENVIADO PARA CORREÇÃO
-- ------------------------------------------------------------

create or replace function public.sulsafe_notificar_prova_pdf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
    v_dest record;
begin
    if coalesce(new.status, 'pendente') <> 'pendente' then
        return null;
    end if;
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
        return null;
    end if;

    select public.sulsafe_usuario_empresa_id(new.usuario_id) into v_empresa;
    if v_empresa is null then
        return null;
    end if;

    for v_dest in
        select p.id
          from public.profiles p
         where p.status = 'ativo'
           and p.role in ('professor', 'admin', 'super_admin')
           and public.sulsafe_usuario_empresa_id(p.id) = v_empresa
    loop
        perform public.sulsafe_notificar_evento(
            v_empresa,
            format('pdf_enviado:%s:%s:%s', new.usuario_id, new.id, v_dest.id),
            v_dest.id,
            'Prova PDF enviada',
            format('O aluno %s enviou a prova %s para correção.',
                   coalesce((select p.nome_completo from public.profiles p where p.id = new.usuario_id), 'Aluno'),
                   coalesce(new.titulo, 'PDF')),
            'provas-pendentes-ia'
        );
    end loop;

    return null;
end;
$$;

drop trigger if exists trg_notificar_prova_pdf on public.provas;
create trigger trg_notificar_prova_pdf
    after insert or update of status
    on public.provas
    for each row
    when (coalesce(new.status, 'pendente') = 'pendente')
    execute function public.sulsafe_notificar_prova_pdf();

revoke all on function public.sulsafe_notificar_prova_pdf() from public, anon;
grant execute on function public.sulsafe_notificar_prova_pdf() to authenticated, service_role;

-- ------------------------------------------------------------
-- 7. SUBMISSÃO I.A. — NOTIFICA O PROFESSOR E OCULTA A NOTA
-- ------------------------------------------------------------
-- O cálculoautomático permanece idêntico ao homologado: pesos, acertos,
-- correção de discursivas e status. Muda apenas a resposta ao aluno (que
-- não recebe mais a nota) e o registro de nota_ia + notificação dedup.

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
    v_empresa uuid;
    v_prova_titulo text;
    v_aluno_nome text;
    v_dest record;
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

    insert into public.provas_progresso (prova_id, aluno_id, status, nota, nota_ia)
    values (p_prova_id, auth.uid(), v_status, v_nota, v_nota)
    on conflict (prova_id, aluno_id) do update
        set status = excluded.status,
            nota = excluded.nota,
            nota_ia = excluded.nota_ia,
            liberado = false,
            liberado_por = null,
            liberado_em = null,
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

    v_empresa := public.sulsafe_prova_empresa_id(p_prova_id);
    select pd.titulo into v_prova_titulo
      from public.provas_direcionadas pd where pd.id = p_prova_id;
    select coalesce(p.nome_completo, 'Aluno') into v_aluno_nome
      from public.profiles p where p.id = auth.uid();

    if v_empresa is not null then
        for v_dest in
            select p.id
              from public.profiles p
             where p.status = 'ativo'
               and p.role in ('professor', 'admin', 'super_admin')
               and public.sulsafe_usuario_empresa_id(p.id) = v_empresa
        loop
            perform public.sulsafe_notificar_evento(
                v_empresa,
                format('prova_ia_finalizada:%s:%s:%s', p_prova_id, auth.uid(), v_dest.id),
                v_dest.id,
                'Prova I.A. finalizada',
                format('%s finalizou a prova %s. Aguarda revisão para liberação da nota.',
                       v_aluno_nome, coalesce(v_prova_titulo, 'prova')),
                format('provas-resultados-ia|%s', p_prova_id)
            );
        end loop;
    end if;

    -- A nota existe no banco para revisão do professor, mas não é devolvida
    -- ao aluno: ela só será visível após sulsafe_revisar_liberar_nota_ia.
    return jsonb_build_object(
        'nota', null,
        'total', v_total,
        'acertos', v_acertos,
        'quantidade_questoes', v_quantidade,
        'status', v_status::text,
        'liberado', false,
        'mensagem', 'Prova enviada! Aguarde a revisão do professor para ver sua nota.'
    );
end;
$$;

revoke all on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) from public, anon;
grant execute on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) to authenticated;

comment on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) is
    'Corrige a prova pela I.A. e registra nota_ia, mas não expõe nota ao aluno até liberação HITL.';

-- ------------------------------------------------------------
-- 8. LEITURA SEGURA DA NOTA PELO ALUNO
-- ------------------------------------------------------------

create or replace function public.sulsafe_nota_aluno_ia(p_prova_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
    select case when pr.liberado then pr.nota else null end
      from public.provas_progresso pr
     where pr.prova_id = p_prova_id
       and pr.aluno_id = auth.uid()
       and public.sulsafe_prova_aluno_valida(p_prova_id)
     limit 1;
$$;

revoke all on function public.sulsafe_nota_aluno_ia(uuid) from public, anon;
grant execute on function public.sulsafe_nota_aluno_ia(uuid) to authenticated;

comment on function public.sulsafe_nota_aluno_ia(uuid) is
    'Devolve a nota da prova I.A. ao aluno somente quando liberado = true.';

-- ------------------------------------------------------------
-- 9. REVISÃO, AJUSTE E LIBERAÇÃO PELO PROFESSOR
-- ------------------------------------------------------------
-- Publicação no boletim usa chave de origem estável para não duplicar notas.

alter table public.notas
    add column if not exists origem_chave text;

create unique index if not exists notas_origem_chave_key
    on public.notas (origem_chave)
    where origem_chave is not null;

create or replace function public.sulsafe_revisar_liberar_nota_ia(
    p_prova_id uuid,
    p_aluno_id uuid,
    p_nota numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_progresso public.provas_progresso%rowtype;
    v_empresa uuid;
    v_nr_id integer;
    v_titulo text;
    v_nota numeric;
    v_chave text;
begin
    if not public.sulsafe_prova_gerenciada(p_prova_id)
       or not public.sulsafe_acessa_aluno(p_aluno_id)
       or not exists (
            select 1
              from public.provas_distribuicoes d
             where d.prova_id = p_prova_id
               and d.aluno_id = p_aluno_id
       ) then
        raise exception 'Sem permissão para liberar a nota deste aluno';
    end if;

    if p_nota is not null and (p_nota < 0 or p_nota > 10) then
        raise exception 'Nota deve estar entre 0 e 10';
    end if;

    select * into v_progresso
      from public.provas_progresso
     where prova_id = p_prova_id
       and aluno_id = p_aluno_id;

    if not found then
        raise exception 'Progresso da prova não encontrado para este aluno';
    end if;

    if v_progresso.liberado then
        return true;
    end if;

    v_nota := coalesce(p_nota, v_progresso.nota, v_progresso.nota_ia);

    update public.provas_progresso
       set nota = v_nota,
           nota_ia = coalesce(nota_ia, v_nota),
           liberado = true,
           liberado_por = auth.uid(),
           liberado_em = now(),
           atualizado_em = now()
     where prova_id = p_prova_id
       and aluno_id = p_aluno_id;

    select pd.nr_id, pd.titulo, public.sulsafe_prova_empresa_id(pd.id)
      into v_nr_id, v_titulo, v_empresa
      from public.provas_direcionadas pd
     where pd.id = p_prova_id;

    v_chave := format('PROVA_IA:%s:%s', p_prova_id, p_aluno_id);

    insert into public.notas
        (usuario_id, nr_id, nota, obs, professor_id, origem_chave, criado_em)
    values
        (p_aluno_id, coalesce(v_nr_id, 0), v_nota,
         format('Nota liberada da prova I.A. %s', coalesce(v_titulo, 'I.A.')),
         auth.uid(), v_chave, now())
    on conflict (origem_chave) where origem_chave is not null
    do update set
        nota = excluded.nota,
        obs = excluded.obs,
        professor_id = excluded.professor_id;

    insert into public.provas_revisao_auditoria (prova_id, conteudo_id, acao, motivo, actor_id)
    select pd.id, pd.ia_conteudo_id, 'LIBERADO',
           format('Nota %s liberada pelo professor', v_nota::text), auth.uid()
      from public.provas_direcionadas pd
     where pd.id = p_prova_id;

    if v_empresa is not null then
        perform public.sulsafe_notificar_evento(
            v_empresa,
            format('nota_liberada:%s:%s', p_prova_id, p_aluno_id),
            p_aluno_id,
            'Nota liberada',
            format('Sua nota da prova %s foi liberada: %s',
                   coalesce(v_titulo, 'I.A.'), trim(to_char(v_nota, 'FM999999990.99'))),
            'boletim'
        );
    end if;

    return true;
end;
$$;

revoke all on function public.sulsafe_revisar_liberar_nota_ia(uuid, uuid, numeric) from public, anon;
grant execute on function public.sulsafe_revisar_liberar_nota_ia(uuid, uuid, numeric) to authenticated;

comment on function public.sulsafe_revisar_liberar_nota_ia(uuid, uuid, numeric) is
    'Revisa/ajusta e libera a nota da prova I.A., publica no boletim e notifica o aluno uma vez.';

-- A auditoria agora registra também a liberação HITL.
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
end $$;

alter table public.provas_revisao_auditoria
    add constraint provas_revisao_auditoria_acao_check
    check (acao in (
        'APROVADO', 'REJEITADO', 'EDITADO', 'DISTRIBUIDO', 'INTERNO',
        'SUBMETIDO', 'CORRIGIDO_MANUAL', 'LIBERADO'
    ));

-- ------------------------------------------------------------
-- 10. TELA "PROGRESSO DOS ALUNOS"
-- ------------------------------------------------------------
-- Uma única RPC agrega videoaulas (view_ranking_alunos), status das provas
-- e último acesso. Falha fechada: sem professor ativo da empresa => [].

create or replace function public.sulsafe_listar_progresso_alunos(
    p_turma_id uuid,
    p_aluno_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
    v_linhas jsonb;
begin
    if not public.sulsafe_conta_ativa()
       or not public.sulsafe_is_professor() then
        return '[]'::jsonb;
    end if;

    v_empresa := public.sulsafe_empresa_id();
    if v_empresa is null then
        return '[]'::jsonb;
    end if;

    if p_turma_id is not null and not public.sulsafe_acessa_turma(p_turma_id) then
        return '[]'::jsonb;
    end if;
    if p_aluno_id is not null and not public.sulsafe_acessa_aluno(p_aluno_id) then
        return '[]'::jsonb;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
               'aluno_id', x.aluno_id,
               'empresa_id', v_empresa,
               'nome_completo', x.nome_completo,
               'email', x.email,
               'turma_id', x.turma_id,
               'turma_nome', x.turma_nome,
               'aulas_concluidas', x.aulas_concluidas,
               'progresso', x.progresso,
               'status_provas', x.status_provas,
               'ultimo_acesso', x.ultimo_acesso
           ) order by x.nome_completo, x.aluno_id), '[]'::jsonb)
      into v_linhas
      from (
          select p.id as aluno_id,
                 p.nome_completo,
                 coalesce(p.email, '') as email,
                 (select t.id from public.turmas t
                    join public.turma_alunos ta on ta.turma_id = t.id
                   where ta.aluno_id = p.id
                   order by t.nome, t.id limit 1) as turma_id,
                 (select t.nome from public.turmas t
                    join public.turma_alunos ta on ta.turma_id = t.id
                   where ta.aluno_id = p.id
                   order by t.nome, t.id limit 1) as turma_nome,
                 coalesce(r.aulas_concluidas, 0) as aulas_concluidas,
                 coalesce(r.progresso, 0) as progresso,
                 coalesce((
                     select string_agg(distinct case
                                when pp.liberado then 'NOTA LIBERADA'
                                when pp.status::text in ('CONCLUIDA', 'EM_ANDAMENTO') then 'AGUARDANDO REVISÃO'
                                else 'PENDENTE'
                            end, ' | ')
                       from public.provas_progresso pp
                      where pp.aluno_id = p.id
                 ), 'SEM PROVA') as status_provas,
                 (select max(u.last_sign_in_at)
                    from auth.users u where u.id = p.id) as ultimo_acesso
            from public.profiles p
            left join public.view_ranking_alunos r on r.id = p.id
           where p.role = 'aluno'
             and p.status = 'ativo'
             and public.sulsafe_usuario_empresa_id(p.id) = v_empresa
             and (p_turma_id is null or exists (
                     select 1 from public.turma_alunos ta
                      where ta.aluno_id = p.id and ta.turma_id = p_turma_id
                 ))
             and (p_aluno_id is null or p.id = p_aluno_id)
      ) x;

    return v_linhas;
end;
$$;

revoke all on function public.sulsafe_listar_progresso_alunos(uuid, uuid) from public, anon;
grant execute on function public.sulsafe_listar_progresso_alunos(uuid, uuid) to authenticated;

comment on function public.sulsafe_listar_progresso_alunos(uuid, uuid) is
    'Progresso de videoaulas, status das provas e último acesso dos alunos da empresa do professor.';
