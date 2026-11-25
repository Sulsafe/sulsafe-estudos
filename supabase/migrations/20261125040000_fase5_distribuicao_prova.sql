-- ============================================================
-- FASE 5 (ETAPA 5/8) — DISTRIBUIÇÃO DIRECIONADA DE PROVAS
-- ============================================================
-- Escopo desta migration (forward-only; nenhuma migration aplicada é editada):
--   1. Uma prova aprovada (publicado = true, Etapa 4) passa a ter destino:
--      TURMA, ALUNO, CATALOGO ou INTERNO (rascunho sem entrega).
--   2. provas_direcionadas guarda o destino escolhido e quem/quando decidiu.
--   3. provas_distribuicoes registra um vínculo por aluno alcançado, para que
--      "distribuir para turma" signifique entrega real a cada membro da turma.
--   4. Notificações são gravadas por SECURITY DEFINER (a tabela não tem
--      policy de INSERT para authenticated).
--   5. Auditoria reaproveita provas_revisao_auditoria com DISTRIBUIDO/INTERNO.
--   6. Isolamento: prova, turma e aluno precisam pertencer à empresa do JWT.
--      Administradores não são exceção nesta etapa (diferente da revisão).
--
-- Nenhuma chave de API participa destas funções. A tela do aluno (Etapa 6),
-- o fluxo de videoaulas e as etapas 1 a 4 permanecem intactos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EMPRESA DA TURMA (ISOLAMENTO DO DESTINO)
-- ------------------------------------------------------------
-- turmas não tinha empresa_id: a empresa vinha do criador, mas profiles não
-- guarda o claim. A coluna é preenchida automaticamente no INSERT e pode ser
-- preenchida retroativamente por cada empresa. Turmas legadas com NULL ficam
-- sem destino válido até serem classificadas — falha fechada, nunca vaza.

alter table public.turmas
    add column if not exists empresa_id uuid;

create index if not exists turmas_empresa_id_idx
    on public.turmas (empresa_id)
    where empresa_id is not null;

create or replace function public.sulsafe_turma_herda_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.empresa_id is null then
        new.empresa_id := public.sulsafe_empresa_id();
    end if;
    return new;
end;
$$;

drop trigger if exists trg_turmas_empresa_distribuicao on public.turmas;
create trigger trg_turmas_empresa_distribuicao
    before insert on public.turmas
    for each row execute function public.sulsafe_turma_herda_empresa();

revoke all on function public.sulsafe_turma_herda_empresa() from public, anon;
grant execute on function public.sulsafe_turma_herda_empresa() to authenticated;

comment on column public.turmas.empresa_id is
    'Empresa da turma, derivada do claim app_metadata.empresa_id no INSERT. Usada para impedir que uma prova chegue a outra empresa.';

-- ------------------------------------------------------------
-- 2. DESTINO NA PROVA JÁ APROVADA
-- ------------------------------------------------------------

alter table public.provas_direcionadas
    add column if not exists destino_tipo text
        check (destino_tipo in ('TURMA', 'ALUNO', 'CATALOGO', 'INTERNO'));

create index if not exists provas_direcionadas_destino_tipo_idx
    on public.provas_direcionadas (destino_tipo)
    where destino_tipo is not null;

comment on column public.provas_direcionadas.destino_tipo is
    'Decisão da Etapa 5. INTERNO mantém a prova no banco sem entregar a nenhum aluno.';

-- ------------------------------------------------------------
-- 3. ENTREGA POR ALUNO
-- ------------------------------------------------------------

create table if not exists public.provas_distribuicoes (
    id uuid primary key default gen_random_uuid(),
    prova_id uuid not null
        references public.provas_direcionadas (id) on delete cascade,
    aluno_id uuid not null
        references public.profiles (id) on delete cascade,
    destino_tipo text not null
        check (destino_tipo in ('TURMA', 'ALUNO', 'CATALOGO')),
    destino_id uuid,
    distribuido_por uuid not null
        references public.profiles (id) on delete set null,
    distribuido_em timestamptz not null default now(),
    constraint provas_distribuicoes_unica unique (prova_id, aluno_id)
);

create index if not exists provas_distribuicoes_aluno_idx
    on public.provas_distribuicoes (aluno_id);

create index if not exists provas_distribuicoes_prova_idx
    on public.provas_distribuicoes (prova_id);

