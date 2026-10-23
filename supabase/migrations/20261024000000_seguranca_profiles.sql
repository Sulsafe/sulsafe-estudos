-- ============================================================
-- SEGURANCA DE PROFILES E DOSSIÊ
-- ============================================================
-- Corrige falhas de autorizacao em public.profiles:
-- - ativa RLS (a tabela estava sem RLS);
-- - remove policies antigas e recursivas;
-- - impede que o proprio usuario altere role/status/email/dossie;
-- - valida CPF completo (digitos verificadores) no servidor;
-- - impede remover o ultimo administrador ativo;
-- - registra auditoria de mudancas de dossie;
-- - expõe apenas colunas seguras por RPC.
--
-- Pre-requisito: aplicar antes a migration
-- 20261023100000_dossie_sistec.sql, que cria as colunas do dossie.
-- Esta migration NAO deve ser aplicada automaticamente em producao.
-- ============================================================

begin;

-- ============================================================
-- 1. HELPERS DE AUTORIZACAO
-- ============================================================

create or replace function public.sulsafe_conta_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select auth.uid() is not null
       and exists (
           select 1
           from public.profiles p
           where p.id = auth.uid()
             and p.status = 'ativo'
       );
$$;

create or replace function public.sulsafe_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'ativo'
          and p.role::text = 'super_admin'
    );
$$;

create or replace function public.sulsafe_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.status = 'ativo'
          and p.role::text in ('admin', 'super_admin')
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.sulsafe_is_admin();
$$;

revoke all on function public.sulsafe_conta_ativa() from public;
revoke all on function public.sulsafe_is_super_admin() from public;
revoke all on function public.sulsafe_is_admin() from public;
revoke all on function public.is_admin() from public;

grant execute on function public.sulsafe_conta_ativa() to authenticated, service_role;
grant execute on function public.sulsafe_is_super_admin() to authenticated, service_role;
grant execute on function public.sulsafe_is_admin() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- A funcao de trigger nao precisa ser chamavel via API.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- ============================================================
-- 2. VALIDACAO COMPLETA DE CPF
-- ============================================================

create or replace function public.sulsafe_cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
    v_soma integer;
    v_digito1 integer;
    v_digito2 integer;
    v_i integer;
begin
    if v_cpf !~ '^[0-9]{11}$' then
        return false;
    end if;

    -- Rejeita sequencias como 00000000000 e 11111111111.
    if v_cpf ~ '^([0-9])\1{10}$' then
        return false;
    end if;

    v_soma := 0;
    for v_i in 1..9 loop
        v_soma := v_soma + (substr(v_cpf, v_i, 1))::integer * (11 - v_i);
    end loop;
    v_digito1 := (v_soma * 10) % 11;
    if v_digito1 = 10 then
        v_digito1 := 0;
    end if;

    v_soma := 0;
    for v_i in 1..10 loop
        v_soma := v_soma + (substr(v_cpf, v_i, 1))::integer * (12 - v_i);
    end loop;
    v_digito2 := (v_soma * 10) % 11;
    if v_digito2 = 10 then
        v_digito2 := 0;
    end if;

    return (substr(v_cpf, 10, 1))::integer = v_digito1
       and (substr(v_cpf, 11, 1))::integer = v_digito2;
end;
$$;

revoke all on function public.sulsafe_cpf_valido(text) from public;
grant execute on function public.sulsafe_cpf_valido(text) to authenticated, service_role;

-- ============================================================
-- 3. PROTECAO DE CAMPOS PRIVILEGIADOS
-- ============================================================

create or replace function public.sulsafe_proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_old jsonb;
    v_new jsonb;
    v_old_role text;
    v_old_status text;
    v_role text;
    v_status text;
    v_admin boolean := false;
    v_super boolean := false;
    v_service boolean;
    v_self_dossie boolean;
