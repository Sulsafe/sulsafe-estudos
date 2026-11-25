-- ============================================================
-- FASE 5.2 — PALESTRAS (MANUAL + TUTOR-SulSafe) E DISTRIBUIÇÃO
-- ============================================================
-- Forward-only. Toda escrita passa por RPC SECURITY DEFINER com
-- validação de empresa e papel; nenhuma sessão do navegador escreve
-- diretamente nas tabelas. "Uso Pessoal" é INTERNO: nunca entrega.
-- ============================================================

create table if not exists public.palestras (
    id uuid primary key default gen_random_uuid(),
    empresa_id uuid not null,
    criado_por uuid not null references public.profiles(id),
    ia_conteudo_id uuid,
    origem text not null default 'MANUAL',
    titulo text not null,
    descricao text,
    publico_alvo text,
    duracao_min integer,
    nr_id integer,
    roteiro jsonb not null default '[]'::jsonb,
    aprovado boolean not null default false,
    aprovado_por uuid references public.profiles(id),
    aprovado_em timestamptz,
    publicado boolean not null default false,
    destino_tipo text,
    destino_id uuid,
    distribuido_por uuid references public.profiles(id),
    distribuido_em timestamptz,
    criado_em timestamptz not null default now()
);

create unique index if not exists palestras_ia_conteudo_uidx
    on public.palestras (ia_conteudo_id)
    where ia_conteudo_id is not null;

create index if not exists palestras_empresa_idx
    on public.palestras (empresa_id, criado_em desc);

create table if not exists public.palestras_distribuicoes (
    palestra_id uuid not null references public.palestras(id) on delete cascade,
    aluno_id uuid not null references public.profiles(id) on delete cascade,
    empresa_id uuid not null,
    distribuido_por uuid references public.profiles(id),
    distribuido_em timestamptz not null default now(),
    unique (palestra_id, aluno_id)
);

create index if not exists palestras_distribuicoes_aluno_idx
    on public.palestras_distribuicoes (aluno_id);

alter table public.palestras enable row level security;
alter table public.palestras_distribuicoes enable row level security;

revoke all on public.palestras from anon, authenticated;
revoke all on public.palestras_distribuicoes from anon, authenticated;

-- Leitura direta apenas para gestores, ou para o aluno que recebeu a
-- palestra. Escrita continua exclusivamente nas RPCs abaixo.
create policy palestras_leitura_segura on public.palestras
    for select to authenticated
    using (
        public.sulsafe_empresa_id() = empresa_id
        and (
            public.sulsafe_is_professor()
            or exists (
                select 1 from public.palestras_distribuicoes d
                 where d.palestra_id = public.palestras.id
                   and d.aluno_id = auth.uid()
            )
        )
    );

grant select on public.palestras to authenticated;

create policy palestras_distribuicoes_leitura_segura
    on public.palestras_distribuicoes
    for select to authenticated
    using (aluno_id = auth.uid() or public.sulsafe_is_professor());

grant select on public.palestras_distribuicoes to authenticated;

-- ------------------------------------------------------------
-- CRIAÇÃO MANUAL
-- ------------------------------------------------------------

create or replace function public.sulsafe_criar_palestra(
    p_titulo text,
    p_descricao text default null,
    p_publico_alvo text default null,
    p_duracao_min integer default null,
    p_roteiro text default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid := public.sulsafe_empresa_id();
    v_roteiro jsonb;
    v_id uuid;
begin
    if not public.sulsafe_conta_ativa()
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem criar palestras';
    end if;
    if v_empresa is null then
        raise exception 'Empresa não identificada';
    end if;
    if nullif(btrim(coalesce(p_titulo, '')), '') is null then
        raise exception 'Informe o título da palestra';
    end if;

    begin
        v_roteiro := coalesce(p_roteiro, '[]')::jsonb;
    exception when others then
        raise exception 'Roteiro inválido';
    end;
    if jsonb_typeof(v_roteiro) <> 'array' then
        raise exception 'Roteiro inválido';
    end if;

    insert into public.palestras
        (empresa_id, criado_por, origem, titulo, descricao, publico_alvo, duracao_min, roteiro)
    values
        (v_empresa, auth.uid(), 'MANUAL', btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''),
         nullif(btrim(coalesce(p_publico_alvo, '')), ''), p_duracao_min, v_roteiro)
    returning id into v_id;

    return v_id;
end;
$$;

-- ------------------------------------------------------------
-- CRIAÇÃO A PARTIR DE RASCUNHO DO TUTOR
-- ------------------------------------------------------------