alter table public.provas_distribuicoes enable row level security;

-- Somente leitura: toda escrita passa pela RPC, que valida empresa e estado.
revoke all on public.provas_distribuicoes from public, anon, authenticated;
grant select on public.provas_distribuicoes to authenticated;

drop policy if exists "sulsafe_provas_distribuicoes_select" on public.provas_distribuicoes;
create policy "sulsafe_provas_distribuicoes_select"
on public.provas_distribuicoes
for select to authenticated
using (
    public.sulsafe_conta_ativa()
    and (
        public.sulsafe_prova_gerenciada(prova_id)
        or (
            aluno_id = auth.uid()
            and public.sulsafe_prova_empresa_id(prova_id) is not distinct from public.sulsafe_empresa_id()
            and exists (
                select 1
                  from public.provas_direcionadas pd
                 where pd.id = provas_distribuicoes.prova_id
                   and pd.publicado
            )
        )
    )
);

comment on table public.provas_distribuicoes is
    'Uma linha por aluno que recebeu a prova. A Etapa 6 consumirá esta tela sem expor gabarito.';

-- ------------------------------------------------------------
-- 4. AUDITORIA: NOVAS AÇÕES
-- ------------------------------------------------------------
-- A coluna foi criada com um CHECK implícito na Etapa 4. Removemos apenas
-- constraints de CHECK que mencionem `acao` e recriamos uma versão explícita.

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
    check (acao in ('APROVADO', 'REJEITADO', 'EDITADO', 'DISTRIBUIDO', 'INTERNO'));

-- ------------------------------------------------------------
-- 5. AUTORIZAÇÃO ÚNICA DA DISTRIBUIÇÃO
-- ------------------------------------------------------------
-- Diferente da revisão (Etapa 4), aqui o ADMIN também precisa estar na mesma
-- empresa da prova: distribuir é um ato com efeito externo.