begin
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_old_role := v_old->>'role';
    v_old_status := v_old->>'status';
    v_role := v_new->>'role';
    v_status := v_new->>'status';
    v_service := coalesce(auth.role(), '') = 'service_role';
    v_self_dossie :=
        coalesce(current_setting('sulsafe.dossie_self_update', true), '') = 'on';

    if new.id is distinct from old.id then
        raise exception 'O identificador do perfil nao pode ser alterado.'
            using errcode = '42501';
    end if;

    if not v_service then
        v_admin := public.sulsafe_is_admin();
        v_super := public.sulsafe_is_super_admin();
    end if;

    -- Usuario comum: nao altera campos administrativos nem de auditoria.
    if not v_service and not v_admin then
        if v_role is distinct from v_old_role then
            raise exception 'Somente administradores podem alterar o perfil de acesso.'
                using errcode = '42501';
        end if;

        if v_status is distinct from v_old_status then
            raise exception 'Somente administradores podem alterar o status da conta.'
                using errcode = '42501';
        end if;

        if v_new->>'email' is distinct from v_old->>'email' then
            raise exception 'O email da conta nao pode ser alterado pelo perfil.'
                using errcode = '42501';
        end if;

        -- Dados de matricula so podem ser gravados pela RPC do dossie,
        -- que tambem devolve o dossie para pendente e registra auditoria.
        if not v_self_dossie
           and (
               v_new->>'cpf' is distinct from v_old->>'cpf'
               or v_new->>'data_nascimento' is distinct from v_old->>'data_nascimento'
               or v_new->>'cor_raca' is distinct from v_old->>'cor_raca'
               or v_new->>'renda_per_capita' is distinct from v_old->>'renda_per_capita'
               or v_new->>'identidade_genero' is distinct from v_old->>'identidade_genero'
               or v_new->>'tipo_deficiencia' is distinct from v_old->>'tipo_deficiencia'
               or v_new->>'forma_acesso' is distinct from v_old->>'forma_acesso'
               or v_new->>'nome_mae' is distinct from v_old->>'nome_mae'
               or v_new->>'nacionalidade' is distinct from v_old->>'nacionalidade'
               or v_new->>'sexo' is distinct from v_old->>'sexo'
               or v_new->>'foto_url' is distinct from v_old->>'foto_url'
           ) then
            raise exception 'Use a tela do dossie para alterar os dados de matricula.'
                using errcode = '42501';
        end if;

        if v_new->>'dossie_status' is distinct from v_old->>'dossie_status' then
            if not (v_self_dossie and v_new->>'dossie_status' = 'pendente') then
                raise exception 'A situacao do dossie so pode ser alterada pela secretaria.'
                    using errcode = '42501';
            end if;
        end if;

        if v_new->>'dossie_observacoes' is distinct from v_old->>'dossie_observacoes'
           and not (v_self_dossie and v_new->>'dossie_observacoes' is null) then
            raise exception 'As observacoes do dossie so podem ser alteradas pela secretaria.'
                using errcode = '42501';
        end if;

        if (
            v_new->>'dossie_aprovado_em' is distinct from v_old->>'dossie_aprovado_em'
            and not (v_self_dossie and v_new->>'dossie_aprovado_em' is null)
        ) or (
            v_new->>'dossie_aprovado_por' is distinct from v_old->>'dossie_aprovado_por'
            and not (v_self_dossie and v_new->>'dossie_aprovado_por' is null)
        ) then
            raise exception 'Os dados de aprovacao do dossie sao somente leitura.'
                using errcode = '42501';
        end if;

        if v_new->>'cpf' is not null
           and v_new->>'cpf' is distinct from v_old->>'cpf'
           and not public.sulsafe_cpf_valido(v_new->>'cpf') then
            raise exception 'CPF invalido.' using errcode = '23514';
        end if;
    end if;

    -- Administrador: pode gerenciar, mas nao pode criar outro super_admin
    -- nem rebaixar/bloquear outro administrador sem ser super_admin.
    if not v_service and v_admin then
        if v_role is distinct from v_old_role
           and (v_role is null
                or v_role not in ('aluno', 'professor', 'admin', 'super_admin')) then
            raise exception 'Perfil de acesso invalido.' using errcode = '23514';
        end if;

        if v_status is distinct from v_old_status
           and (v_status is null
                or v_status not in ('ativo', 'pendente', 'bloqueado')) then
            raise exception 'Status de conta invalido.' using errcode = '23514';
        end if;

        if v_role = 'super_admin'
           and v_old_role is distinct from 'super_admin'
           and not v_super then
            raise exception 'Somente um super administrador pode promover outro super administrador.'
                using errcode = '42501';
        end if;

        if v_old_role in ('admin', 'super_admin')
           and not v_super
           and (v_role is distinct from v_old_role or v_status is distinct from v_old_status) then
            raise exception 'Somente um super administrador pode alterar outro administrador.'
                using errcode = '42501';
        end if;

        if v_new->>'cpf' is not null
           and v_new->>'cpf' is distinct from v_old->>'cpf'
           and not public.sulsafe_cpf_valido(v_new->>'cpf') then
            raise exception 'CPF invalido.' using errcode = '23514';
        end if;

        if v_new->>'dossie_status' = 'aprovado' then
            if not public.sulsafe_cpf_valido(v_new->>'cpf') then
                raise exception 'Nao e possivel aprovar um dossie com CPF invalido.'
                    using errcode = '23514';
            end if;
        end if;
    end if;

    -- O ultimo administrador ativo nao pode ser rebaixado ou bloqueado.
    if v_old_role in ('admin', 'super_admin')
       and v_old_status = 'ativo'
       and (
           v_role is null
           or v_role not in ('admin', 'super_admin')
           or v_status is null
           or v_status <> 'ativo'
       ) then
        if not exists (
            select 1
            from public.profiles p
            where p.id <> old.id
              and p.role::text in ('admin', 'super_admin')
              and p.status = 'ativo'
        ) then
            raise exception 'Nao e possivel remover ou bloquear o ultimo administrador ativo.'
                using errcode = '42501';
        end if;
    end if;

    return new;
