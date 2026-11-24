-- ============================================================
-- PROFESSOR I.A — FASE 2: EMPRESAS E CONVITE COM CLAIM (OPÇÃO A)
-- ============================================================
-- D-TUTOR-11: o ADMIN cadastra a empresa e convida o usuário por uma Edge
-- Function com service_role, que injeta app_metadata: { empresa_id } no
-- momento do createUser. O claim é emitido pelo servidor, nunca pelo navegador.
-- D-TUTOR-12: usuario_empresas fica pré-aprovada para o futuro, FORA desta migration.
-- D-TUTOR-13: vínculo por domínio de e-mail descartado por risco de segurança.
--
-- Segurança: RLS + REVOKE explícito; RPC SECURITY DEFINER com search_path ''.
-- Esta migration NÃO toca auth.users nem perfis existentes: o claim só entra
-- em novos convites feitos pela Edge Function admin-convidar-usuario.

-- ------------------------------------------------------------
-- 1. CADASTRO MÍNIMO DE EMPRESAS
-- ------------------------------------------------------------

create table if not exists public.empresas (
    id uuid primary key default gen_random_uuid(),
    nome text not null check (length(btrim(nome)) between 1 and 120),
    ativo boolean not null default true,
    criado_por uuid references public.profiles (id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create unique index if not exists empresas_nome_unico
    on public.empresas (lower(btrim(nome)));

comment on table public.empresas is
    'Cadastro mínimo de empresas para o claim app_metadata.empresa_id (D-TUTOR-11). Catálogo de NRs permanece global.';

create or replace function public.sulsafe_empresas_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.atualizado_em := now();
    return new;
end;
$$;

drop trigger if exists trg_empresas_touch on public.empresas;
create trigger trg_empresas_touch
before update on public.empresas
for each row execute function public.sulsafe_empresas_touch();

-- ------------------------------------------------------------
-- 2. RLS E GRANTS
-- ------------------------------------------------------------

alter table public.empresas enable row level security;

revoke all on public.empresas from anon, authenticated;
grant select, insert, update on public.empresas to authenticated;
grant all on public.empresas to service_role;

-- ADMIN vê todas; demais perfis veem apenas a própria empresa ativa.
create policy sulsafe_empresas_select on public.empresas
    for select to authenticated
    using (
        public.sulsafe_is_admin()
        or (ativo and id = public.sulsafe_empresa_id())
    );

create policy sulsafe_empresas_insert_admin on public.empresas
    for insert to authenticated
    with check (public.sulsafe_is_admin());

create policy sulsafe_empresas_update_admin on public.empresas
    for update to authenticated
    using (public.sulsafe_is_admin())
    with check (public.sulsafe_is_admin());

-- Sem policy de DELETE: empresas nunca são apagadas por esta tela.

-- ------------------------------------------------------------
-- 3. AUTORIZAÇÃO DO CONVITE (CHAMADOR DA EDGE FUNCTION)
-- ------------------------------------------------------------
-- A Edge Function usa service_role para chamar a Admin API do Auth, mas quem
-- autoriza o convite é o JWT do ADMIN, verificado por esta RPC com a chave anon.

create or replace function public.sulsafe_pode_convidar_empresa(p_empresa_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if p_empresa_id is null then
        return false;
    end if;

    if not public.sulsafe_conta_ativa() then
        return false;
    end if;

    if not public.sulsafe_is_admin() then
        return false;
    end if;

    return exists (
        select 1 from public.empresas e
        where e.id = p_empresa_id
          and e.ativo
    );
end;
$$;

revoke all on function public.sulsafe_pode_convidar_empresa(uuid) from public, anon;
grant execute on function public.sulsafe_pode_convidar_empresa(uuid) to authenticated;

comment on function public.sulsafe_pode_convidar_empresa(uuid) is
    'Verifica, com o JWT do ADMIN, se ele pode convidar usuários para uma empresa ativa. Usada pela Edge Function antes de usar service_role.';