create or replace function public.sulsafe_criar_palestra_ia(p_conteudo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid := public.sulsafe_empresa_id();
    v_conteudo public.ia_conteudos%rowtype;
    v_id uuid;
begin
    if not public.sulsafe_conta_ativa()
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem usar a I.A.';
    end if;

    select * into v_conteudo
      from public.ia_conteudos c
     where c.id = p_conteudo_id
       and c.tipo = 'PALESTRA'
       and c.aprovado = true
       and c.rejeitado = false
       and c.empresa_id = v_empresa;

    if not found then
        raise exception 'Rascunho de I.A. inválido ou de outra empresa';
    end if;

    insert into public.palestras
        (empresa_id, criado_por, ia_conteudo_id, origem, titulo, descricao,
         publico_alvo, duracao_min, roteiro)
    values
        (v_empresa, auth.uid(), v_conteudo.id, 'IA_TUTOR', v_conteudo.titulo,
         v_conteudo.conteudo ->> 'descricao', v_conteudo.conteudo ->> 'publicoAlvo',
         nullif(v_conteudo.conteudo ->> 'duracao_min', '')::integer,
         coalesce(v_conteudo.conteudo -> 'roteiro', '[]'::jsonb))
    on conflict (ia_conteudo_id) where ia_conteudo_id is not null do nothing;

    select p.id into v_id
      from public.palestras p
     where p.ia_conteudo_id = v_conteudo.id;

    return v_id;
end;
$$;

-- ------------------------------------------------------------
-- APROVAÇÃO HITL — NÃO ENTREGA NADA
-- ------------------------------------------------------------

create or replace function public.sulsafe_aprovar_palestra(p_palestra_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.sulsafe_conta_ativa()
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem aprovar palestras';
    end if;

    update public.palestras p
       set aprovado = true,
           publicado = true,
           aprovado_por = auth.uid(),
           aprovado_em = now()
     where p.id = p_palestra_id
       and p.empresa_id = public.sulsafe_empresa_id();

    if not found then
        raise exception 'Palestra inválida ou de outra empresa';
    end if;
    return true;
end;
$$;

-- ------------------------------------------------------------
-- DISTRIBUIÇÃO — ATO SEPARADO E EXPLÍCITO
-- ------------------------------------------------------------

create or replace function public.sulsafe_distribuir_palestra(
    p_palestra_id uuid,
    p_destino_tipo text,
    p_destino_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_agora timestamptz := now();
    v_tipo text := upper(btrim(coalesce(p_destino_tipo, '')));
    v_empresa uuid := public.sulsafe_empresa_id();
    v_palestra public.palestras%rowtype;
    v_aluno uuid;
    v_total integer := 0;
begin
    if not public.sulsafe_conta_ativa()
       or not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        raise exception 'Somente administradores e professores podem distribuir palestras';
    end if;

    if v_tipo not in ('INTERNO', 'TURMA', 'ALUNO', 'CATALOGO') then
        raise exception 'Destino inválido';
    end if;

    select * into v_palestra
      from public.palestras p
     where p.id = p_palestra_id
       and p.empresa_id = v_empresa;

    if not found then
        raise exception 'Palestra inválida ou de outra empresa';
    end if;
    if not v_palestra.publicado then
        raise exception 'Aprove a palestra antes de distribuí-la';
    end if;

    if v_tipo = 'TURMA' then
        if p_destino_id is null
           or not public.sulsafe_acessa_turma(p_destino_id)
           or not exists (
                select 1 from public.turmas t
                 where t.id = p_destino_id and t.empresa_id = v_empresa
           ) then
            raise exception 'Turma inválida ou de outra empresa';
        end if;
    elsif v_tipo = 'ALUNO' then
        if p_destino_id is null or not public.sulsafe_acessa_aluno(p_destino_id) then
            raise exception 'Aluno inválido ou de outra empresa';
        end if;
    end if;

    -- A validação do destino vem primeiro para não disfarçar erro de escopo
    -- com uma mensagem de já distribuída.
    if v_tipo <> 'INTERNO' and v_palestra.distribuido_em is not null then
        raise exception 'Palestra já distribuída';
    end if;

    -- Uso Pessoal: só registra a intenção; não cria vínculo nem notificação.
    if v_tipo = 'INTERNO' then
        update public.palestras p
           set destino_tipo = 'INTERNO',
               destino_id = null
         where p.id = p_palestra_id;
        return 0;
    end if;

    if v_tipo = 'TURMA' then
        for v_aluno in
            select ta.aluno_id
              from public.turma_alunos ta
              join public.profiles pr on pr.id = ta.aluno_id
             where ta.turma_id = p_destino_id
               and pr.status = 'ativo'
               and pr.role = 'aluno'
        loop
            insert into public.palestras_distribuicoes
                (palestra_id, aluno_id, empresa_id, distribuido_por, distribuido_em)
            values (p_palestra_id, v_aluno, v_empresa, auth.uid(), v_agora)
            on conflict (palestra_id, aluno_id) do nothing;
            if found then
                v_total := v_total + 1;
                insert into public.notificacoes (usuario_id, titulo, mensagem, link, lida)
                values (v_aluno, 'Nova palestra disponível',
                        'Palestra "' || v_palestra.titulo || '" disponível no seu painel.',
                        'aluno-dashboard', false);
            end if;
        end loop;
    elsif v_tipo = 'ALUNO' then
        insert into public.palestras_distribuicoes
            (palestra_id, aluno_id, empresa_id, distribuido_por, distribuido_em)
        values (p_palestra_id, p_destino_id, v_empresa, auth.uid(), v_agora)
        on conflict (palestra_id, aluno_id) do nothing;
        if found then
            v_total := 1;
            insert into public.notificacoes (usuario_id, titulo, mensagem, link, lida)
            values (p_destino_id, 'Nova palestra disponível',
                    'Palestra "' || v_palestra.titulo || '" disponível no seu painel.',
                    'aluno-dashboard', false);
        end if;
    else
        for v_aluno in
            select distinct ta.aluno_id
              from public.turma_alunos ta
              join public.turmas t on t.id = ta.turma_id
              join public.profiles pr on pr.id = ta.aluno_id
             where t.empresa_id = v_empresa
               and pr.status = 'ativo'
               and pr.role = 'aluno'
        loop
            insert into public.palestras_distribuicoes
                (palestra_id, aluno_id, empresa_id, distribuido_por, distribuido_em)
            values (p_palestra_id, v_aluno, v_empresa, auth.uid(), v_agora)
            on conflict (palestra_id, aluno_id) do nothing;
            if found then
                v_total := v_total + 1;
                insert into public.notificacoes (usuario_id, titulo, mensagem, link, lida)
                values (v_aluno, 'Nova palestra disponível',
                        'Palestra "' || v_palestra.titulo || '" disponível no seu painel.',
                        'aluno-dashboard', false);
            end if;
        end loop;
    end if;

    update public.palestras p
       set destino_tipo = v_tipo,
           destino_id = p_destino_id,
           distribuido_por = auth.uid(),
           distribuido_em = v_agora
     where p.id = p_palestra_id;

    return v_total;
end;
$$;

-- ------------------------------------------------------------
-- LEITURAS VIA RPC (PALESTRAS NÃO SÃO LIDAS DIRETAMENTE)
-- ------------------------------------------------------------

create or replace function public.sulsafe_listar_palestras_professor()
returns table (
    id uuid,
    titulo text,
    descricao text,
    publico_alvo text,
    duracao_min integer,
    nr_id integer,
    roteiro jsonb,
    origem text,
    publicado boolean,
    aprovado boolean,
    destino_tipo text,
    distribuido_em timestamptz,
    criado_em timestamptz
)
language sql stable security definer set search_path = ''
as $$
    select p.id, p.titulo, p.descricao, p.publico_alvo, p.duracao_min, p.nr_id,
           p.roteiro, p.origem, p.publicado, p.aprovado, p.destino_tipo,
           p.distribuido_em, p.criado_em
      from public.palestras p
     where p.empresa_id = public.sulsafe_empresa_id()
       and (public.sulsafe_is_admin() or public.sulsafe_is_professor())
     order by p.criado_em desc
$$;

create or replace function public.sulsafe_listar_palestras_aluno()
returns table (
    id uuid,
    titulo text,
    descricao text,
    roteiro jsonb,
    duracao_min integer,
    origem text,
    distribuido_em timestamptz
)
language sql stable security definer set search_path = ''
as $$
    select p.id, p.titulo, p.descricao, p.roteiro, p.duracao_min, p.origem,
           d.distribuido_em
      from public.palestras_distribuicoes d
      join public.palestras p on p.id = d.palestra_id
     where d.aluno_id = auth.uid()
       and d.empresa_id = public.sulsafe_empresa_id()
       and p.publicado = true
     order by d.distribuido_em desc
$$;

revoke all on function public.sulsafe_criar_palestra(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.sulsafe_criar_palestra(text, text, text, integer, text) to authenticated;

revoke all on function public.sulsafe_criar_palestra_ia(uuid) from public, anon, authenticated;
grant execute on function public.sulsafe_criar_palestra_ia(uuid) to authenticated;

revoke all on function public.sulsafe_aprovar_palestra(uuid) from public, anon, authenticated;
grant execute on function public.sulsafe_aprovar_palestra(uuid) to authenticated;

revoke all on function public.sulsafe_distribuir_palestra(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.sulsafe_distribuir_palestra(uuid, text, uuid) to authenticated;

revoke all on function public.sulsafe_listar_palestras_professor() from public, anon, authenticated;
grant execute on function public.sulsafe_listar_palestras_professor() to authenticated;

revoke all on function public.sulsafe_listar_palestras_aluno() from public, anon, authenticated;
grant execute on function public.sulsafe_listar_palestras_aluno() to authenticated;