end;
$$;

revoke all on function public.sulsafe_proteger_perfil() from public;

drop trigger if exists trg_profiles_protege_campos on public.profiles;
create trigger trg_profiles_protege_campos
before update on public.profiles
for each row execute function public.sulsafe_proteger_perfil();

create or replace function public.sulsafe_proteger_exclusao_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.role::text in ('admin', 'super_admin')
       and old.status = 'ativo'
       and not exists (
           select 1
           from public.profiles p
           where p.id <> old.id
             and p.role::text in ('admin', 'super_admin')
             and p.status = 'ativo'
       ) then
        raise exception 'Nao e possivel excluir o ultimo administrador ativo.'
            using errcode = '42501';
    end if;

    return old;
end;
$$;

revoke all on function public.sulsafe_proteger_exclusao_perfil() from public;

drop trigger if exists trg_profiles_protege_exclusao on public.profiles;
create trigger trg_profiles_protege_exclusao
before delete on public.profiles
for each row execute function public.sulsafe_proteger_exclusao_perfil();

-- ============================================================
-- 4. AUDITORIA DO DOSSIÊ
-- ============================================================

create table if not exists public.dossie_auditoria (
    id uuid primary key default gen_random_uuid(),
    aluno_id uuid not null references public.profiles(id) on delete cascade,
    status_anterior text,
    status_novo text not null,
    observacoes text,
    alterado_por uuid references public.profiles(id) on delete set null,
    criado_em timestamptz not null default now()
);

create index if not exists dossie_auditoria_aluno_idx
    on public.dossie_auditoria (aluno_id, criado_em desc);

alter table public.dossie_auditoria enable row level security;

create or replace function public.sulsafe_registrar_auditoria_dossie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.dossie_status is distinct from old.dossie_status
       or new.dossie_observacoes is distinct from old.dossie_observacoes
       or new.dossie_aprovado_em is distinct from old.dossie_aprovado_em
       or new.dossie_aprovado_por is distinct from old.dossie_aprovado_por then
        insert into public.dossie_auditoria (
            aluno_id,
            status_anterior,
            status_novo,
            observacoes,
            alterado_por
        ) values (
            old.id,
            old.dossie_status,
            new.dossie_status,
            new.dossie_observacoes,
            auth.uid()
        );
    end if;

    return new;
end;
$$;

revoke all on function public.sulsafe_registrar_auditoria_dossie() from public;

drop trigger if exists trg_profiles_audita_dossie on public.profiles;
create trigger trg_profiles_audita_dossie
after update on public.profiles
for each row execute function public.sulsafe_registrar_auditoria_dossie();

drop policy if exists "sulsafe_dossie_auditoria_admin_select" on public.dossie_auditoria;
create policy "sulsafe_dossie_auditoria_admin_select"
on public.dossie_auditoria
for select
to authenticated
using (public.sulsafe_is_admin());

revoke all on public.dossie_auditoria from anon, authenticated;
grant select on public.dossie_auditoria to authenticated;
grant all on public.dossie_auditoria to service_role;

-- ============================================================
-- 5. RPCS DO PROPRIO ALUNO
-- ============================================================
-- As funcoes sao recriadas para:
-- - usar a validacao completa de CPF;
-- - marcar a transacao como atualizacao legitima do proprio dossie;
-- - impedir que a trigger de protecao bloqueie o fluxo normal.

