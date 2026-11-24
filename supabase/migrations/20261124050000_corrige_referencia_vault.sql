-- ============================================================
-- CORREÇÃO — EXTRAÇÃO DO NOME DO SEGREDO NO VAULT
-- ============================================================
-- A versão anterior usava substring(... from 6), que devolvia o nome do
-- segredo com os dois-pontos iniciais (":sulsafe_ia_chave_global") e fazia a
-- RPC do worker responder "Chave de API do Professor I.A. não encontrada no
-- Vault". 'vault:' tem 6 caracteres; o nome começa na posição 7.
--
-- Esta migration corrige a função em ambientes onde 20261124030000 já foi
-- aplicada. A migration original também foi corrigida para instalações limpas.

create or replace function public.sulsafe_obter_config_ia_worker()
returns table (
    provedor text,
    api_url text,
    modelo text,
    ativo boolean,
    api_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_config public.config_ia_professor%rowtype;
    v_nome_segredo text;
    v_chave text;
begin
    select * into v_config
      from public.config_ia_professor c
     where c.id = 'principal';

    if not found then
        raise exception 'Configuração do Professor I.A. não encontrada';
    end if;

    if not v_config.ativo or v_config.provedor = 'desativado' then
        raise exception 'Professor I.A. está desativado';
    end if;

    if to_regclass('vault.decrypted_secrets') is null then
        raise exception 'Supabase Vault não está habilitado';
    end if;

    if v_config.provedor = 'sulsafe_api' then
        v_nome_segredo := 'sulsafe_ia_chave_global';
    elsif v_config.api_key_encriptada like 'vault:%' then
        v_nome_segredo := substring(v_config.api_key_encriptada from 7);
    else
        raise exception 'Referência de chave inválida na configuração do Professor I.A';
    end if;

    execute format(
        'select decrypted_secret from vault.decrypted_secrets where name = %L limit 1',
        v_nome_segredo
    ) into v_chave;

    if v_chave is null or btrim(v_chave) = '' then
        raise exception 'Chave de API do Professor I.A. não encontrada no Vault';
    end if;

    return query
    select v_config.provedor,
           v_config.api_url,
           v_config.modelo,
           v_config.ativo,
           v_chave;
end;
$$;

revoke all on function public.sulsafe_obter_config_ia_worker() from public, anon, authenticated;
grant execute on function public.sulsafe_obter_config_ia_worker() to service_role;

comment on function public.sulsafe_obter_config_ia_worker() is
    'Uso exclusivo da Edge Function do Tutor-Sulsafe. Devolve a chave descriptografada apenas para service_role.';
