-- ============================================================
-- ENDURECIMENTO DA PROTECAO DE PERFIL
-- ============================================================
-- Corrige dois problemas da migration anterior:
-- 1. a trigger confiava no GUC sulsafe.dossie_self_update, que pode
--    ser definido por qualquer cliente autenticado;
-- 2. a checagem do ultimo administrador ativo nao era serializada.
--
-- A trigger passa a rodar como SECURITY INVOKER. Assim, uma atualizacao
-- feita diretamente pelo cliente executa como authenticated/anon, enquanto
-- as RPCs SECURITY DEFINER executam como o dono (postgres). O contexto
-- privilegiado deixa de depender de um valor controlavel pelo cliente.

create or replace function public.sulsafe_existe_outro_admin(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    -- FOR UPDATE forca a leitura da versao mais recente e, em REPEATABLE READ,
    -- gera falha de serializacao se outro admin foi alterado concorrentemente.
    perform 1
    from public.profiles p
    where p.id <> p_id
      and p.role::text in ('admin', 'super_admin')
      and p.status = 'ativo'
    order by p.id
    for update;

    return found;
end;
$$;

revoke all on function public.sulsafe_existe_outro_admin(uuid) from public, anon;
grant execute on function public.sulsafe_existe_outro_admin(uuid)
    to authenticated, service_role;

create or replace function public.sulsafe_proteger_perfil()
returns trigger
language plpgsql
security invoker
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
    -- Invariante: as unicas funcoes SECURITY DEFINER que escrevem em profiles
    -- sao atualizar_meu_dossie, definir_foto_perfil, auditar_dossie e o
    -- trigger handle_new_user. As tres RPCs validam sessao/perfil antes de
    -- gravar; handle_new_user apenas insere o perfil inicial.
    v_self_dossie boolean := current_user not in ('authenticated', 'anon');
begin
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_old_role := v_old->>'role';
    v_old_status := v_old->>'status';
    v_role := v_new->>'role';
    v_status := v_new->>'status';
    v_service := coalesce(auth.role(), '') = 'service_role';

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

        -- O nome do aluno so pode ser gravado pela RPC do dossie, que tambem
        -- devolve o dossie para pendente e registra auditoria. Professores e
        -- administradores nao possuem dossie e podem ajustar o proprio nome.
        if not v_self_dossie
           and v_new->>'nome_completo' is distinct from v_old->>'nome_completo' then
            if coalesce(v_old_role, 'aluno') = 'aluno' then
                raise exception 'Use a tela do dossie para alterar os dados de matricula.'
                    using errcode = '42501';
            end if;

            if nullif(btrim(coalesce(v_new->>'nome_completo', '')), '') is null then
                raise exception 'O nome nao pode ficar vazio.' using errcode = '23514';
            end if;
        end if;

        -- Dados de matricula so podem ser gravados pela RPC do dossie.
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
    -- O lock serializa duas transacoes que tentem remover administradores
    -- diferentes ao mesmo tempo.
    if v_old_role in ('admin', 'super_admin')
       and v_old_status = 'ativo'
       and (
           v_role is null
           or v_role not in ('admin', 'super_admin')
           or v_status is null
           or v_status <> 'ativo'
       ) then
        perform pg_advisory_xact_lock(20261024, 1);

        if not public.sulsafe_existe_outro_admin(old.id) then
            raise exception 'Nao e possivel remover ou bloquear o ultimo administrador ativo.'
                using errcode = '42501';
        end if;
    end if;

    return new;
end;
$$;

revoke all on function public.sulsafe_proteger_perfil() from public, anon;

drop trigger if exists trg_profiles_protege_campos on public.profiles;
create trigger trg_profiles_protege_campos
before update on public.profiles
for each row execute function public.sulsafe_proteger_perfil();

create or replace function public.sulsafe_proteger_exclusao_perfil()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if old.role::text in ('admin', 'super_admin')
       and old.status = 'ativo' then
        perform pg_advisory_xact_lock(20261024, 1);

        if not public.sulsafe_existe_outro_admin(old.id) then
            raise exception 'Nao e possivel excluir o ultimo administrador ativo.'
                using errcode = '42501';
        end if;
    end if;

    return old;
end;
$$;

revoke all on function public.sulsafe_proteger_exclusao_perfil() from public, anon;

drop trigger if exists trg_profiles_protege_exclusao on public.profiles;
create trigger trg_profiles_protege_exclusao
before delete on public.profiles
for each row execute function public.sulsafe_proteger_exclusao_perfil();

-- Recria as RPCs sem o GUC que era controlavel pelo cliente.
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
) from public, anon;
revoke all on function public.definir_foto_perfil(text) from public, anon;
revoke all on function public.auditar_dossie(uuid, text, text) from public, anon;

grant execute on function public.atualizar_meu_dossie(
    text, text, date, text, numeric, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.definir_foto_perfil(text) to authenticated;
grant execute on function public.auditar_dossie(uuid, text, text)
    to authenticated, service_role;
