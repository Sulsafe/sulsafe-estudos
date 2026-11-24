-- ============================================================
-- TUTOR-SULSAFE — CONFIGURAÇÃO PARA O WORKER (EDGE FUNCTION)
-- ============================================================
-- A Edge Function roda com service_role e precisa ler provedor, URL, modelo
-- e a chave descriptografada do Vault. Esta RPC é o ÚNICO caminho para isso:
-- anon/authenticated não recebem EXECUTE e a chave nunca volta ao navegador.
--
-- Regra de proveniência da chave:
--   * provedor 'sulsafe_api' -> segredo global 'sulsafe_ia_chave_global'
--   * demais provedores      -> referência 'vault:<nome>' em config_ia_professor
--
-- Nenhuma chave é gravada em log, tabela ou resposta de RPC de leitura comum.

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

-- ------------------------------------------------------------
-- FLAG LEVE PARA A UI (NÃO EXPÕE URL, MODELO NEM CHAVE)
-- ------------------------------------------------------------

create or replace function public.sulsafe_tutor_habilitado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.config_ia_professor c
        where c.id = 'principal'
          and c.ativo
          and c.provedor <> 'desativado'
    );
$$;

revoke all on function public.sulsafe_tutor_habilitado() from public, anon;
grant execute on function public.sulsafe_tutor_habilitado() to authenticated;

comment on function public.sulsafe_tutor_habilitado() is
    'Flag pública para ADMIN/PROFESSOR saberem se o Professor I.A. está configurado. Não devolve segredos.';

-- ------------------------------------------------------------
-- AUTORIZAÇÃO DO CHAMADOR DA EDGE FUNCTION
-- ------------------------------------------------------------
-- A Edge Function usa service_role para gravar, mas precisa confirmar que o
-- navegador que pediu a geração tem direito sobre aquele job. Sem isso, quem
-- obtivesse um job_id poderia disparar o worker.

create or replace function public.sulsafe_pode_processar_ia_job(p_job_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_job public.ia_jobs%rowtype;
begin
    if p_job_id is null then
        return false;
    end if;

    if not public.sulsafe_conta_ativa() then
        return false;
    end if;

    if not (public.sulsafe_is_admin() or public.sulsafe_is_professor()) then
        return false;
    end if;

    select * into v_job from public.ia_jobs j where j.id = p_job_id;
    if not found then
        return false;
    end if;

    if public.sulsafe_is_admin() then
        return true;
    end if;

    return v_job.empresa_id is not distinct from public.sulsafe_empresa_id()
       and v_job.criado_por = auth.uid();
end;
$$;

revoke all on function public.sulsafe_pode_processar_ia_job(uuid) from public, anon;
grant execute on function public.sulsafe_pode_processar_ia_job(uuid) to authenticated;

comment on function public.sulsafe_pode_processar_ia_job(uuid) is
    'Verifica, com o JWT do usuário, se ele pode disparar a geração deste job. Usada pela Edge Function antes de agir com service_role.';
