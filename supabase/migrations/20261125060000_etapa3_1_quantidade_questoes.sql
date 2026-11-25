-- ============================================================
-- FASE 5 (ETAPA 3.1) — QUANTIDADE DE QUESTÕES POR PROVA
-- ============================================================
-- Forward-only: nenhuma migration aplicada é editada.
--
--   * ia_jobs.quantidade_questoes registra o pedido do instrutor (padrão 10).
--   * CHECK 1..50: limite de segurança, também aplicado no worker e no front.
--   * sulsafe_criar_ia_job ganha um 6º parâmetro opcional; as chamadas
--     antigas de 5 argumentos continuam válidas por DEFAULT.
--
-- Nenhuma chave de API participa desta função. Nenhuma tabela é recriada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNA E CHECK DE SEGURANÇA
-- ------------------------------------------------------------

alter table public.ia_jobs
    add column if not exists quantidade_questoes integer;

do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conrelid = 'public.ia_jobs'::regclass
           and conname = 'ia_jobs_quantidade_questoes_check'
    ) then
        alter table public.ia_jobs
            add constraint ia_jobs_quantidade_questoes_check
            check (quantidade_questoes between 1 and 50);
    end if;
end;
$$;

comment on column public.ia_jobs.quantidade_questoes is
    'Quantidade de questões pedida para provas geradas pelo Tutor (1 a 50; padrão 10).';

-- ------------------------------------------------------------
-- 2. RPC DE CRIAÇÃO — overload único com parâmetro opcional
-- ------------------------------------------------------------

drop function if exists public.sulsafe_criar_ia_job(text, text, text, uuid, text);

create or replace function public.sulsafe_criar_ia_job(
    p_titulo text,
    p_prompt text,
    p_tipo text default 'CURSO',
    p_empresa_id uuid default null,
    p_provedor text default null,
    p_quantidade_questoes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
    v_id uuid;
    v_quantidade integer;
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

    if p_quantidade_questoes is not null and p_quantidade_questoes not between 1 and 50 then
        raise exception 'A prova pode ter no máximo 50 questões (entre 1 e 50)';
    end if;

    v_empresa := public.sulsafe_empresa_id();

    if public.sulsafe_is_admin() then
        v_empresa := coalesce(p_empresa_id, v_empresa);
    elsif p_empresa_id is not null and p_empresa_id is distinct from v_empresa then
        raise exception 'Você não pode gerar conteúdo para outra empresa';
    end if;

    v_quantidade := case
        when p_tipo = 'PROVA' then coalesce(p_quantidade_questoes, 10)
        else p_quantidade_questoes
    end;

    insert into public.ia_jobs
        (empresa_id, criado_por, tipo, titulo, prompt, provedor, quantidade_questoes)
    values
        (v_empresa, auth.uid(), p_tipo, btrim(p_titulo), btrim(p_prompt), p_provedor, v_quantidade)
    returning id into v_id;

    return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. PERMISSÕES — o novo overload substitui o anterior
-- ------------------------------------------------------------

revoke all on function public.sulsafe_criar_ia_job(text, text, text, uuid, text, integer) from public, anon;
grant execute on function public.sulsafe_criar_ia_job(text, text, text, uuid, text, integer) to authenticated;