create or replace function public.atualizar_meu_dossie(
    p_nome_completo text,
    p_cpf text,
    p_data_nascimento date,
    p_cor_raca text,
    p_renda_per_capita numeric,
    p_identidade_genero text,
    p_tipo_deficiencia text,
    p_forma_acesso text,
    p_nome_mae text default null,
    p_nacionalidade text default 'Brasileira',
    p_sexo text default null,
    p_foto_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id uuid := auth.uid();
    v_cpf text;
    v_perfil public.profiles;
begin
    if v_id is null then
        raise exception 'Sessao invalida. Faca login novamente.' using errcode = '42501';
    end if;

    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou bloqueada.' using errcode = '42501';
    end if;

    v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');

    if v_cpf is null or not public.sulsafe_cpf_valido(v_cpf) then
        raise exception 'CPF invalido.' using errcode = '23514';
    end if;

    p_foto_url := nullif(btrim(coalesce(p_foto_url, '')), '');

    if p_foto_url is not null
       and p_foto_url !~ '^https?://'
       and p_foto_url not like v_id::text || '/%' then
        raise exception 'Caminho de foto invalido.' using errcode = '42501';
    end if;

    if p_data_nascimento is null then
        raise exception 'Data de nascimento e obrigatoria.' using errcode = '23514';
    end if;

    if p_data_nascimento > current_date then
        raise exception 'Data de nascimento nao pode estar no futuro.' using errcode = '23514';
    end if;

    if p_renda_per_capita is null or p_renda_per_capita < 0 then
        raise exception 'Renda per capita invalida.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_cor_raca, '')), '') is null then
        raise exception 'Cor/raca e obrigatoria.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_identidade_genero, '')), '') is null then
        raise exception 'Identidade de genero e obrigatoria.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_tipo_deficiencia, '')), '') is null then
        raise exception 'Tipo de deficiencia e obrigatorio.' using errcode = '23514';
    end if;

    if nullif(btrim(coalesce(p_forma_acesso, '')), '') is null then
        raise exception 'Forma de acesso e obrigatoria.' using errcode = '23514';
    end if;

    perform set_config('sulsafe.dossie_self_update', 'on', true);

    update public.profiles
    set nome_completo = coalesce(nullif(btrim(p_nome_completo), ''), nome_completo),
        cpf = v_cpf,
        data_nascimento = p_data_nascimento,
        cor_raca = btrim(p_cor_raca),
        renda_per_capita = p_renda_per_capita,
        identidade_genero = btrim(p_identidade_genero),
        tipo_deficiencia = btrim(p_tipo_deficiencia),
        forma_acesso = btrim(p_forma_acesso),
        nome_mae = nullif(btrim(coalesce(p_nome_mae, '')), ''),
        nacionalidade = coalesce(nullif(btrim(coalesce(p_nacionalidade, '')), ''), 'Brasileira'),
        sexo = nullif(btrim(coalesce(p_sexo, '')), ''),
        foto_url = coalesce(p_foto_url, foto_url),
        dossie_status = 'pendente',
        dossie_observacoes = null,
        dossie_aprovado_em = null,
        dossie_aprovado_por = null
    where id = v_id
    returning * into v_perfil;

    if v_perfil.id is null then
        raise exception 'Perfil nao encontrado.' using errcode = 'P0002';
    end if;

    return v_perfil;
end;
$$;

create or replace function public.definir_foto_perfil(p_path text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id uuid := auth.uid();
    v_perfil public.profiles;
begin
    if v_id is null then
        raise exception 'Sessao invalida. Faca login novamente.' using errcode = '42501';
    end if;

    if not public.sulsafe_conta_ativa() then
        raise exception 'Conta inativa ou bloqueada.' using errcode = '42501';
    end if;

    p_path := nullif(btrim(coalesce(p_path, '')), '');

    if p_path is not null
       and p_path !~ '^https?://'
       and p_path not like v_id::text || '/%' then
        raise exception 'Caminho de foto invalido.' using errcode = '42501';
    end if;

    perform set_config('sulsafe.dossie_self_update', 'on', true);

    update public.profiles
    set foto_url = p_path,
        dossie_status = 'pendente',
        dossie_observacoes = null,
        dossie_aprovado_em = null,
        dossie_aprovado_por = null
    where id = v_id
    returning * into v_perfil;

    if v_perfil.id is null then
        raise exception 'Perfil nao encontrado.' using errcode = 'P0002';
    end if;

    return v_perfil;
end;
$$;

revoke all on function public.atualizar_meu_dossie(
    text, text, date, text, numeric, text, text, text, text, text, text, text
) from public;
revoke all on function public.definir_foto_perfil(text) from public;

grant execute on function public.atualizar_meu_dossie(
    text, text, date, text, numeric, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.definir_foto_perfil(text) to authenticated;

-- ============================================================
-- 6. RLS DE PROFILES
-- ============================================================

-- Remove todas as policies antigas, inclusive as recursivas/criadas
-- antes de a RLS estar habilitada.
do $$
declare
    r record;
begin
    for r in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = 'profiles'
    loop
        execute format('drop policy %I on public.profiles', r.policyname);
    end loop;
end $$;

alter table public.profiles enable row level security;

create policy "sulsafe_profiles_select_proprio"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "sulsafe_profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.sulsafe_is_admin());

create policy "sulsafe_profiles_update_proprio"
on public.profiles
for update
to authenticated
using (id = auth.uid() and public.sulsafe_conta_ativa())
with check (id = auth.uid() and public.sulsafe_conta_ativa());

create policy "sulsafe_profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.sulsafe_is_admin())
with check (public.sulsafe_is_admin());

-- Nao ha policy de INSERT: o cadastro e feito por handle_new_user().
-- Nao ha policy de DELETE: exclusao de conta exige operacao administrativa.

revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

notify pgrst, 'reload schema';

commit;