create or replace function public.sulsafe_prova_distribuivel(p_prova_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_conta_ativa()
       and (public.sulsafe_is_admin() or public.sulsafe_is_professor())
       and public.sulsafe_prova_gerenciada(p_prova_id)
       and exists (
           select 1
             from public.provas_direcionadas pd
             join public.ia_conteudos c on c.id = pd.ia_conteudo_id
            where pd.id = p_prova_id
              and pd.origem = 'IA_TUTOR'
              and pd.publicado
              and pd.distribuido_por is null
              and coalesce(pd.destino_tipo, 'INTERNO') = 'INTERNO'
              and c.tipo = 'PROVA'
              and coalesce(c.conteudo ->> 'origem', '') = 'TUTOR_SULSAFE'
              and c.aprovado
              and not c.rejeitado
       );
$$;

revoke all on function public.sulsafe_prova_distribuivel(uuid) from public, anon;
grant execute on function public.sulsafe_prova_distribuivel(uuid) to authenticated;

comment on function public.sulsafe_prova_distribuivel(uuid) is
    'Autoriza a Etapa 5: prova I.A. aprovada, da empresa do chamador (admin incluído), ainda não entregue.';

-- ------------------------------------------------------------
-- 6. FILA DE PROVAS APROVADAS (SOMENTE METADADOS)
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_provas_aprovadas_ia()
returns table (
    prova_id uuid,
    conteudo_id uuid,
    titulo text,
    nr_id integer,
    criado_em timestamptz,
    destino_tipo text,
    distribuido_em timestamptz,
    quantidade_questoes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa()
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        return;
    end if;

    return query
        select pd.id,
               c.id,
               c.titulo,
               nullif(c.conteudo ->> 'nr_id', '')::integer,
               pd.criado_em,
               pd.destino_tipo,
               pd.distribuido_em,
               (select count(*)::integer from public.provas_questoes q where q.prova_id = pd.id)
          from public.provas_direcionadas pd
          join public.ia_conteudos c on c.id = pd.ia_conteudo_id
         where pd.origem = 'IA_TUTOR'
           and pd.publicado
           and public.sulsafe_prova_gerenciada(pd.id)
           and c.tipo = 'PROVA'
           and coalesce(c.conteudo ->> 'origem', '') = 'TUTOR_SULSAFE'
           and c.aprovado
           and not c.rejeitado
         order by pd.criado_em desc;
end;
$$;

revoke all on function public.sulsafe_listar_provas_aprovadas_ia() from public, anon;
grant execute on function public.sulsafe_listar_provas_aprovadas_ia() to authenticated;

comment on function public.sulsafe_listar_provas_aprovadas_ia() is
    'Tela de distribuição: provas aprovadas da empresa do chamador, sem questões nem gabarito.';

-- ------------------------------------------------------------
-- 7. DESTINOS DISPONÍVEIS (EMPRESA DO CHAMADOR)
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_destinos_distribuicao_ia()
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
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem distribuir provas';
    end if;

    select jsonb_build_object(
        'turmas', coalesce(
            (
                select jsonb_agg(
                           jsonb_build_object(
                               'id', t.id,
                               'nome', t.nome,
                               'quantidade_alunos', (
                                   select count(*)::integer
                                     from public.turma_alunos ta
                                    where ta.turma_id = t.id
                               )
                           )
                           order by t.nome
                       )
                  from public.turmas t
                 where t.empresa_id is not distinct from public.sulsafe_empresa_id()
                   and (
                       public.sulsafe_is_admin()
                       or public.sulsafe_acessa_turma(t.id)
                   )
            ),
            '[]'::jsonb
        ),
        'alunos', coalesce(
            (
                select jsonb_agg(
                           jsonb_build_object(
                               'id', p.id,
                               'nome', p.nome_completo,
                               'status', p.status
                           )
                           order by p.nome_completo
                       )
                  from public.profiles p
                 where p.role::text = 'aluno'
                   and p.status = 'ativo'
                   and exists (
                       select 1
                         from public.turma_alunos ta
                         join public.turmas t on t.id = ta.turma_id
                        where ta.aluno_id = p.id
                          and t.empresa_id is not distinct from public.sulsafe_empresa_id()
                   )
                   and (
                       public.sulsafe_is_admin()
                       or public.sulsafe_acessa_aluno(p.id)
                   )
            ),
            '[]'::jsonb
        )
    )
      into v_resultado;

    return v_resultado;
end;
$$;

revoke all on function public.sulsafe_listar_destinos_distribuicao_ia() from public, anon;
grant execute on function public.sulsafe_listar_destinos_distribuicao_ia() to authenticated;

comment on function public.sulsafe_listar_destinos_distribuicao_ia() is
    'Modal de distribuição: turmas e alunos da empresa do chamador. Alunos sem turma classificada não aparecem.';

-- ------------------------------------------------------------
-- 8. DISTRIBUIÇÃO
-- ------------------------------------------------------------

create or replace function public.sulsafe_distribuir_prova_ia(
    p_prova_id uuid,
    p_destino_tipo text,
    p_destino_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_agora timestamptz := now();
    v_tipo text := upper(btrim(coalesce(p_destino_tipo, '')));
    v_empresa uuid;
    v_conteudo_id uuid;
    v_titulo text;
    v_alunos uuid[] := '{}'::uuid[];
    v_aluno uuid;
    v_total integer := 0;
    v_destino_id uuid;
begin
    if not public.sulsafe_conta_ativa()
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem distribuir provas';
    end if;

    if v_tipo not in ('TURMA', 'ALUNO', 'CATALOGO', 'INTERNO') then
        raise exception 'Destino inválido. Use TURMA, ALUNO, CATALOGO ou INTERNO';
    end if;

    if not public.sulsafe_prova_distribuivel(p_prova_id) then
        raise exception 'Prova não disponível para distribuição nesta conta';
    end if;

    select c.id, c.empresa_id, c.titulo
      into v_conteudo_id, v_empresa, v_titulo
      from public.provas_direcionadas pd
      join public.ia_conteudos c on c.id = pd.ia_conteudo_id
     where pd.id = p_prova_id;

    if v_tipo = 'TURMA' then
        if p_destino_id is null
           or not exists (
               select 1
                 from public.turmas t
                where t.id = p_destino_id
                  and t.empresa_id is not distinct from v_empresa
           )
           or not public.sulsafe_acessa_turma(p_destino_id) then
            raise exception 'Turma inválida ou de outra empresa';
        end if;

        select coalesce(array_agg(ta.aluno_id), '{}'::uuid[])
          into v_alunos
          from public.turma_alunos ta
         where ta.turma_id = p_destino_id;
        v_destino_id := p_destino_id;

    elsif v_tipo = 'ALUNO' then
        if p_destino_id is null
           or not exists (
               select 1
                 from public.profiles p
                 join public.turma_alunos ta on ta.aluno_id = p.id
                 join public.turmas t on t.id = ta.turma_id
                where p.id = p_destino_id
                  and p.role::text = 'aluno'
                  and p.status = 'ativo'
                  and t.empresa_id is not distinct from v_empresa
           )
           or not public.sulsafe_acessa_aluno(p_destino_id) then
            raise exception 'Aluno inválido ou de outra empresa';
        end if;

        v_alunos := array[p_destino_id]::uuid[];
        v_destino_id := p_destino_id;

    elsif v_tipo = 'CATALOGO' then
        select coalesce(array_agg(distinct ta.aluno_id), '{}'::uuid[])
          into v_alunos
          from public.turma_alunos ta
          join public.turmas t on t.id = ta.turma_id
         where t.empresa_id is not distinct from v_empresa;
        v_destino_id := null;
    else
        v_destino_id := null;
    end if;

    v_total := coalesce(array_length(v_alunos, 1), 0);

    if v_tipo <> 'INTERNO' and v_total = 0 then
        raise exception 'Nenhum aluno elegível para este destino';
    end if;

    foreach v_aluno in array coalesce(v_alunos, '{}'::uuid[])
    loop
        insert into public.provas_distribuicoes
            (prova_id, aluno_id, destino_tipo, destino_id, distribuido_por, distribuido_em)
        values
            (p_prova_id, v_aluno, v_tipo, v_destino_id, auth.uid(), v_agora);

        insert into public.notificacoes
            (usuario_id, titulo, mensagem, link, lida, criado_em)
        values
            (
                v_aluno,
                'Nova prova disponível',
                format('A prova "%s" foi disponibilizada para você.', coalesce(v_titulo, 'Prova')),
                '/provas',
                false,
                v_agora
            );
    end loop;

    update public.provas_direcionadas pd
       set turma_id = case when v_tipo = 'TURMA' then p_destino_id end,
           aluno_id = case when v_tipo = 'ALUNO' then p_destino_id end,
           destino_tipo = v_tipo,
           distribuido_por = case when v_tipo = 'INTERNO' then null else auth.uid() end,
           distribuido_em = case when v_tipo = 'INTERNO' then null else v_agora end
     where pd.id = p_prova_id;

    update public.ia_conteudos c
       set conteudo = c.conteudo || jsonb_build_object(
               'distribuicao_destino', v_tipo,
               'distribuicao_destino_id', case
                   when v_tipo in ('TURMA', 'ALUNO') then p_destino_id::text
                   else null
               end,
               'distribuicao_alunos', v_total,
               'distribuicao_por', case when v_tipo = 'INTERNO' then null else auth.uid()::text end,
               'distribuicao_em', case when v_tipo = 'INTERNO' then null else v_agora::text end
           ),
           atualizado_em = v_agora
     where c.id = v_conteudo_id;

    insert into public.provas_revisao_auditoria
        (prova_id, conteudo_id, acao, motivo, actor_id)
    values
        (
            p_prova_id,
            v_conteudo_id,
            case when v_tipo = 'INTERNO' then 'INTERNO' else 'DISTRIBUIDO' end,
            case
                when v_tipo = 'INTERNO' then 'Rascunho interno: sem entrega a alunos'
                else format('%s — %s aluno(s)', v_tipo, v_total)
            end,
            auth.uid()
        );

    return jsonb_build_object(
        'prova_id', p_prova_id,
        'destino_tipo', v_tipo,
        'destino_id', v_destino_id,
        'quantidade_alunos', v_total,
        'distribuido_por', case when v_tipo = 'INTERNO' then null else auth.uid() end,
        'distribuido_em', case when v_tipo = 'INTERNO' then null else v_agora end
    );
end;
$$;

revoke all on function public.sulsafe_distribuir_prova_ia(uuid, text, uuid) from public, anon;
grant execute on function public.sulsafe_distribuir_prova_ia(uuid, text, uuid) to authenticated;

comment on function public.sulsafe_distribuir_prova_ia(uuid, text, uuid) is
    'Distribui uma prova I.A. aprovada a turma, aluno ou catálogo da mesma empresa; INTERNO não entrega. Registra entregas, notificações e auditoria.';

-- Fim da Etapa 5/8.
