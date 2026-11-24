-- ============================================================
-- PROFESSOR I.A (IA 2) — CONFIGURAÇÃO PLUGÁVEL / BYOA
-- ============================================================
-- Apenas ESTRUTURA. Esta migration NÃO implementa geração de cursos.
-- Regras de negócio:
--   * Secretária (IA 1) = grátis, local, sempre inclusa.
--   * Professor I.A com API da SulSafe = cobrado à parte, valor negociado
--     caso a caso (sem preço fixo, sem Mercado Pago).
--   * Professor I.A com API própria = a empresa paga a API dela.
--   * A chave nunca fica no navegador: a RPC grava no Supabase Vault e a
--     tabela guarda somente a referência "vault:<nome>".
-- Padrão: provedor = desativado e ativo = false (botão "Criar com I.A" oculto).

create table if not exists public.config_ia_professor (
    id text primary key default 'principal' check (id = 'principal'),
    provedor text not null default 'desativado'
        check (provedor in ('sulsafe_api', 'openai', 'gemini', 'anthropic', 'custom', 'desativado')),
    api_url text,
    -- Somente referência ao Vault (vault:<nome>). NUNCA a chave em claro.
    api_key_encriptada text,
    modelo text,
    ativo boolean not null default false,
    observacao text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint config_ia_api_url_https check (api_url is null or api_url ~* '^https://')
);

comment on column public.config_ia_professor.api_key_encriptada is
    'Referência ao segredo no Supabase Vault (vault:<nome>). A chave em claro nunca é armazenada nesta tabela.';

-- Linha única, já desativada por padrão.
insert into public.config_ia_professor (id, provedor, ativo)
values ('principal', 'desativado', false)
on conflict (id) do nothing;

alter table public.config_ia_professor enable row level security;

-- Nenhum acesso direto via PostgREST: somente as RPCs abaixo.
revoke all on public.config_ia_professor from anon, authenticated;

drop policy if exists "sulsafe_config_ia_admin_select" on public.config_ia_professor;
create policy "sulsafe_config_ia_admin_select" on public.config_ia_professor
    for select to authenticated
    using (public.sulsafe_is_admin());

-- ============================================================
-- LEITURA SEGURA: nunca devolve api_key_encriptada
-- ============================================================

create or replace function public.sulsafe_get_config_ia_professor()
returns table (
    provedor text,
    api_url text,
    modelo text,
    ativo boolean,
    chave_configurada boolean,
    observacao text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not public.sulsafe_is_admin() then
        raise exception 'Somente administradores podem ver a configuração do Professor I.A';
    end if;

    return query
    select
        c.provedor,
        c.api_url,
        c.modelo,
        c.ativo,
        (c.api_key_encriptada is not null and c.api_key_encriptada <> ''),
        c.observacao
    from public.config_ia_professor c
    where c.id = 'principal';
end;
$$;

-- ============================================================
-- ESCRITA SEGURA: chave vai para o Vault, referência vai para a tabela
-- ============================================================

create or replace function public.sulsafe_configurar_ia_professor(
    p_provedor text,
    p_api_url text default null,
    p_modelo text default null,
    p_ativo boolean default false,
    p_api_key text default null,
    p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_referencia text;
    v_nome_segredo text;
    v_ativo boolean;
begin
    if auth.uid() is null or not public.sulsafe_is_admin() then
        raise exception 'Somente administradores podem configurar o Professor I.A';
    end if;

    if p_provedor is null or p_provedor not in
        ('sulsafe_api', 'openai', 'gemini', 'anthropic', 'custom', 'desativado') then
        raise exception 'Provedor inválido';
    end if;

    if p_api_url is not null and p_api_url !~* '^https://' then
        raise exception 'A URL da API deve começar com https://';
    end if;

    -- Desativado nunca pode ficar ativo.
    v_ativo := coalesce(p_ativo, false);
    if p_provedor = 'desativado' then
        v_ativo := false;
    end if;

    -- Mantém a referência atual quando o admin não reenvia a chave.
    select c.api_key_encriptada into v_referencia
    from public.config_ia_professor c
    where c.id = 'principal';

    if p_api_key is not null and length(btrim(p_api_key)) > 0 then
        if to_regprocedure('vault.create_secret(text,text,text)') is null then
            raise exception 'Supabase Vault não está habilitado; ative-o antes de salvar uma chave';
        end if;

        v_nome_segredo := 'sulsafe_ia_professor_' || replace(auth.uid()::text, '-', '');
        perform vault.create_secret(
            btrim(p_api_key),
            v_nome_segredo,
            'Chave da API do Professor I.A (BYOA)'
        );
        v_referencia := 'vault:' || v_nome_segredo;
    end if;

    -- API própria sem chave não pode ser ativada.
    if v_ativo and p_provedor in ('openai', 'gemini', 'anthropic', 'custom')
       and (v_referencia is null or v_referencia = '') then
        raise exception 'Configure a chave da API própria antes de ativar o Professor I.A';
    end if;

    insert into public.config_ia_professor (
        id, provedor, api_url, api_key_encriptada, modelo, ativo, observacao, atualizado_em
    )
    values (
        'principal', p_provedor, nullif(btrim(coalesce(p_api_url, '')), ''),
        v_referencia, nullif(btrim(coalesce(p_modelo, '')), ''), v_ativo,
        nullif(btrim(coalesce(p_observacao, '')), ''), now()
    )
    on conflict (id) do update set
        provedor = excluded.provedor,
        api_url = excluded.api_url,
        api_key_encriptada = excluded.api_key_encriptada,
        modelo = excluded.modelo,
        ativo = excluded.ativo,
        observacao = excluded.observacao,
        atualizado_em = excluded.atualizado_em;
end;
$$;

-- ============================================================
-- PERMISSÕES
-- ============================================================

revoke all on function public.sulsafe_get_config_ia_professor() from public, anon;
revoke all on function public.sulsafe_configurar_ia_professor(text, text, text, boolean, text, text) from public, anon;

grant execute on function public.sulsafe_get_config_ia_professor() to authenticated;
grant execute on function public.sulsafe_configurar_ia_professor(text, text, text, boolean, text, text) to authenticated;
